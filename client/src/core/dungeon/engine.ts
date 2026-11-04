import { applyBurn, burnTickDamage, computeHit, lifestealAmount } from '../battle/damage';
import { findMonster, findStage } from '../lookup';
import type { BurnSpec, CombatStats } from '../model/battle';
import type { GameConfig } from '../model/config';
import type {
  BossPatternKind,
  DamageSource,
  DungeonBossDef,
  DungeonEvent,
  DungeonFormDef,
  DungeonInit,
  DungeonMonster,
  DungeonState,
  DungeonSummary,
  HurtSource,
  SkillId,
} from '../model/dungeon';
import type { MonsterId } from '../model/ids';
import { nextFloat } from '../rng';
import { deriveMonsterStats, monsterAbsorb, monsterGold, stageBase } from '../stats';
import { activeSynergies, dungeonRefStage, linkActive, skillSpec, synergiesUnlockedBy, upgradableSkills } from './rules';

/** 대열 자리 [앞뒤 거리, 깊이]. 0 이 맨 앞이고 범위 · 연쇄는 이 거리로 잰다 */
export const SLOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.95, -0.6],
  [0.95, 0.6],
  [1.9, -0.25],
  [1.9, 0.7],
];

/** 패턴마다 필살기로 할 수 있는 것 */
export const PATTERN_COUNTER: Record<BossPatternKind, 'block' | 'weaken' | 'break' | null> = { smash: 'block', breath: 'weaken', guard: 'break', summon: null };

const MAX_ACTIONS_PER_STEP = 100_000;
/** 비어 있던 전장에 적이 들어오면 이만큼 뒤에 첫 공격 */
const FIRST_SWING_MS = 450;
/** 자리가 없어 기다리던 적은 자리가 나고 이만큼 뒤에 들어온다 */
const REFILL_MS = 500;
/** 용병 분열탄이 남으면 같은 대상에게 이 비율로 */
const SAME_TARGET_SPLIT = 0.5;

type Action =
  | { kind: 'spawn' | 'slimeAttack' | 'slimeBurn' | 'frenzyEnd' | 'waveEnd' }
  | { kind: 'monsterAttack' | 'monsterBurn' | 'monsterPoison' | 'bossCast' | 'bossImpact' | 'guardEnd'; m: DungeonMonster }
  | { kind: 'ally'; index: number };

export function slotDistance(a: number, b: number): number {
  const [ax, ay] = SLOTS[a]!;
  const [bx, by] = SLOTS[b]!;
  return Math.hypot(ax - bx, ay - by);
}

export function waveCount(cfg: GameConfig): number {
  return cfg.dungeon.waves.monsters.length;
}

/** 첫 스킬 선택(또는 1 웨이브)으로 시작한다 */
export function createDungeon(init: DungeonInit, cfg: GameConfig): { state: DungeonState; events: DungeonEvent[] } {
  const u = cfg.dungeon.ultimate;
  const state: DungeonState = {
    id: init.runId,
    now: 0,
    level: init.level,
    rewardStage: init.rewardStage,
    assist: init.assist,
    refStage: dungeonRefStage(init.level, cfg),
    phase: 'choosing',
    phaseUntil: 0,
    wave: 0,
    wavesCleared: 0,
    slime: { stats: init.slime, hp: init.slime.maxHp, shield: 0, shieldAt: null, nextAttackAt: 0, attacks: 0, burn: null, hurtCarry: 0, frenzy: 0, frenzyUntil: 0 },
    monsters: [],
    queue: [],
    allies: init.allies.map((a) => ({ ...a, nextAttackAt: 0 })),
    skills: {},
    synergies: [],
    offer: null,
    rerolls: init.rerolls,
    offerSize: init.offerSize,
    ult: { charge: Math.min(u.max, u.start), chargedAt: 0, mul: init.chargeMul },
    focus: null,
    form: init.form,
    rng: { s: init.seed | 0 },
    seq: 0,
    kills: 0,
    rewards: { gold: 0, kills: {}, absorb: {} },
    goldMul: init.goldMul,
    record: { damage: {}, ultimates: 0, blocked: 0, bossKills: 0, taken: {}, casts: {}, countered: {}, missed: 0, killedBy: null },
  };
  const events: DungeonEvent[] = [];
  nextWaveOrPick(state, cfg, events);
  return { state, events };
}

export function isDungeonOver(state: DungeonState): boolean {
  return state.phase === 'cleared' || state.phase === 'failed';
}

/** 스킬을 고르는 중이거나 끝났다 — 시간이 흐르지 않는다 */
function halted(state: DungeonState): boolean {
  return state.phase === 'choosing' || isDungeonOver(state);
}

export function dungeonUltReady(state: DungeonState, cfg: GameConfig): boolean {
  return state.ult.charge >= cfg.dungeon.ultimate.max;
}

export function summarizeDungeon(state: DungeonState): DungeonSummary {
  return { runId: state.id, level: state.level, waves: state.wavesCleared, cleared: state.phase === 'cleared', bossKills: state.record.bossKills, rewards: state.rewards, synergies: state.synergies };
}

/**
 * dtMs 만큼 진행하고 이벤트를 돌려준다. 행동을 예정 시각 순서로 처리하므로 dt 를 어떻게 나눠도 결과가 같다.
 * 스킬을 고르는 동안과 끝난 뒤에는 시간이 흐르지 않는다
 */
export function stepDungeon(state: DungeonState, dtMs: number, cfg: GameConfig): DungeonEvent[] {
  const events: DungeonEvent[] = [];
  if (halted(state)) return events;
  const until = state.now + Math.max(0, dtMs);
  for (let i = 0; ; i++) {
    if (i >= MAX_ACTIONS_PER_STEP) throw new Error('던전 행동이 너무 많다 — 간격 설정을 확인');
    const next = nextAction(state, cfg);
    if (!next || next.at > until) break;
    advanceTo(state, next.at, cfg, events);
    perform(state, next.action, cfg, events);
    if (halted(state)) return events;
  }
  advanceTo(state, until, cfg, events);
  return events;
}

