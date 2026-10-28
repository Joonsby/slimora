import type { RngState } from '../rng';
import type { FamilyId, MonsterId, StageId } from './ids';

/** 효과를 합산·상한 적용한 수치. 엔진은 이것만 본다 */
export interface CombatStats {
  maxHp: number;
  attack: number;
  attackIntervalMs: number;
  critChance: number;
  critMultiplier: number;
  lifesteal: number;
  damageReduction: number;
  burn: BurnSpec | null;
}

export interface BurnSpec {
  chance: number;
  dpsRatio: number;
  durationMs: number;
  maxStacks: number;
}

export type Side = 'slime' | 'monster';
export type BattleMode = 'challenge' | 'farm';
export type BattlePhase = 'spawning' | 'fighting' | 'slimeDown' | 'cleared' | 'failed';

export interface BurnState {
  stacks: number;
  dpsPerStack: number;
  endsAt: number;
  nextTickAt: number;
}

export interface UnitState {
  stats: CombatStats;
  hp: number;
  nextAttackAt: number;
  burn: BurnState | null;
}

export interface MonsterState extends UnitState {
  defId: MonsterId;
  family: FamilyId;
  seq: number;
  gold: number;
}

export interface BattleState {
  /** 엔진 시각(ms). 실제 시각과 무관하다 */
  now: number;
  stageId: StageId;
  mode: BattleMode;
  phase: BattlePhase;
  /** spawning · slimeDown 이 끝나는 시각 */
  phaseUntil: number;
  kills: number;
  killsToClear: number;
  slime: UnitState;
  monster: MonsterState | null;
  rng: RngState;
  seq: number;
}

export type BattleEvent =
  | { type: 'monsterSpawned'; at: number; defId: MonsterId; seq: number; maxHp: number }
  | { type: 'attack'; at: number; by: Side }
  | { type: 'damage'; at: number; to: Side; amount: number; crit: boolean; source: 'hit' | 'burn'; reducedBy: number }
  | { type: 'heal'; at: number; to: Side; amount: number; source: 'lifesteal' | 'regen' }
  | { type: 'burnApplied'; at: number; to: Side; stacks: number }
  | { type: 'monsterKilled'; at: number; defId: MonsterId; family: FamilyId; seq: number; gold: number }
  | { type: 'slimeDied'; at: number }
  | { type: 'respawned'; at: number }
  | { type: 'stageCleared'; at: number; stageId: StageId }
  | { type: 'challengeFailed'; at: number; stageId: StageId };
