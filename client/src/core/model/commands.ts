import type { BattleMode } from './battle';
import type { FamilyId, StageId, UpgradeId } from './ids';

/** 진행 상태를 바꾸는 유일한 경로 */
export type GameCommand =
  | { type: 'grantBattleReward'; gold: number; kills: Partial<Record<FamilyId, number>> }
  | { type: 'purchaseUpgrade'; upgrade: UpgradeId }
  | { type: 'stageCleared'; stage: StageId }
  | { type: 'challengeFailed'; stage: StageId }
  | { type: 'recordDeath' }
  | { type: 'enterStage'; stage: StageId; mode: BattleMode }
  | { type: 'setAutoAdvance'; on: boolean };

export type RuleError =
  | { code: 'NOT_ENOUGH_GOLD'; need: number; have: number }
  | { code: 'MAX_LEVEL' }
  | { code: 'UNKNOWN_UPGRADE' }
  | { code: 'STAGE_LOCKED'; stage: StageId }
  | { code: 'INVALID_REWARD' };
