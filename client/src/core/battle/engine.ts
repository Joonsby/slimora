import { findMonster, findStage } from '../lookup';
import type { AllyStats, BattleEvent, BattleMode, BattleState, CombatStats, Side, UnitState } from '../model/battle';
import type { GameConfig, StageDef } from '../model/config';
import type { MonsterId, StageId } from '../model/ids';
import { nextFloat } from '../rng';
import { deriveMonsterStats, monsterAbsorb, monsterGold } from '../stats';
import { applyBurn, burnTickDamage, computeHit, lifestealAmount } from './damage';

export interface BattleInit {
  stageId: StageId;
  mode: BattleMode;
  slime: CombatStats;
  seed: number;
  /** 처치 골드 배율. 기본 1 */
  goldMul?: number;
  /** 함께 싸우는 용병 */
  allies?: AllyStats[];
}

type Action = 'spawn' | 'revive' | 'slimeBurn' | 'monsterBurn' | 'slimeAttack' | 'monsterAttack' | 'bossTimeout' | 'allyAttack';

/** 한 step 안에서 처리할 행동 수 상한. 넘으면 설정 오류(간격 0 등)다 */
const MAX_ACTIONS_PER_STEP = 100_000;

export function createBattle(init: BattleInit, cfg: GameConfig): BattleState {
  const stage = findStage(cfg, init.stageId);
  return {
    now: 0,
    stageId: init.stageId,
    mode: init.mode,
    phase: 'spawning',
    phaseUntil: cfg.balance.battle.spawnDelayMs,
    kills: 0,
    killsToClear: stage.killsToClear,
    slime: { stats: init.slime, hp: init.slime.maxHp, nextAttackAt: 0, burn: null, attacks: 0, enraged: false },
    monster: null,
    bossDue: false,
    bossEndsAt: null,
    rng: { s: init.seed | 0 },
    seq: 0,
    goldMul: init.goldMul ?? 1,
    allies: (init.allies ?? []).map((a) => ({ ...a, nextAttackAt: 0 })),
  };
}

/** 편성이 바뀌면 다음 공격부터 새 용병이 싸운다 */
export function setAllies(state: BattleState, allies: AllyStats[]): void {
  state.allies = allies.map((a, i) => ({ ...a, nextAttackAt: state.now + a.intervalMs * (0.6 + 0.2 * i) }));
}

/** 영구 강화를 사면 다음 몬스터부터 골드가 바뀐다 */
export function setGoldMultiplier(state: BattleState, goldMul: number): void {
  state.goldMul = goldMul;
}

export function isFinished(state: BattleState): boolean {
  return state.phase === 'cleared' || state.phase === 'failed';
}

/** 보스가 나왔거나 곧 나오는 동안. 진화를 막는 데 쓴다 */
export function isBossFight(state: BattleState): boolean {
  return !isFinished(state) && (state.bossDue || state.bossEndsAt !== null);
}

/**
 * dtMs 만큼 시간을 진행하고 그동안 일어난 이벤트를 돌려준다. state 는 제자리에서 바뀐다.
 * 행동을 예정 시각 순서로 처리하므로 dt 를 어떻게 나눠도 결과가 같다.
 */
export function stepBattle(state: BattleState, dtMs: number, cfg: GameConfig): BattleEvent[] {
  const events: BattleEvent[] = [];
  const until = state.now + Math.max(0, dtMs);
  for (let i = 0; ; i++) {
    if (i >= MAX_ACTIONS_PER_STEP) throw new Error('전투 행동이 너무 많다 — 공격 간격 설정을 확인');
    const next = nextAction(state);
    if (!next || next.at > until) break;
    state.now = next.at;
    perform(state, next.action, cfg, events, next.index ?? 0);
  }
  state.now = until;
  return events;
}

