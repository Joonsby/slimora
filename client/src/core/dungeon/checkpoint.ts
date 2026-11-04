import { findStage } from '../lookup';
import type { BurnSpec, BurnState, CombatStats } from '../model/battle';
import type { GameConfig } from '../model/config';
import { SKILL_IDS, SYNERGY_IDS, type BossState, type DungeonMonster, type DungeonPhase, type DungeonRecord, type DungeonState, type HurtSource, type SkillId, type SynergyId } from '../model/dungeon';
import type { FormId, MonsterId } from '../model/ids';
import { SLOTS, waveCount } from './engine';
import { activeSynergies, dungeonRefStage, maxSkillLevel, upgradableSkills } from './rules';

/**
 * 도전 던전 체크포인트 — 진행 중인 판을 저장에 넣고, 다시 실행했을 때 이어서 돌린다.
 * 엔진 상태가 전부 순수 데이터라 그대로 복사하면 되고, 난수 상태(rng)도 함께 들어 있어 이어서 돌린 결과가 끊기지 않은 판과 같다.
 * 읽을 때는 하나라도 어긋나면 판 전체를 버린다 — 고쳐 쓰면 보상이 부풀거나 엔진이 멈출 수 있다
 */

/** 저장할 깊은 사본 */
export function snapshotDungeon(state: Readonly<DungeonState>): DungeonState {
  return structuredClone(state) as DungeonState;
}

/** 이어서 돌릴 수 있는 단계 — 끝난 판은 저장하지 않는다 */
const RESUMABLE: readonly DungeonPhase[] = ['choosing', 'fighting', 'waveClear'];
/** 한 판의 엔진 시각 상한 (네 시간) — 이보다 길면 손상으로 본다 */
const MAX_NOW = 4 * 3600_000;
const HURT_SOURCES: readonly HurtSource[] = ['hit', 'burn', 'smash', 'breath', 'guard', 'summon'];

class Invalid extends Error {}

/** 저장에서 읽은 판. 이어서 돌릴 수 없으면 null — 어떤 값이 와도 던지지 않는다 (불러오기가 막히면 게임을 못 한다) */
export function restoreDungeon(raw: unknown, cfg: GameConfig): DungeonState | null {
  try {
    return parseState(raw, cfg);
  } catch (e) {
    if (!(e instanceof Invalid)) console.warn('던전 체크포인트를 읽다가 예외', e);
    return null;
  }
}

const fail = (what: string): never => {
  throw new Invalid(what);
};
const obj = (v: unknown, what: string): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(what));
const num = (v: unknown, what: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(what));
const int = (v: unknown, what: string, min: number, max: number): number => (Number.isInteger(num(v, what, min, max)) ? (v as number) : fail(what));
const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(what));
const str = (v: unknown, what: string, max = 64): string => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail(what));
const list = (v: unknown, what: string, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : fail(what));
/** 시각 — 0 이상 한 판 상한 이하 */
const time = (v: unknown, what: string): number => num(v, what, 0, MAX_NOW + 600_000);
/** 키가 정해진 목록 안에 있는 수치 기록 */
function amounts<K extends string>(v: unknown, keys: readonly string[], what: string): Partial<Record<K, number>> {
  const o = obj(v, what);
  const out: Partial<Record<K, number>> = {};
  for (const [k, n] of Object.entries(o)) {
    if (!keys.includes(k)) fail(`${what}.${k}`);
    out[k as K] = num(n, `${what}.${k}`, 0);
  }
  return out;
}

function parseStats(v: unknown, what: string): CombatStats {
  const o = obj(v, what);
  const burn = o.burn === null ? null : parseBurnSpec(o.burn, `${what}.burn`);
  const heavy = o.heavyAttack === null ? null : obj(o.heavyAttack, `${what}.heavyAttack`);
  const enrage = o.enrage === null ? null : obj(o.enrage, `${what}.enrage`);
  return {
    maxHp: num(o.maxHp, `${what}.maxHp`, 1),
    attack: num(o.attack, `${what}.attack`, 0),
    // 간격이 0 에 가까우면 엔진이 같은 시각에 끝없이 행동한다
    attackIntervalMs: num(o.attackIntervalMs, `${what}.attackIntervalMs`, 50, 600_000),
    critChance: num(o.critChance, `${what}.critChance`, 0, 1),
    critMultiplier: num(o.critMultiplier, `${what}.critMultiplier`, 1, 1000),
    lifesteal: num(o.lifesteal, `${what}.lifesteal`, 0, 1),
    damageReduction: num(o.damageReduction, `${what}.damageReduction`, 0, 0.99),
    burn,
    heavyAttack: heavy ? { every: int(heavy.every, `${what}.heavy.every`, 1, 10_000), multiplier: num(heavy.multiplier, `${what}.heavy.multiplier`, 0, 10_000) } : null,
    enrage: enrage ? { hpBelowRatio: num(enrage.hpBelowRatio, `${what}.enrage.hp`, 0, 1), attackIntervalMul: num(enrage.attackIntervalMul, `${what}.enrage.mul`, 0.05, 100) } : null,
  };
}