/** 제시된 스킬 하나를 얻고(또는 올리고) 다음 웨이브를 연다. 고를 수 없으면 null */
export function chooseDungeonSkill(state: DungeonState, skill: SkillId, cfg: GameConfig): DungeonEvent[] | null {
  if (state.phase !== 'choosing' || !state.offer?.includes(skill)) return null;
  const events: DungeonEvent[] = [];
  const level = (state.skills[skill] ?? 0) + 1;
  state.skills = { ...state.skills, [skill]: level };
  events.push({ type: 'dSkill', at: state.now, skill, level });
  if (skill === 'shield' && level === 1) state.slime.shieldAt = state.now;
  for (const id of activeSynergies(state.skills, cfg)) {
    if (state.synergies.includes(id)) continue;
    state.synergies = [...state.synergies, id];
    events.push({ type: 'dSynergy', at: state.now, synergy: id });
  }
  startWave(state, cfg, events);
  return events;
}

/** 다시 뽑기 — 되도록 지금 제시와 다른 스킬로 */
export function rerollDungeonOffer(state: DungeonState, cfg: GameConfig): DungeonEvent[] | null {
  if (state.phase !== 'choosing' || state.rerolls <= 0 || !state.offer) return null;
  state.rerolls -= 1;
  state.offer = rollOffer(state, cfg, state.offer);
  return [{ type: 'dOffer', at: state.now, skills: state.offer, rerolls: state.rerolls }];
}

/** 플레이어가 고른 공격 대상. null 이면 맨 앞 적 */
export function setDungeonFocus(state: DungeonState, seq: number | null): boolean {
  if (seq !== null && !state.monsters.some((m) => m.seq === seq)) return false;
  state.focus = seq;
  return true;
}

/**
 * 필살기 — 모든 적에게 큰 피해. 보스가 내려찍기 · 경화를 준비 중이면 끊고(경직), 경화를 깨고, 화염 숨결은 약하게 만든다.
 * 게이지가 덜 찼거나 싸우는 중이 아니면 null
 */
export function useDungeonUltimate(state: DungeonState, cfg: GameConfig): DungeonEvent[] | null {
  const u = cfg.dungeon.ultimate;
  if (state.phase !== 'fighting' || state.monsters.length === 0 || state.ult.charge < u.max) return null;
  const events: DungeonEvent[] = [];
  const at = state.now;
  state.ult.charge = 0;
  state.record.ultimates += 1;
  let blocked = false;
  let broke = false;
  let weakened = false;
  for (const m of state.monsters) {
    const b = m.boss;
    if (!b) continue;
    const kind = b.casting?.pattern.kind;
    if (kind === 'smash' || kind === 'guard') {
      b.casting = null;
      b.next += 1;
      if (kind === 'smash') blocked = true;
      else broke = true;
      stagger(state, m, cfg);
    } else if (kind === 'breath' && b.casting) {
      b.casting.weakened = true;
      weakened = true;
    }
    if (b.guardUntil > at) {
      b.guardUntil = 0;
      broke = true;
      stagger(state, m, cfg);
      events.push({ type: 'dGuard', at, seq: m.seq, on: false });
    }
  }
  const r = state.record;
  if (blocked || broke) r.blocked += 1;
  if (blocked) r.countered.smash = (r.countered.smash ?? 0) + 1;
  if (broke) r.countered.guard = (r.countered.guard ?? 0) + 1;
  if (weakened) r.countered.breath = (r.countered.breath ?? 0) + 1;
  const s = state.slime;
  const hits = state.monsters.map((m) => ({ m, raw: s.stats.attack * u.damageMul * (1 - m.stats.damageReduction * (1 - u.armorPierce)) }));
  const total = hits.reduce((sum, h) => sum + Math.max(1, Math.floor(incoming(state, h.m, h.raw, cfg))), 0);
  events.push({ type: 'dUltimate', at, total, blocked, broke, weakened });
  for (const h of hits) damageMonster(state, h.m, h.raw, 'ultimate', false, cfg, events);
  const form = formOf(state, cfg);
  if (form?.ultHeal) healSlime(state, Math.min(Math.floor(total * form.ultHeal), Math.floor(s.stats.maxHp / 2)), events);
  if (form?.ultShield && state.phase === 'fighting') {
    s.shield += Math.round(s.stats.maxHp * form.ultShield * guardBoost(state, cfg));
    events.push({ type: 'dShield', at, amount: s.shield });
  }
  if (form?.ultBurn) for (const m of [...state.monsters]) addBurn(state, m, form.ultBurn, cfg, events);
  return events;
}

// ── 진행 ────────────────────────────────────────────────

function nextWaveOrPick(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  if (cfg.dungeon.picks.beforeWaves.includes(state.wave + 1)) {
    const offer = rollOffer(state, cfg, []);
    if (offer.length > 0) {
      state.phase = 'choosing';
      state.offer = offer;
      events.push({ type: 'dOffer', at: state.now, skills: offer, rerolls: state.rerolls });
      return;
    }
  }
  startWave(state, cfg, events);
}

/** 무게를 둔 비복원 추출 — 형태와 어울리는 스킬 ×2, 지금 스킬과 시너지가 되는 스킬 ×1.5 */
function rollOffer(state: DungeonState, cfg: GameConfig, exclude: readonly SkillId[]): SkillId[] {
  const all = upgradableSkills(state.skills, cfg);
  const fresh = all.filter((id) => !exclude.includes(id));
  const pool = fresh.length >= Math.min(state.offerSize, all.length) ? fresh : all;
  const affinity = state.form ? cfg.dungeon.forms[state.form]?.affinity : undefined;
  const weighted = pool.map((id) => ({ id, w: (id === affinity ? 2 : 1) * (synergiesUnlockedBy(id, state.skills, cfg).length > 0 ? 1.5 : 1) }));
  const offer: SkillId[] = [];
  while (offer.length < state.offerSize && weighted.length > 0) {
    let roll = nextFloat(state.rng) * weighted.reduce((sum, x) => sum + x.w, 0);
    let i = 0;
    for (; i < weighted.length - 1; i++) {
      roll -= weighted[i]!.w;
      if (roll < 0) break;
    }
    offer.push(weighted[i]!.id);
    weighted.splice(i, 1);
  }
  return offer;
}

function startWave(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  const w = cfg.dungeon.waves;
  state.wave += 1;
  state.phase = 'fighting';
  state.offer = null;
  state.ult.chargedAt = state.now;
  const at0 = state.now + w.startMs;
  const bossId = w.bosses[String(state.wave)] ?? null;
  if (bossId) {
    state.queue = [{ defId: cfg.dungeon.bosses[bossId]!.monster, at: at0, boss: bossId }];
  } else {
    const pool = monsterPool(state, cfg);
    const count = w.monsters[state.wave - 1] ?? 0;
    state.queue = Array.from({ length: count }, (_, i) => ({
      defId: pool[Math.min(pool.length - 1, Math.floor(nextFloat(state.rng) * pool.length))]!,
      at: at0 + (i < w.burst ? i * 250 : (w.burst - 1) * 250 + (i - w.burst + 1) * w.gapMs),
      boss: null,
    }));
  }
  events.push({ type: 'dWave', at: state.now, wave: state.wave, boss: bossId });
}

