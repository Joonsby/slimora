import type { BattleMode } from './battle';
import type { FamilyId, FormId, StageId, UpgradeId } from './ids';

/** 진행 상태를 바꾸는 유일한 경로 */
export type GameCommand =
  | { type: 'grantBattleReward'; gold: number; kills: Partial<Record<FamilyId, number>>; absorb?: Partial<Record<FamilyId, number>> }
  | { type: 'purchaseUpgrade'; upgrade: UpgradeId }
  | { type: 'stageCleared'; stage: StageId }
  | { type: 'challengeFailed'; stage: StageId }
  | { type: 'recordDeath' }
  | { type: 'enterStage'; stage: StageId; mode: BattleMode }
  | { type: 'setAutoAdvance'; on: boolean }
  | { type: 'evolve'; form: FormId; inBossFight: boolean };

export type RuleError =
  | { code: 'NOT_ENOUGH_GOLD'; need: number; have: number }
  | { code: 'MAX_LEVEL' }
  | { code: 'UNKNOWN_UPGRADE' }
  | { code: 'STAGE_LOCKED'; stage: StageId }
  | { code: 'INVALID_REWARD' }
  | { code: 'UNKNOWN_FORM' }
  | { code: 'IN_BOSS_FIGHT' }
  | { code: 'ALREADY_CURRENT' }
  | { code: 'FORM_LOCKED' };