function parseBurnSpec(v: unknown, what: string): BurnSpec {
  const o = obj(v, what);
  return { chance: num(o.chance, what, 0, 1), dpsRatio: num(o.dpsRatio, what, 0, 1000), durationMs: num(o.durationMs, what, 1, 600_000), maxStacks: int(o.maxStacks, what, 1, 1000) };
}

function parseDot(v: unknown, what: string): BurnState | null {
  if (v === null) return null;
  const o = obj(v, what);
  return { stacks: int(o.stacks, what, 1, 1000), dpsPerStack: num(o.dpsPerStack, what, 0), endsAt: time(o.endsAt, what), nextTickAt: time(o.nextTickAt, what) };
}

function parseBoss(v: unknown, now: number, cfg: GameConfig, what: string): BossState {
  const o = obj(v, what);
  const id = str(o.id, `${what}.id`);
  const def = cfg.dungeon.bosses[id] ?? fail(`${what}.id`);
  const next = int(o.next, `${what}.next`, 0, 1_000_000);
  let nextAt = time(o.nextAt, `${what}.nextAt`);
  let casting: BossState['casting'] = null;
  if (o.casting !== null) {
    const c = obj(o.casting, `${what}.casting`);
    const kind = obj(c.pattern, `${what}.casting.pattern`).kind;
    // 패턴 수치는 지금 설정에서 다시 잇는다. 설정이 바뀌어 순서가 어긋났으면 예고를 접고 곧 다시 예고한다
    const pattern = def.cycle[next % def.cycle.length]!;
    if (pattern.kind === kind) {
      casting = { pattern, startedAt: time(c.startedAt, `${what}.casting.startedAt`), impactAt: time(c.impactAt, `${what}.casting.impactAt`), weakened: bool(c.weakened, `${what}.casting.weakened`) };
    } else {
      nextAt = now + 500;
    }
  }
  return {
    id,
    next,
    nextAt,
    casting,
    guardUntil: time(o.guardUntil, `${what}.guardUntil`),
    guardReduction: num(o.guardReduction, `${what}.guardReduction`, 0, 0.99),
    staggerUntil: time(o.staggerUntil, `${what}.staggerUntil`),
    enraged: bool(o.enraged, `${what}.enraged`),
  };
}

function parseMonster(v: unknown, now: number, cfg: GameConfig, what: string): DungeonMonster {
  const o = obj(v, what);
  const defId = str(o.defId, `${what}.defId`) as MonsterId;
  const def = cfg.monsters.find((m) => m.id === defId) ?? fail(`${what}.defId`);
  const stats = parseStats(o.stats, `${what}.stats`);
  return {
    seq: int(o.seq, `${what}.seq`, 1, Number.MAX_SAFE_INTEGER),
    defId,
    family: def.family,
    stats,
    // 쓰러진 적은 곧바로 빠지므로 남아 있는 적은 HP 가 있다
    hp: num(o.hp, `${what}.hp`, Number.MIN_VALUE, stats.maxHp),
    slot: int(o.slot, `${what}.slot`, 0, SLOTS.length - 1),
    nextAttackAt: time(o.nextAttackAt, `${what}.nextAttackAt`),
    attacks: int(o.attacks, `${what}.attacks`, 0, Number.MAX_SAFE_INTEGER),
    enraged: bool(o.enraged, `${what}.enraged`),
    burn: parseDot(o.burn, `${what}.burn`),
    poison: parseDot(o.poison, `${what}.poison`),
    stunUntil: time(o.stunUntil, `${what}.stunUntil`),
    gold: num(o.gold, `${what}.gold`, 0),
    absorb: num(o.absorb, `${what}.absorb`, 0),
    boss: o.boss === null ? null : parseBoss(o.boss, now, cfg, `${what}.boss`),
  };
}

