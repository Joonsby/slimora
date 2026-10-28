import type { BattleMode } from './battle';
import type { FamilyId, StageId, UpgradeId } from './ids';

/** 저장 대상. 오직 applyCommand 로만 바뀐다 */
export interface ProgressState {
  gold: number;
  slime: SlimeProgress;
  stage: StageProgress;
  lifetime: LifetimeStats;
}

export interface SlimeProgress {
  upgrades: Record<UpgradeId, number>;
  /** 계열별 누적 흡수량. 줄어들지 않는다 */
  absorption: Record<FamilyId, number>;
}

export interface StageProgress {
  /** 0 = 아직 없음 */
  highestCleared: number;
  current: StageId;
  mode: BattleMode;
  autoAdvance: boolean;
}

export interface LifetimeStats {
  kills: Record<FamilyId, number>;
  goldEarned: number;
  deaths: number;
}
