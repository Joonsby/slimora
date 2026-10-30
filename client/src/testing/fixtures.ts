import type { BattleEvent, BattleState, CombatStats } from '../core/model/battle';
import type { GameConfig, MonsterDef, StageDef } from '../core/model/config';
import { stepBattle } from '../core/battle/engine';
import { gameConfig } from '../data';

export function cloneConfig(): GameConfig {
  return structuredClone(gameConfig);
}

export function stats(overrides: Partial<CombatStats> = {}): CombatStats {
  return {
    maxHp: 100,
    attack: 10,
    attackIntervalMs: 1000,
    critChance: 0,
    critMultiplier: 1.5,
    lifesteal: 0,
    damageReduction: 0,
    burn: null,
    heavyAttack: null,
    enrage: null,
    ...overrides,
  };
}

export interface ArenaOptions {
  monster?: Partial<MonsterDef>;
  killsToClear?: number;
  hp?: number;
  atk?: number;
  gold?: number;
  extraStages?: StageDef[];
}

/**
 * 몬스터 1종짜리 시험장. 스테이지 1 의 몬스터 수치가 그대로 hp · atk · gold 가 된다.
 * 전투 상수는 실제 설정과 같다 (등장 600ms · 처치 회복 10% · 사망 대기 2000ms · 화상 틱 500ms)
 */
export function arena(opts: ArenaOptions = {}): GameConfig {
  const cfg = cloneConfig();
  cfg.monsters = [
    {
      id: 'dummy',
      family: 'bat',
      name: '허수아비',
      hpMul: 1,
      atkMul: 1,
      attackIntervalMs: 1000,
      goldMul: 1,
      absorbMul: 1,
      effects: [],
      visual: { preset: 'blob', tint: '#ffffff', scale: 1 },
      ...opts.monster,
    },
  ];
  cfg.stages = [
    {
      id: 1,
      chapter: 1,
      name: '시험장',
      scene: 'duskCave',
      spawns: [{ monster: 'dummy', weight: 1 }],
      killsToClear: opts.killsToClear ?? 3,
      overrides: { hp: opts.hp ?? 100, atk: opts.atk ?? 10, goldPerKill: opts.gold ?? 5 },
    },
    ...(opts.extraStages ?? []),
  ];
  return cfg;
}

/** stepMs 씩 나눠 진행하며 이벤트를 모은다 */
export function run(state: BattleState, cfg: GameConfig, totalMs: number, stepMs = 100): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let t = 0; t < totalMs; t += stepMs) events.push(...stepBattle(state, Math.min(stepMs, totalMs - t), cfg));
  return events;
}

export function ofType<T extends BattleEvent['type']>(events: readonly BattleEvent[], type: T): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}
