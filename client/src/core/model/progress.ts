import type { BattleMode } from './battle';
import type { FamilyId, FormId, LegacyId, MercenaryId, StageId, UpgradeId } from './ids';

/** 저장 대상. 오직 applyCommand 로만 바뀐다 */
export interface ProgressState {
  gold: number;
  /** 뽑기 재화. 환생해도 남는다 */
  gems: number;
  slime: SlimeProgress;
  stage: StageProgress;
  lifetime: LifetimeStats;
  prestige: PrestigeProgress;
  /** 환생해도 남는다 */
  mercenaries: MercenaryProgress;
  daily: DailyProgress;
  /** 환생해도 남는다 */
  purchases: PurchaseProgress;
}

export interface PurchaseProgress {
  /** 산 1회 한정 상품 (스타터 팩 · 광고 패스) */
  owned: string[];
  /** 이미 지급한 주문 — 같은 주문을 두 번 지급하지 않는다 (최근 것만 보관) */
  orders: PurchaseOrder[];
}

export interface PurchaseOrder {
  id: string;
  sku: string;
}

export interface MercenaryProgress {
  /** 가진 용병과 레벨 */
  owned: Record<MercenaryId, number>;
  /** 함께 싸우는 용병 (순서대로 자리) */
  party: MercenaryId[];
}

/** 하루 횟수 제한이 있는 것. day 가 바뀌면 0 부터 */
export interface DailyProgress {
  /** 'YYYY-MM-DD' (기기 날짜) */
  day: string;
  adGems: number;
}

/** 환생해도 남는 것 */
export interface PrestigeProgress {
  count: number;
  /** 쓰지 않은 정수 */
  essence: number;
  legacy: Record<LegacyId, number>;
  /** 모든 회차를 통틀어 가장 높이 깬 스테이지 */
  bestStage: number;
}

export interface SlimeProgress {
  upgrades: Record<UpgradeId, number>;
  /** 계열별 누적 흡수량. 줄어들지 않는다 */
  absorption: Record<FamilyId, number>;
  /** null = 기본 슬라임 */
  form: FormId | null;
  /** 한 번이라도 진화해 본 형태 (현재 형태 포함) */
  unlockedForms: FormId[];
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