/** 강화 등으로 능력치가 바뀌면 즉시 반영한다. 현재 HP 는 비율을 유지한다 */
export function applySlimeStats(state: BattleState, stats: CombatStats): void {
  const slime = state.slime;
  if (slime.hp > 0) {
    const ratio = slime.hp / slime.stats.maxHp;
    slime.hp = Math.min(stats.maxHp, Math.max(1, Math.round(ratio * stats.maxHp)));
  }
  slime.stats = stats;
}

/** 클리어한 전투를 끊지 않고 같은 스테이지 파밍으로 이어간다 */
export function continueAsFarm(state: BattleState, cfg: GameConfig): void {
  if (state.phase !== 'cleared') return;
  state.mode = 'farm';
  state.phase = 'spawning';
  state.phaseUntil = state.now + cfg.balance.battle.spawnDelayMs;
}

/** 같은 시각이면 화상 틱 → 슬라임 공격 → 몬스터 공격 → 보스 시간 초과 → 용병 순 */
function nextAction(state: BattleState): { at: number; action: Action; index?: number } | null {
  switch (state.phase) {
    case 'spawning':
      return { at: state.phaseUntil, action: 'spawn' };
    case 'slimeDown':
      return { at: state.phaseUntil, action: 'revive' };
    case 'fighting': {
      const monster = state.monster;
      if (!monster) return null;
      const candidates: [number | undefined, Action][] = [
        [state.slime.burn?.nextTickAt, 'slimeBurn'],
        [monster.burn?.nextTickAt, 'monsterBurn'],
        [state.slime.nextAttackAt, 'slimeAttack'],
        [monster.nextAttackAt, 'monsterAttack'],
        [monster.isBoss ? (state.bossEndsAt ?? undefined) : undefined, 'bossTimeout'],
      ];
      let best: { at: number; action: Action; index?: number } | null = null;
      for (const [at, action] of candidates) {
        if (at !== undefined && (best === null || at < best.at)) best = { at, action };
      }
      state.allies.forEach((a, index) => {
        if (best === null || a.nextAttackAt < best.at) best = { at: a.nextAttackAt, action: 'allyAttack', index };
      });
      return best;
    }
    case 'cleared':
    case 'failed':
      return null;
  }
}

function perform(state: BattleState, action: Action, cfg: GameConfig, events: BattleEvent[], index: number): void {
  switch (action) {
    case 'allyAttack':
      allyAttack(state, index, cfg, events);
      break;
    case 'spawn':
      spawnMonster(state, cfg, events);
      break;
    case 'revive':
      revive(state, cfg, events);
      break;
    case 'slimeBurn':
      burnTick(state, 'slime', cfg, events);
      break;
    case 'monsterBurn':
      burnTick(state, 'monster', cfg, events);
      break;
    case 'slimeAttack':
      attack(state, 'slime', cfg, events);
      break;
    case 'monsterAttack':
      attack(state, 'monster', cfg, events);
      break;
    case 'bossTimeout':
      state.monster = null;
      state.slime.burn = null;
      state.bossEndsAt = null;
      state.phase = 'failed';
      events.push({ type: 'challengeFailed', at: state.now, stageId: state.stageId, reason: 'timeout' });
      break;
  }
}

function unitOf(state: BattleState, side: Side): UnitState {
  if (side === 'slime') return state.slime;
  if (!state.monster) throw new Error('몬스터가 없는데 몬스터 행동이 예정됨');
  return state.monster;
}