function parseRecord(v: unknown, cfg: GameConfig): DungeonRecord {
  const o = obj(v, 'record');
  const kinds = ['smash', 'breath', 'guard', 'summon'];
  const killedBy = o.killedBy === null || o.killedBy === undefined ? null : HURT_SOURCES.includes(o.killedBy as HurtSource) ? (o.killedBy as HurtSource) : fail('record.killedBy');
  return {
    damage: amounts(o.damage, ['hit', 'split', 'explosion', 'lightning', 'poison', 'burn', 'splash', 'ally', 'ultimate', 'thorns', 'shockwave'], 'record.damage'),
    ultimates: int(o.ultimates, 'record.ultimates', 0, 1_000_000),
    blocked: int(o.blocked, 'record.blocked', 0, 1_000_000),
    bossKills: int(o.bossKills, 'record.bossKills', 0, Object.keys(cfg.dungeon.waves.bosses).length),
    taken: amounts(o.taken ?? {}, HURT_SOURCES, 'record.taken'),
    casts: amounts(o.casts ?? {}, kinds, 'record.casts'),
    countered: amounts(o.countered ?? {}, kinds, 'record.countered'),
    missed: int(o.missed ?? 0, 'record.missed', 0, 1_000_000),
    killedBy,
  };
}

function parseState(raw: unknown, cfg: GameConfig): DungeonState {
  const o = obj(raw, 'state');
  const d = cfg.dungeon;
  const waves = waveCount(cfg);
  const phase = RESUMABLE.includes(o.phase as DungeonPhase) ? (o.phase as DungeonPhase) : fail('phase');
  const now = num(o.now, 'now', 0, MAX_NOW);
  const level = int(o.level, 'level', 1, d.levels.count);
  const wave = int(o.wave, 'wave', 0, waves);
  const wavesCleared = int(o.wavesCleared, 'wavesCleared', 0, waves);
  // 단계마다 웨이브 · 깬 웨이브의 관계가 정해져 있다
  const consistent = phase === 'choosing' ? wave < waves && wavesCleared === wave : phase === 'fighting' ? wave >= 1 && wavesCleared === wave - 1 : wave >= 1 && wave < waves && wavesCleared === wave;
  if (!consistent) fail('wave');

  const skillsRaw = obj(o.skills, 'skills');
  const skills: Partial<Record<SkillId, number>> = {};
  for (const [id, lv] of Object.entries(skillsRaw)) {
    if (!SKILL_IDS.includes(id as SkillId)) fail(`skills.${id}`);
    skills[id as SkillId] = int(lv, `skills.${id}`, 1, maxSkillLevel(id as SkillId, cfg));
  }
  const active = activeSynergies(skills, cfg);
  const synergies = list(o.synergies, 'synergies', SYNERGY_IDS.length).map((s) => (active.includes(s as SynergyId) ? (s as SynergyId) : fail('synergies')));
  if (new Set(synergies).size !== synergies.length) fail('synergies');

  const offerSize = int(o.offerSize, 'offerSize', 1, SKILL_IDS.length);
  let offer: SkillId[] | null = null;
  if (phase === 'choosing') {
    const upgradable = upgradableSkills(skills, cfg);
    offer = list(o.offer, 'offer', SKILL_IDS.length).map((s) => (upgradable.includes(s as SkillId) ? (s as SkillId) : fail('offer')));
    if (offer.length === 0 || new Set(offer).size !== offer.length) fail('offer');
  } else if (o.offer !== null) fail('offer');

  const monsters = list(o.monsters, 'monsters', Math.min(SLOTS.length, d.waves.maxOnField)).map((m, i) => parseMonster(m, now, cfg, `monsters[${i}]`));
  if (new Set(monsters.map((m) => m.slot)).size !== monsters.length || new Set(monsters.map((m) => m.seq)).size !== monsters.length) fail('monsters.slot');
  if (monsters.filter((m) => m.boss).length > 1) fail('monsters.boss');
  const queue = list(o.queue, 'queue', 200).map((q, i) => {
    const e = obj(q, `queue[${i}]`);
    const defId = str(e.defId, `queue[${i}].defId`) as MonsterId;
    if (!cfg.monsters.some((m) => m.id === defId)) fail(`queue[${i}].defId`);
    const boss = e.boss === null ? null : str(e.boss, `queue[${i}].boss`);
    if (boss !== null && !(boss in d.bosses)) fail(`queue[${i}].boss`);
    return { defId, at: time(e.at, `queue[${i}].at`), boss };
  });
  // 고르는 중 · 웨이브 사이에는 전장이 비어 있다
  if (phase !== 'fighting' && (monsters.length > 0 || queue.length > 0)) fail('field');

  const sl = obj(o.slime, 'slime');
  const slimeStats = parseStats(sl.stats, 'slime.stats');
  const ult = obj(o.ult, 'ult');
  const rng = obj(o.rng, 'rng');
  const rewards = obj(o.rewards, 'rewards');
  const families = cfg.families.map((f) => f.id);
  const seq = int(o.seq, 'seq', 0, Number.MAX_SAFE_INTEGER);
  if (monsters.some((m) => m.seq > seq)) fail('seq');
  const form = o.form === null ? null : typeof o.form === 'string' && o.form in d.forms ? (o.form as FormId) : fail('form');
  const focus = o.focus === null ? null : int(o.focus, 'focus', 1, Number.MAX_SAFE_INTEGER);

  return {
    id: str(o.id, 'id'),
    now,
    level,
    rewardStage: findStage(cfg, int(o.rewardStage, 'rewardStage', 1, cfg.stages.length)).id,
    assist: bool(o.assist, 'assist'),
    refStage: findStage(cfg, dungeonRefStage(level, cfg)).id,
    phase,
    phaseUntil: time(o.phaseUntil, 'phaseUntil'),
    wave,
    wavesCleared,
    slime: {
      stats: slimeStats,
      hp: num(sl.hp, 'slime.hp', Number.MIN_VALUE, slimeStats.maxHp),
      shield: num(sl.shield, 'slime.shield', 0),
      shieldAt: sl.shieldAt === null ? null : time(sl.shieldAt, 'slime.shieldAt'),
      nextAttackAt: time(sl.nextAttackAt, 'slime.nextAttackAt'),
      attacks: int(sl.attacks, 'slime.attacks', 0, Number.MAX_SAFE_INTEGER),
      burn: parseDot(sl.burn, 'slime.burn'),
      hurtCarry: num(sl.hurtCarry, 'slime.hurtCarry', 0, 1),
      frenzy: int(sl.frenzy, 'slime.frenzy', 0, 100),
      frenzyUntil: time(sl.frenzyUntil, 'slime.frenzyUntil'),
    },
    monsters,
    queue,
    allies: list(o.allies, 'allies', 8).map((a, i) => {
      const x = obj(a, `allies[${i}]`);
      return {
        id: str(x.id, `allies[${i}].id`),
        power: num(x.power, `allies[${i}].power`, 0, 1000),
        intervalMs: num(x.intervalMs, `allies[${i}].intervalMs`, 50, 600_000),
        preset: typeof x.preset === 'string' && x.preset.length <= 32 ? x.preset : fail(`allies[${i}].preset`),
        nextAttackAt: time(x.nextAttackAt, `allies[${i}].nextAttackAt`),
      };
    }),
    skills,
    synergies,
    offer,
    rerolls: int(o.rerolls, 'rerolls', 0, 100),
    offerSize,
    ult: { charge: num(ult.charge, 'ult.charge', 0, d.ultimate.max), chargedAt: time(ult.chargedAt, 'ult.chargedAt'), mul: num(ult.mul, 'ult.mul', 0.01, 100) },
    focus: focus !== null && monsters.some((m) => m.seq === focus) ? focus : null,
    form,
    rng: { s: int(rng.s, 'rng.s', -0x80000000, 0x7fffffff) },
    seq,
    kills: int(o.kills, 'kills', 0, 1_000_000),
    rewards: { gold: num(rewards.gold, 'rewards.gold', 0), kills: amounts(rewards.kills, families, 'rewards.kills'), absorb: amounts(rewards.absorb, families, 'rewards.absorb') },
    goldMul: num(o.goldMul, 'goldMul', Number.MIN_VALUE, 1e9),
    record: parseRecord(o.record, cfg),
  };
}