/** 기준 스테이지가 속한 장의 일반 몬스터 */
function monsterPool(state: DungeonState, cfg: GameConfig): MonsterId[] {
  const chapter = findStage(cfg, state.refStage).chapter;
  const ids = new Set<MonsterId>();
  for (const st of cfg.stages) if (st.chapter === chapter) for (const sp of st.spawns) ids.add(sp.monster);
  return [...ids];
}

function checkWaveEnd(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  if (state.phase !== 'fighting' || state.monsters.length > 0 || state.queue.length > 0) return;
  const s = state.slime;
  state.wavesCleared = state.wave;
  s.burn = null;
  if (state.wave >= waveCount(cfg)) {
    state.phase = 'cleared';
    events.push({ type: 'dCleared', at: state.now });
    return;
  }
  healSlime(state, Math.floor(s.stats.maxHp * cfg.dungeon.waves.clearHeal), events);
  state.phase = 'waveClear';
  state.phaseUntil = state.now + cfg.dungeon.waves.clearDelayMs;
  events.push({ type: 'dWaveClear', at: state.now, wave: state.wave });
}

// ── 시간 · 행동 순서 ─────────────────────────────────────

/** 같은 시각이면 지속 피해 → 보스 패턴 발동 → 슬라임 → 적 → 용병 → 광폭 · 경화 해제 → 보스 예고 → 등장 순 */
function nextAction(state: DungeonState, cfg: GameConfig): { at: number; action: Action } | null {
  if (state.phase === 'waveClear') return { at: state.phaseUntil, action: { kind: 'waveEnd' } };
  if (state.phase !== 'fighting') return null;
  const s = state.slime;
  const fighting = state.monsters.length > 0;
  const c: [number | null | undefined, Action][] = [[s.burn?.nextTickAt, { kind: 'slimeBurn' }]];
  for (const m of state.monsters) {
    c.push([m.burn?.nextTickAt, { kind: 'monsterBurn', m }], [m.poison?.nextTickAt, { kind: 'monsterPoison', m }]);
  }
  for (const m of state.monsters) if (m.boss?.casting) c.push([m.boss.casting.impactAt, { kind: 'bossImpact', m }]);
  if (fighting) c.push([s.nextAttackAt, { kind: 'slimeAttack' }]);
  for (const m of state.monsters) c.push([m.nextAttackAt, { kind: 'monsterAttack', m }]);
  if (fighting) state.allies.forEach((a, index) => c.push([a.nextAttackAt, { kind: 'ally', index }]));
  if (s.frenzy > 0) c.push([s.frenzyUntil, { kind: 'frenzyEnd' }]);
  for (const m of state.monsters) {
    if (m.boss && m.boss.guardUntil > 0) c.push([m.boss.guardUntil, { kind: 'guardEnd', m }]);
    if (m.boss && !m.boss.casting) c.push([m.boss.nextAt, { kind: 'bossCast', m }]);
  }
  if (state.queue.length > 0 && state.monsters.length < maxOnField(cfg)) c.push([Math.max(state.queue[0]!.at, state.now), { kind: 'spawn' }]);
  let best: { at: number; action: Action } | null = null;
  for (const [at, action] of c) if (at !== null && at !== undefined && (best === null || at < best.at)) best = { at, action };
  return best;
}

/** 시계를 옮긴다. 싸우는 동안에만 필살기가 찬다 */
function advanceTo(state: DungeonState, t: number, cfg: GameConfig, events: DungeonEvent[]): void {
  const elapsed = t - state.ult.chargedAt;
  state.now = t;
  state.ult.chargedAt = t;
  if (state.phase === 'fighting' && elapsed > 0) gainCharge(state, (cfg.dungeon.ultimate.perSecond * elapsed) / 1000, cfg, events);
}

function perform(state: DungeonState, action: Action, cfg: GameConfig, events: DungeonEvent[]): void {
  switch (action.kind) {
    case 'waveEnd':
      nextWaveOrPick(state, cfg, events);
      break;
    case 'spawn':
      spawnNext(state, cfg, events);
      break;
    case 'slimeAttack':
      slimeAttack(state, cfg, events);
      break;
    case 'slimeBurn':
      slimeBurnTick(state, cfg, events);
      break;
    case 'frenzyEnd':
      state.slime.frenzy = 0;
      events.push({ type: 'dFrenzy', at: state.now, stacks: 0 });
      break;
    case 'monsterAttack':
      monsterAttack(state, action.m, cfg, events);
      break;
    case 'monsterBurn':
    case 'monsterPoison':
      dotTick(state, action.m, action.kind === 'monsterBurn' ? 'burn' : 'poison', cfg, events);
      break;
    case 'bossCast':
      bossCast(state, action.m, cfg, events);
      break;
    case 'bossImpact':
      bossImpact(state, action.m, cfg, events);
      break;
    case 'guardEnd':
      action.m.boss!.guardUntil = 0;
      events.push({ type: 'dGuard', at: state.now, seq: action.m.seq, on: false });
      break;
    case 'ally':
      allyAttack(state, action.index, cfg, events);
      break;
  }
}

// ── 등장 ────────────────────────────────────────────────

function maxOnField(cfg: GameConfig): number {
  return Math.min(SLOTS.length, cfg.dungeon.waves.maxOnField);
}