function spawnMonster(state: BattleState, cfg: GameConfig, events: BattleEvent[]): void {
  const stage = findStage(cfg, state.stageId);
  const boss = state.bossDue && stage.boss ? stage.boss : null;
  const defId = boss ? boss.monster : pickSpawn(stage, nextFloat(state.rng));
  const def = findMonster(cfg, defId);
  const stats = deriveMonsterStats(defId, state.stageId, cfg);
  const seq = ++state.seq;
  state.monster = {
    stats,
    hp: stats.maxHp,
    nextAttackAt: state.now + stats.attackIntervalMs,
    burn: null,
    attacks: 0,
    enraged: false,
    defId,
    family: def.family,
    seq,
    gold: Math.round(monsterGold(defId, state.stageId, cfg) * state.goldMul),
    absorb: monsterAbsorb(defId, state.stageId, cfg),
    isBoss: boss !== null,
  };
  if (boss) {
    state.bossDue = false;
    state.bossEndsAt = state.now + boss.timeLimitMs;
  }
  state.slime.nextAttackAt = state.now + state.slime.stats.attackIntervalMs;
  state.allies.forEach((a, i) => (a.nextAttackAt = state.now + a.intervalMs * (0.6 + 0.2 * i)));
  state.phase = 'fighting';
  events.push({ type: 'monsterSpawned', at: state.now, defId, seq, maxHp: stats.maxHp, boss: boss !== null });
}

function pickSpawn(stage: StageDef, roll: number): MonsterId {
  const total = stage.spawns.reduce((sum, s) => sum + s.weight, 0);
  let target = roll * total;
  for (const s of stage.spawns) {
    target -= s.weight;
    if (target < 0) return s.monster;
  }
  return stage.spawns[stage.spawns.length - 1]!.monster;
}

function attack(state: BattleState, side: Side, cfg: GameConfig, events: BattleEvent[]): void {
  const defSide: Side = side === 'slime' ? 'monster' : 'slime';
  const attacker = unitOf(state, side);
  const defender = unitOf(state, defSide);
  const at = state.now;

  attacker.nextAttackAt += attacker.stats.attackIntervalMs;
  attacker.attacks += 1;
  const heavySpec = attacker.stats.heavyAttack;
  const heavy = heavySpec !== null && attacker.attacks % heavySpec.every === 0;
  const critRoll = attacker.stats.critChance > 0 ? nextFloat(state.rng) : 1;
  const hit = computeHit(attacker.stats, defender.stats, critRoll, heavy ? heavySpec.multiplier : 1);
  events.push({ type: 'attack', at, by: side });

  defender.hp = Math.max(0, defender.hp - hit.amount);
  events.push({ type: 'damage', at, to: defSide, amount: hit.amount, crit: hit.crit, source: 'hit', reducedBy: hit.reducedBy, ...(heavy && { heavy }) });
  checkEnrage(defender, defSide, at, events);

  if (attacker.stats.lifesteal > 0) heal(attacker, lifestealAmount(hit.amount, attacker.stats.lifesteal), side, 'lifesteal', at, events);

  const burn = attacker.stats.burn;
  if (burn && defender.hp > 0 && nextFloat(state.rng) < burn.chance) {
    defender.burn = applyBurn(defender.burn, burn, attacker.stats.attack, at, cfg.balance.battle.burnTickMs);
    events.push({ type: 'burnApplied', at, to: defSide, stacks: defender.burn.stacks });
  }

  if (defender.hp <= 0) {
    onDeath(state, defSide, cfg, events);
    return;
  }
  if (heavySpec && (attacker.attacks + 1) % heavySpec.every === 0) events.push({ type: 'heavyWarning', at, by: side });
}

/** 용병 지원 공격 — 슬라임 공격력 × power. 치명타 · 흡혈 · 화상은 없다 */
function allyAttack(state: BattleState, index: number, cfg: GameConfig, events: BattleEvent[]): void {
  const ally = state.allies[index]!;
  const monster = state.monster!;
  const at = state.now;
  ally.nextAttackAt += ally.intervalMs;
  const stats: CombatStats = { ...state.slime.stats, attack: Math.max(1, Math.round(state.slime.stats.attack * ally.power)), critChance: 0 };
  const hit = computeHit(stats, monster.stats, 1);
  events.push({ type: 'allyAttack', at, index, id: ally.id });
  monster.hp = Math.max(0, monster.hp - hit.amount);
  events.push({ type: 'damage', at, to: 'monster', amount: hit.amount, crit: false, source: 'ally', reducedBy: hit.reducedBy });
  checkEnrage(monster, 'monster', at, events);
  if (monster.hp <= 0) onDeath(state, 'monster', cfg, events);
}

/** HP 가 기준 아래로 처음 떨어지면 공격 간격을 줄인다 */
function checkEnrage(unit: UnitState, side: Side, at: number, events: BattleEvent[]): void {
  const enrage = unit.stats.enrage;
  if (!enrage || unit.enraged || unit.hp <= 0 || unit.hp > unit.stats.maxHp * enrage.hpBelowRatio) return;
  unit.enraged = true;
  unit.stats = { ...unit.stats, attackIntervalMs: Math.max(1, Math.round(unit.stats.attackIntervalMs * enrage.attackIntervalMul)) };
  events.push({ type: 'enraged', at, side });
}

function burnTick(state: BattleState, side: Side, cfg: GameConfig, events: BattleEvent[]): void {
  const unit = unitOf(state, side);
  const burn = unit.burn;
  if (!burn) return;
  const tickMs = cfg.balance.battle.burnTickMs;
  const amount = burnTickDamage(burn, tickMs);
  unit.hp = Math.max(0, unit.hp - amount);
  events.push({ type: 'damage', at: state.now, to: side, amount, crit: false, source: 'burn', reducedBy: 0 });
  checkEnrage(unit, side, state.now, events);
  burn.nextTickAt += tickMs;
  if (burn.nextTickAt > burn.endsAt) unit.burn = null;
  if (unit.hp <= 0) onDeath(state, side, cfg, events);
}

function heal(unit: UnitState, amount: number, side: Side, source: 'lifesteal' | 'regen', at: number, events: BattleEvent[]): void {
  const healed = Math.min(amount, unit.stats.maxHp - unit.hp);
  if (healed <= 0 || unit.hp <= 0) return;
  unit.hp += healed;
  events.push({ type: 'heal', at, to: side, amount: healed, source });
}

function onDeath(state: BattleState, side: Side, cfg: GameConfig, events: BattleEvent[]): void {
  const at = state.now;
  const b = cfg.balance.battle;
  if (side === 'monster') {
    const m = state.monster!;
    events.push({ type: 'monsterKilled', at, defId: m.defId, family: m.family, seq: m.seq, gold: m.gold, absorb: m.absorb });
    state.kills += 1;
    state.monster = null;
    // 몬스터가 쓰러지면 그 몬스터가 붙인 화상도 꺼진다
    state.slime.burn = null;
    heal(state.slime, Math.floor(state.slime.stats.maxHp * b.regenOnKillRatio), 'slime', 'regen', at, events);
    if (m.isBoss) state.bossEndsAt = null;
    const goalMet = state.mode === 'challenge' && state.kills >= state.killsToClear;
    if (goalMet && !m.isBoss && findStage(cfg, state.stageId).boss) {
      state.bossDue = true;
      state.phase = 'spawning';
      state.phaseUntil = at + b.spawnDelayMs;
    } else if (goalMet) {
      state.phase = 'cleared';
      events.push({ type: 'stageCleared', at, stageId: state.stageId });
    } else {
      state.phase = 'spawning';
      state.phaseUntil = at + b.spawnDelayMs;
    }
    return;
  }
  events.push({ type: 'slimeDied', at });
  state.monster = null;
  state.slime.burn = null;
  state.phase = 'slimeDown';
  state.phaseUntil = at + b.deathDelayMs;
}

function revive(state: BattleState, cfg: GameConfig, events: BattleEvent[]): void {
  if (state.mode === 'challenge') {
    state.phase = 'failed';
    state.bossDue = false;
    state.bossEndsAt = null;
    events.push({ type: 'challengeFailed', at: state.now, stageId: state.stageId, reason: 'death' });
    return;
  }
  state.slime.hp = state.slime.stats.maxHp;
  events.push({ type: 'respawned', at: state.now });
  state.phase = 'spawning';
  state.phaseUntil = state.now + cfg.balance.battle.spawnDelayMs;
}