function spawnNext(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  const item = state.queue.shift()!;
  const taken = new Set(state.monsters.map((m) => m.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  const def = findMonster(cfg, item.defId);
  const bossDef = item.boss ? cfg.dungeon.bosses[item.boss]! : null;
  const stats = bossDef ? bossStats(bossDef, state, cfg) : waveStats(item.defId, state, cfg);
  const now = state.now;
  const wasEmpty = state.monsters.length === 0;
  state.monsters.push({
    seq: ++state.seq,
    defId: item.defId,
    family: def.family,
    stats,
    hp: stats.maxHp,
    slot,
    // 한꺼번에 때리지 않게 첫 공격을 흩는다
    nextAttackAt: now + Math.round(stats.attackIntervalMs * (0.6 + 0.5 * nextFloat(state.rng))),
    attacks: 0,
    enraged: false,
    burn: null,
    poison: null,
    stunUntil: 0,
    gold: Math.max(1, Math.round(monsterGold(item.defId, state.rewardStage, cfg) * state.goldMul * cfg.dungeon.rewards.goldMul)),
    absorb: monsterAbsorb(item.defId, state.rewardStage, cfg),
    boss: bossDef
      ? { id: item.boss!, next: 0, nextAt: now + bossDef.firstPatternMs, casting: null, guardUntil: 0, guardReduction: 0, staggerUntil: 0, enraged: false }
      : null,
  });
  if (wasEmpty) {
    state.slime.nextAttackAt = Math.max(state.slime.nextAttackAt, now + FIRST_SWING_MS);
    state.allies.forEach((a, i) => (a.nextAttackAt = now + Math.round(a.intervalMs * (0.5 + 0.2 * i))));
  }
  events.push({ type: 'dSpawn', at: now, seq: state.seq, defId: item.defId, slot, maxHp: stats.maxHp, boss: item.boss });
  // 보스가 나오면 필살기가 찬다 — 첫 큰 공격을 끊을 기회. 처음 깨는 중이면 다 채워 준다
  if (bossDef) {
    gainCharge(state, cfg.dungeon.ultimate.bossArrival ?? 0, cfg, events);
    if (state.assist && state.ult.charge < cfg.dungeon.assist.bossCharge) setCharge(state, cfg.dungeon.assist.bossCharge, cfg, events);
  }
}

/** 일반 몬스터 = 기준 스테이지 몬스터 × 던전 배율 × 웨이브 상승 */
function waveStats(defId: MonsterId, state: DungeonState, cfg: GameConfig): CombatStats {
  const w = cfg.dungeon.waves;
  const base = deriveMonsterStats(defId, state.refStage, cfg);
  const k = Math.max(0, state.wave - 1);
  // 느리게 · 세게 — 초당 피해는 그대로 두고 한 방을 키워 「최소 1 피해」에 덜 걸리게
  return {
    ...base,
    maxHp: Math.max(1, Math.round(base.maxHp * w.hpMul * (1 + w.hpPerWave * k))),
    attack: base.attack * w.atkMul * w.intervalMul * (1 + w.atkPerWave * k),
    attackIntervalMs: Math.round(base.attackIntervalMs * w.intervalMul),
  };
}

function bossStats(def: DungeonBossDef, state: DungeonState, cfg: GameConfig): CombatStats {
  const base = stageBase(cfg, state.refStage);
  return {
    maxHp: Math.max(1, Math.round(base.hp * def.hpMul)),
    attack: Math.max(1, Math.round(base.atk * def.atkMul)),
    attackIntervalMs: def.attackIntervalMs,
    critChance: 0,
    critMultiplier: 1,
    lifesteal: 0,
    damageReduction: def.damageReduction,
    burn: null,
    heavyAttack: null,
    enrage: null,
  };
}

// ── 슬라임 공격 · 스킬 ────────────────────────────────────

function slimeAttack(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  const s = state.slime;
  const target = pickTarget(state);
  if (!target) return;
  const fr = skillSpec(state.skills, 'frenzy', cfg);
  const stacks = frenzyStacks(state, cfg);
  s.nextAttackAt = state.now + Math.max(100, Math.round(s.stats.attackIntervalMs / (1 + (fr ? fr.speed * stacks : 0))));
  s.attacks += 1;
  const stats: CombatStats = fr && stacks > 0 ? { ...s.stats, attack: s.stats.attack * (1 + fr.damage * stacks) } : s.stats;
  const split = skillSpec(state.skills, 'split', cfg);
  const extras = split ? splitTargets(state, target, split.extra) : [];
  const center = target.slot;
  events.push({ type: 'dAttack', at: state.now, target: target.seq, split: extras.map((m) => m.seq) });

  basicHit(state, target, stats, 1, 'hit', 0, cfg, events);
  if (split) {
    const syn = cfg.dungeon.synergies;
    const venom = state.synergies.includes('venomVolley') ? syn.venomVolley.params.extraStacks : 0;
    const scatter = state.synergies.includes('scatterBolt') ? syn.scatterBolt.params : null;
    for (const m of extras) {
      basicHit(state, m, stats, split.mul * (m === target ? split.same : 1), 'split', venom, cfg, events);
      if (scatter && nextFloat(state.rng) < scatter.chance) lightning(state, m.slot, stats, { jumps: 1, mul: scatter.mul, falloff: 1, stunChance: 0, stunMs: 0 }, m, false, true, cfg, events);
    }
  }
  const fb = skillSpec(state.skills, 'fireburst', cfg);
  if (fb && s.attacks % fb.every === 0) explosion(state, center, target.seq, stats, fb, cfg, events);
  const ch = skillSpec(state.skills, 'chain', cfg);
  if (ch) {
    const storm = state.synergies.includes('stormChain');
    const maxed = storm && fr !== null && stacks >= fr.maxStacks;
    if (maxed || s.attacks % ch.every === 0) {
      const bonus = storm ? Math.floor(stacks / cfg.dungeon.synergies.stormChain.params.perStacks) : 0;
      lightning(state, center, stats, { ...ch, jumps: ch.jumps + bonus }, null, storm, false, cfg, events);
    }
  }
}

/** 직격 한 발 — 치명타 · 흡혈 · 화상 확률 · 독. 기본 공격이면 화염 슬라임의 불꽃이 번진다 */
function basicHit(state: DungeonState, m: DungeonMonster, stats: CombatStats, mul: number, source: 'hit' | 'split', extraPoison: number, cfg: GameConfig, events: DungeonEvent[]): void {
  if (m.hp <= 0) return;
  const critRoll = stats.critChance > 0 ? nextFloat(state.rng) : 1;
  const hit = computeHit(stats, m.stats, critRoll, mul);
  const dealt = damageMonster(state, m, hit.amount, source, hit.crit, cfg, events);
  // 여러 적을 한꺼번에 치는 던전에서는 흡혈이 사냥터보다 훨씬 세다 — lifesteal 배율로 낮춘다
  if (stats.lifesteal > 0) healSlime(state, lifestealAmount(dealt, stats.lifesteal * cfg.dungeon.lifesteal), events);
  if (m.hp > 0) {
    const burn = state.slime.stats.burn;
    if (burn && nextFloat(state.rng) < burn.chance) addBurn(state, m, 1, cfg, events);
    addPoison(state, m, 1 + extraPoison, cfg, events);
  }
  const form = formOf(state, cfg);
  if (source === 'hit' && form?.splash) {
    for (const o of [...state.monsters]) {
      if (o === m || o.hp <= 0 || slotDistance(o.slot, m.slot) > (form.splashRadius ?? 1)) continue;
      damageMonster(state, o, computeHit(stats, o.stats, 1, form.splash).amount, 'splash', false, cfg, events);
    }
  }
}

/** 스킬 피해 한 번 — 기본 공격처럼 치명타가 터진다 (치명타가 오를수록 범위 스킬도 강해진다) */
function skillHit(state: DungeonState, m: DungeonMonster, stats: CombatStats, mul: number, source: DamageSource, cfg: GameConfig, events: DungeonEvent[]): void {
  const hit = computeHit(stats, m.stats, stats.critChance > 0 ? nextFloat(state.rng) : 1, mul);
  const dealt = damageMonster(state, m, hit.amount, source, hit.crit, cfg, events);
  const steal = stats.lifesteal * cfg.dungeon.lifesteal * cfg.dungeon.skillLifesteal;
  if (steal > 0) healSlime(state, lifestealAmount(dealt, steal), events);
}

/** 대상과 가까운 다른 적부터. 모자라면 같은 대상에게 */
function splitTargets(state: DungeonState, target: DungeonMonster, count: number): DungeonMonster[] {
  const others = state.monsters.filter((m) => m !== target && m.hp > 0).sort((a, b) => slotDistance(a.slot, target.slot) - slotDistance(b.slot, target.slot) || a.seq - b.seq);
  const picks = others.slice(0, count);
  while (picks.length < count && target.hp > 0) picks.push(target);
  return picks;
}

/** 폭발 — 중심의 대상은 center 만큼 더 아프다 (혼자 남은 보스에게도 쓸모 있게) */
function explosion(state: DungeonState, slot: number, seq: number, stats: CombatStats, fb: { mul: number; radius: number; burn: boolean; center: number }, cfg: GameConfig, events: DungeonEvent[]): void {
  const { radius, burn } = fb;
  const toxic = state.synergies.includes('toxicBlast') ? cfg.dungeon.synergies.toxicBlast.params : null;
  events.push({ type: 'dExplosion', at: state.now, seq, slot, radius, toxic: toxic !== null });
  for (const m of [...state.monsters]) {
    if (m.hp <= 0 || slotDistance(m.slot, slot) > radius + 1e-9) continue;
    const mul = fb.mul * (m.seq === seq ? 1 + fb.center : 1);
    const k = toxic && m.poison ? mul * (1 + toxic.bonus) : mul;
    skillHit(state, m, stats, k, 'explosion', cfg, events);
    if (m.hp <= 0) continue;
    if (toxic) addPoison(state, m, toxic.stacks, cfg, events);
    if (burn) addBurn(state, m, 1, cfg, events);
  }
}

/**
 * 번개 — fromSlot 에서 가장 가까운 적부터 jumps 번 더 튄다. origin 이 있으면 그 적에서 출발하고 그 적은 치지 않는다 (산탄 번개)
 */
function lightning(
  state: DungeonState,
  fromSlot: number,
  stats: CombatStats,
  spec: { jumps: number; mul: number; falloff: number; stunChance: number; stunMs: number },
  origin: DungeonMonster | null,
  storm: boolean,
  mini: boolean,
  cfg: GameConfig,
  events: DungeonEvent[],
): void {
  const path: DungeonMonster[] = [];
  let pos = fromSlot;
  const count = origin ? spec.jumps : spec.jumps + 1;
  for (let i = 0; i < count; i++) {
    const next = nearest(
      state.monsters.filter((m) => m.hp > 0 && m !== origin && !path.includes(m)),
      pos,
    );
    if (!next) break;
    path.push(next);
    pos = next.slot;
  }
  if (path.length === 0) return;
  events.push({ type: 'dLightning', at: state.now, path: [...(origin ? [origin.seq] : []), ...path.map((m) => m.seq)], storm, mini });
  let k = spec.mul;
  for (const m of path) {
    if (m.hp > 0) {
      skillHit(state, m, stats, k, 'lightning', cfg, events);
      if (m.hp > 0 && !m.boss && spec.stunChance > 0 && nextFloat(state.rng) < spec.stunChance) {
        m.stunUntil = Math.max(m.stunUntil, state.now + spec.stunMs);
        m.nextAttackAt = Math.max(m.nextAttackAt, m.stunUntil);
        events.push({ type: 'dStatus', at: state.now, seq: m.seq, status: 'stun', stacks: 1 });
      }
    }
    k *= spec.falloff;
  }
}

function addPoison(state: DungeonState, m: DungeonMonster, stacks: number, cfg: GameConfig, events: DungeonEvent[]): void {
  const p = skillSpec(state.skills, 'poison', cfg);
  if (!p || stacks <= 0 || m.hp <= 0) return;
  // 독은 치명타가 터지지 않는다 — 대신 치명타 기대값만큼 세진다 (치명타가 오르는 후반에도 쓸모 있게)
  const st = state.slime.stats;
  const dps = st.attack * p.dps * (1 + st.critChance * (st.critMultiplier - 1));
  const endsAt = state.now + p.durationMs;
  if (m.poison) {
    m.poison = { ...m.poison, stacks: Math.min(p.maxStacks, m.poison.stacks + stacks), dpsPerStack: Math.max(m.poison.dpsPerStack, dps), endsAt };
    return;
  }
  m.poison = { stacks: Math.min(p.maxStacks, stacks), dpsPerStack: dps, endsAt, nextTickAt: state.now + cfg.balance.battle.burnTickMs };
  events.push({ type: 'dStatus', at: state.now, seq: m.seq, status: 'poison', stacks: m.poison.stacks });
}

/** 슬라임이 거는 화상 — 화염 숙련 수치와 던전 기본 수치 중 센 쪽 */
function addBurn(state: DungeonState, m: DungeonMonster, stacks: number, cfg: GameConfig, events: DungeonEvent[]): void {
  if (stacks <= 0 || m.hp <= 0) return;
  const own = state.slime.stats.burn;
  const d = cfg.dungeon.burn;
  const spec: BurnSpec = {
    chance: 1,
    dpsRatio: Math.max(own?.dpsRatio ?? 0, d.dpsRatio),
    durationMs: Math.max(own?.durationMs ?? 0, d.durationMs),
    maxStacks: Math.max(own?.maxStacks ?? 0, d.maxStacks),
  };
  const first = m.burn === null;
  for (let i = 0; i < stacks; i++) m.burn = applyBurn(m.burn, spec, state.slime.stats.attack, state.now, cfg.balance.battle.burnTickMs);
  if (first) events.push({ type: 'dStatus', at: state.now, seq: m.seq, status: 'burn', stacks: m.burn!.stacks });
}

function dotTick(state: DungeonState, m: DungeonMonster, kind: 'burn' | 'poison', cfg: GameConfig, events: DungeonEvent[]): void {
  const dot = kind === 'burn' ? m.burn : m.poison;
  if (!dot) return;
  const tick = cfg.balance.battle.burnTickMs;
  const amount = burnTickDamage(dot, tick);
  dot.nextTickAt += tick;
  if (dot.nextTickAt > dot.endsAt) {
    if (kind === 'burn') m.burn = null;
    else m.poison = null;
  }
  damageMonster(state, m, amount, kind, false, cfg, events);
}

function frenzyStacks(state: DungeonState, cfg: GameConfig): number {
  const fr = skillSpec(state.skills, 'frenzy', cfg);
  if (!fr) return 0;
  if (fr.lowHpFull && state.slime.hp <= state.slime.stats.maxHp / 2) return fr.maxStacks;
  return state.slime.frenzy;
}

/** 보호막 — HP 가 기준 아래로 떨어지면 펼친다. 깨지기 전에는 다시 펴지 않고, 편 뒤에는 대기시간 */
function tryShield(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  const s = state.slime;
  const sh = skillSpec(state.skills, 'shield', cfg);
  if (!sh || s.shield > 0 || s.shieldAt === null || state.now < s.shieldAt || s.hp > s.stats.maxHp * sh.hpBelow) return;
  s.shield = Math.round(s.stats.maxHp * sh.ratio * guardBoost(state, cfg));
  s.shieldAt = state.now + sh.cooldownMs;
  events.push({ type: 'dShield', at: state.now, amount: s.shield });
}

/** 보호막이 깨지면 — 3단계 충격파 · 화염 방패 */
function shieldBreak(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  const shock = skillSpec(state.skills, 'shield', cfg)?.shockwave ?? 0;
  const flame = state.synergies.includes('flameShield') ? cfg.dungeon.synergies.flameShield.params : null;
  events.push({ type: 'dShieldBreak', at: state.now, shockwave: shock > 0, flame: flame !== null });
  const stats = state.slime.stats;
  for (const m of [...state.monsters]) {
    if (shock > 0 && m.hp > 0) skillHit(state, m, stats, shock, 'shockwave', cfg, events);
    if (flame && m.hp > 0) {
      skillHit(state, m, stats, flame.mul, 'explosion', cfg, events);
      addBurn(state, m, flame.burnStacks, cfg, events);
    }
  }
}

// ── 용병 ────────────────────────────────────────────────

/** 용병 지원 공격 — 슬라임 공격력 × 비율. 연계가 켜져 있으면 회복 · 화상 · 분열이 붙는다 */
function allyAttack(state: DungeonState, index: number, cfg: GameConfig, events: DungeonEvent[]): void {
  const ally = state.allies[index]!;
  ally.nextAttackAt += ally.intervalMs;
  const target = pickTarget(state);
  if (!target) return;
  const stats: CombatStats = { ...state.slime.stats, attack: Math.max(1, Math.round(state.slime.stats.attack * ally.power)), critChance: 0 };
  const links = cfg.dungeon.links.filter((l) => linkActive(l, ally.preset, state.form, state.skills));
  const splitLink = links.find((l) => l.effect.kind === 'allySplit')?.effect;
  const extras = splitLink?.kind === 'allySplit' ? splitTargets(state, target, splitLink.extra) : [];
  events.push({ type: 'dAllyAttack', at: state.now, index, target: target.seq });
  const dealt = damageMonster(state, target, computeHit(stats, target.stats, 1).amount, 'ally', false, cfg, events);
  for (const { effect: e } of links) {
    if (e.kind === 'allyHeal') healSlime(state, Math.floor(dealt * e.ratio), events);
    else if (e.kind === 'allyBurn') addBurn(state, target, e.stacks, cfg, events);
    else if (e.kind === 'allySplit') {
      for (const m of extras) if (m.hp > 0) damageMonster(state, m, computeHit(stats, m.stats, 1, e.mul * (m === target ? SAME_TARGET_SPLIT : 1)).amount, 'ally', false, cfg, events);
    }
  }
}

/** 골렘 용병 연계 — 보호막 · 반격 배율 */
function guardBoost(state: DungeonState, cfg: GameConfig): number {
  let boost = 1;
  for (const ally of state.allies) {
    for (const l of cfg.dungeon.links) if (l.effect.kind === 'guardBoost' && linkActive(l, ally.preset, state.form, state.skills)) boost += l.effect.ratio;
  }
  return boost;
}

// ── 적의 공격 · 보스 ─────────────────────────────────────

function monsterAttack(state: DungeonState, m: DungeonMonster, cfg: GameConfig, events: DungeonEvent[]): void {
  const now = state.now;
  const b = m.boss;
  // 기절 · 패턴 준비 · 경직 중에는 미룬다
  if (m.stunUntil > now || (b && (b.casting || b.staggerUntil > now))) {
    m.nextAttackAt = Math.max(now + 300, m.stunUntil, b?.staggerUntil ?? 0, b?.casting ? b.casting.impactAt + 500 : 0);
    return;
  }
  m.nextAttackAt = now + m.stats.attackIntervalMs;
  m.attacks += 1;
  const heavySpec = m.stats.heavyAttack;
  const heavy = heavySpec !== null && m.attacks % heavySpec.every === 0;
  const amount = carryHurt(state, m.stats.attack * (heavy ? heavySpec.multiplier : 1) * (1 - state.slime.stats.damageReduction));
  events.push({ type: 'dMonsterAttack', at: now, seq: m.seq });
  if (amount > 0) hurtSlime(state, amount, 'hit', heavy, m, cfg, events);
  if (state.phase !== 'fighting' || m.hp <= 0) return;
  if (m.stats.lifesteal > 0) m.hp = Math.min(m.stats.maxHp, m.hp + lifestealAmount(amount, m.stats.lifesteal));
  const burn = m.stats.burn;
  if (burn && nextFloat(state.rng) < burn.chance) state.slime.burn = applyBurn(state.slime.burn, burn, m.stats.attack, now, cfg.balance.battle.burnTickMs);
}

function bossCast(state: DungeonState, m: DungeonMonster, cfg: GameConfig, events: DungeonEvent[]): void {
  const b = m.boss!;
  const def = cfg.dungeon.bosses[b.id]!;
  const pattern = def.cycle[b.next % def.cycle.length]!;
  const windup = Math.round(pattern.windupMs * (b.enraged ? def.enrage.windupMul : 1) * (state.assist ? cfg.dungeon.assist.windupMul : 1));
  b.casting = { pattern, startedAt: state.now, impactAt: state.now + windup, weakened: false };
  state.record.casts[pattern.kind] = (state.record.casts[pattern.kind] ?? 0) + 1;
  events.push({ type: 'dBossCast', at: state.now, seq: m.seq, pattern: pattern.kind, impactAt: b.casting.impactAt, counter: PATTERN_COUNTER[pattern.kind] });
}

function bossImpact(state: DungeonState, m: DungeonMonster, cfg: GameConfig, events: DungeonEvent[]): void {
  const b = m.boss!;
  const cast = b.casting!;
  const def = cfg.dungeon.bosses[b.id]!;
  const now = state.now;
  b.casting = null;
  b.next += 1;
  b.nextAt = now + Math.round(def.patternGapMs * (b.enraged ? def.enrage.gapMul : 1));
  const p = cast.pattern;
  events.push({ type: 'dBossImpact', at: now, seq: m.seq, pattern: p.kind, weakened: cast.weakened });
  if ((p.kind === 'smash' || p.kind === 'breath') && !cast.weakened && dungeonUltReady(state, cfg)) state.record.missed += 1;
  switch (p.kind) {
    case 'smash':
      hurtSlime(state, patternDamage(m, state, p.mul, p.hpRatio), 'smash', true, m, cfg, events);
      break;
    case 'breath': {
      const k = cast.weakened ? p.weakenTo : 1;
      hurtSlime(state, patternDamage(m, state, p.mul, p.hpRatio) * k, 'breath', true, null, cfg, events);
      if (state.phase !== 'fighting') break;
      const spec: BurnSpec = { chance: 1, ...cfg.dungeon.burn };
      for (let i = 0; i < Math.round(p.burnStacks * k); i++) state.slime.burn = applyBurn(state.slime.burn, spec, m.stats.attack, now, cfg.balance.battle.burnTickMs);
      break;
    }
    case 'guard':
      b.guardUntil = now + p.durationMs;
      b.guardReduction = p.reduction;
      b.nextAt = Math.max(b.nextAt, b.guardUntil);
      events.push({ type: 'dGuard', at: now, seq: m.seq, on: true });
      break;
    case 'summon':
      for (let i = 0; i < p.count; i++) state.queue.push({ defId: p.monster, at: now + 200 + i * 250, boss: null });
      break;
  }
}

/** 큰 패턴의 피해 — 보스 공격력 몫 + 슬라임 최대 HP 몫. 강해져도 무시할 수 없게 HP 비율이 섞인다. 피해감소는 받는다 */
function patternDamage(m: DungeonMonster, state: DungeonState, mul: number, hpRatio: number): number {
  const s = state.slime.stats;
  return (m.stats.attack * mul + s.maxHp * hpRatio) * (1 - s.damageReduction);
}

/** 차단 · 경화 파괴 뒤 경직 — 다음 패턴이 밀리고 더 아프게 맞는다 */
function stagger(state: DungeonState, m: DungeonMonster, cfg: GameConfig): void {
  const b = m.boss!;
  b.staggerUntil = state.now + cfg.dungeon.ultimate.staggerMs;
  b.nextAt = Math.max(b.nextAt, b.staggerUntil + 600);
}

// ── 피해 · 회복 · 처치 ───────────────────────────────────

/** 보스의 경화 · 경직을 반영한 받는 피해 */
function incoming(state: DungeonState, m: DungeonMonster, raw: number, cfg: GameConfig): number {
  const b = m.boss;
  if (!b) return raw;
  let amount = raw;
  if (b.guardUntil > state.now) amount *= 1 - b.guardReduction;
  if (b.staggerUntil > state.now) amount *= cfg.dungeon.ultimate.staggerTakenMul;
  return amount;
}

/** 적에게 피해를 주고 실제로 깎은 양을 돌려준다 */
function damageMonster(state: DungeonState, m: DungeonMonster, raw: number, source: DamageSource, crit: boolean, cfg: GameConfig, events: DungeonEvent[]): number {
  if (m.hp <= 0) return 0;
  const amount = Math.max(1, Math.floor(incoming(state, m, raw, cfg)));
  m.hp = Math.max(0, m.hp - amount);
  state.record.damage[source] = (state.record.damage[source] ?? 0) + amount;
  events.push({ type: 'dHit', at: state.now, seq: m.seq, amount, crit, source });
  const b = m.boss;
  if (b && !b.enraged && m.hp > 0) {
    const def = cfg.dungeon.bosses[b.id]!;
    if (m.hp <= m.stats.maxHp * def.enrage.hpBelowRatio) {
      b.enraged = true;
      m.stats = { ...m.stats, attackIntervalMs: Math.max(1, Math.round(m.stats.attackIntervalMs * 0.8)) };
      events.push({ type: 'dEnraged', at: state.now, seq: m.seq });
    }
  }
  if (m.hp <= 0) killMonster(state, m, cfg, events);
  return amount;
}

function killMonster(state: DungeonState, m: DungeonMonster, cfg: GameConfig, events: DungeonEvent[]): void {
  const d = cfg.dungeon;
  const wasFull = state.monsters.length >= maxOnField(cfg);
  state.monsters = state.monsters.filter((x) => x !== m);
  state.kills += 1;
  const r = state.rewards;
  r.gold += m.gold;
  r.kills[m.family] = (r.kills[m.family] ?? 0) + 1;
  r.absorb[m.family] = (r.absorb[m.family] ?? 0) + m.absorb;
  if (m.boss) state.record.bossKills += 1;
  if (state.focus === m.seq) state.focus = null;
  events.push({ type: 'dKilled', at: state.now, seq: m.seq, defId: m.defId, family: m.family, gold: m.gold, absorb: m.absorb, boss: m.boss !== null });
  if (state.phase !== 'fighting') return;

  const s = state.slime;
  const form = formOf(state, cfg);
  gainCharge(state, d.ultimate.perKill, cfg, events);
  healSlime(state, Math.floor(s.stats.maxHp * (d.waves.regenOnKill + (form?.killHeal ?? 0))), events);
  if (form?.killHaste) s.nextAttackAt = Math.min(s.nextAttackAt, state.now + 120);
  const fr = skillSpec(state.skills, 'frenzy', cfg);
  if (fr) {
    s.frenzy = Math.min(fr.maxStacks, s.frenzy + 1);
    s.frenzyUntil = state.now + fr.durationMs;
    events.push({ type: 'dFrenzy', at: state.now, stacks: s.frenzy });
  }
  // 독 · 화상이 가장 가까운 적에게 옮는다
  if (skillSpec(state.skills, 'poison', cfg)?.spread && m.poison) {
    const t = nearest(state.monsters, m.slot);
    if (t) addPoison(state, t, Math.max(1, Math.ceil(m.poison.stacks / 2)), cfg, events);
  }
  if (form?.burnSpread && m.burn) {
    const t = nearest(state.monsters, m.slot);
    if (t) addBurn(state, t, m.burn.stacks, cfg, events);
  }
  // 보스가 쓰러지면 부하도 무너진다
  if (m.boss) {
    state.queue = [];
    for (const o of [...state.monsters]) {
      if (o.hp <= 0) continue;
      o.hp = 0;
      killMonster(state, o, cfg, events);
    }
  }
  const head = state.queue[0];
  if (wasFull && head && head.at < state.now + REFILL_MS) head.at = state.now + REFILL_MS;
  checkWaveEnd(state, cfg, events);
}

function hurtSlime(state: DungeonState, raw: number, source: HurtSource, heavy: boolean, attacker: DungeonMonster | null, cfg: GameConfig, events: DungeonEvent[]): void {
  if (state.phase !== 'fighting') return;
  const s = state.slime;
  let amount = Math.max(0, Math.floor(raw));
  const absorbed = Math.min(s.shield, amount);
  s.shield -= absorbed;
  amount -= absorbed;
  s.hp = Math.max(0, s.hp - amount);
  state.record.taken[source] = (state.record.taken[source] ?? 0) + amount;
  events.push({ type: 'dHurt', at: state.now, amount, absorbed, source, heavy });
  if (s.hp <= 0) {
    state.record.killedBy = source;
    state.phase = 'failed';
    events.push({ type: 'dFailed', at: state.now });
    return;
  }
  if (source !== 'burn') gainCharge(state, cfg.dungeon.ultimate.perHurt ?? 0, cfg, events);
  // 광폭화 — 큰 공격을 맞으면 곧바로 최대 중첩
  const fr = heavy ? skillSpec(state.skills, 'frenzy', cfg) : null;
  if (fr && s.frenzy < fr.maxStacks) {
    s.frenzy = fr.maxStacks;
    s.frenzyUntil = state.now + fr.durationMs;
    events.push({ type: 'dFrenzy', at: state.now, stacks: s.frenzy });
  }
  if (absorbed > 0 && s.shield <= 0) shieldBreak(state, cfg, events);
  tryShield(state, cfg, events);
  const thorns = formOf(state, cfg)?.thorns;
  if (thorns && attacker && attacker.hp > 0 && (source === 'hit' || source === 'smash')) {
    damageMonster(state, attacker, (amount + absorbed) * thorns * guardBoost(state, cfg), 'thorns', false, cfg, events);
  }
}

function slimeBurnTick(state: DungeonState, cfg: GameConfig, events: DungeonEvent[]): void {
  const burn = state.slime.burn;
  if (!burn) return;
  const tick = cfg.balance.battle.burnTickMs;
  const amount = carryHurt(state, (burn.stacks * burn.dpsPerStack * tick) / 1000);
  burn.nextTickAt += tick;
  if (burn.nextTickAt > burn.endsAt) state.slime.burn = null;
  if (amount > 0) hurtSlime(state, amount, 'burn', false, null, cfg, events);
}

/** 받을 피해의 정수 몫. 1 미만 나머지는 다음 피해에 더한다 */
function carryHurt(state: DungeonState, exact: number): number {
  const total = exact + state.slime.hurtCarry;
  const amount = Math.floor(total);
  state.slime.hurtCarry = total - amount;
  return amount;
}

function healSlime(state: DungeonState, amount: number, events: DungeonEvent[]): void {
  const s = state.slime;
  const healed = Math.min(Math.floor(amount), s.stats.maxHp - s.hp);
  if (healed <= 0 || s.hp <= 0) return;
  s.hp += healed;
  events.push({ type: 'dHeal', at: state.now, amount: healed });
}

function gainCharge(state: DungeonState, amount: number, cfg: GameConfig, events: DungeonEvent[]): void {
  setCharge(state, state.ult.charge + amount * state.ult.mul, cfg, events);
}

function setCharge(state: DungeonState, value: number, cfg: GameConfig, events: DungeonEvent[]): void {
  const max = cfg.dungeon.ultimate.max;
  const before = state.ult.charge;
  state.ult.charge = Math.min(max, value);
  if (before < max && state.ult.charge >= max) events.push({ type: 'dUltReady', at: state.now });
}

// ── 대상 ────────────────────────────────────────────────

/** 고른 대상이 살아 있으면 그 적, 아니면 맨 앞 적 */
function pickTarget(state: DungeonState): DungeonMonster | null {
  const focused = state.focus === null ? undefined : state.monsters.find((m) => m.seq === state.focus && m.hp > 0);
  if (focused) return focused;
  let best: DungeonMonster | null = null;
  for (const m of state.monsters) {
    if (m.hp <= 0) continue;
    if (!best || SLOTS[m.slot]![0] < SLOTS[best.slot]![0] || (SLOTS[m.slot]![0] === SLOTS[best.slot]![0] && m.slot < best.slot)) best = m;
  }
  return best;
}

function nearest(list: readonly DungeonMonster[], slot: number): DungeonMonster | null {
  let best: DungeonMonster | null = null;
  let bestD = Infinity;
  for (const m of list) {
    if (m.hp <= 0) continue;
    const d = slotDistance(m.slot, slot);
    if (d < bestD || (d === bestD && best !== null && m.seq < best.seq)) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

function formOf(state: DungeonState, cfg: GameConfig): DungeonFormDef | undefined {
  return state.form ? cfg.dungeon.forms[state.form] : undefined;
}
