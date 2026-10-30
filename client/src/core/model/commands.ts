import type { BattleMode } from './battle';
import type { FamilyId, FormId, LegacyId, MercenaryId, StageId, UpgradeId } from './ids';

/** 진행 상태를 바꾸는 유일한 경로 */
export type GameCommand =
  | { type: 'grantBattleReward'; gold: number; kills: Partial<Record<FamilyId, number>>; absorb?: Partial<Record<FamilyId, number>> }
  | { type: 'purchaseUpgrade'; upgrade: UpgradeId }
  | { type: 'stageCleared'; stage: StageId }
  | { type: 'challengeFailed'; stage: StageId }
  | { type: 'recordDeath' }
  | { type: 'enterStage'; stage: StageId; mode: BattleMode }
  | { type: 'setAutoAdvance'; on: boolean }
  | { type: 'evolve'; form: FormId; inBossFight: boolean }
  | { type: 'rebirth' }
  | { type: 'purchaseLegacy'; legacy: LegacyId }
  /** seed 로 결과가 정해진다 (같은 seed 면 같은 용병) */
  | { type: 'summon'; count: 1 | 10; seed: number }
  | { type: 'setParty'; party: MercenaryId[] }
  /** 광고를 끝까지 본 보상. day = 오늘 날짜 */
  | { type: 'claimAdGems'; day: string }
  /** 스토어 결제가 끝난 주문을 지급한다. 같은 orderId 는 한 번만 */
  | { type: 'grantPurchase'; sku: string; orderId: string };

export type RuleError =
  | { code: 'NOT_ENOUGH_GOLD'; need: number; have: number }
  | { code: 'MAX_LEVEL' }
  | { code: 'UNKNOWN_UPGRADE' }
  | { code: 'STAGE_LOCKED'; stage: StageId }
  | { code: 'INVALID_REWARD' }
  | { code: 'UNKNOWN_FORM' }
  | { code: 'IN_BOSS_FIGHT' }
  | { code: 'ALREADY_CURRENT' }
  | { code: 'FORM_LOCKED' }
  | { code: 'REBIRTH_LOCKED'; need: StageId }
  | { code: 'NOT_ENOUGH_ESSENCE'; need: number; have: number }
  | { code: 'UNKNOWN_LEGACY' }
  | { code: 'NOT_ENOUGH_GEMS'; need: number; have: number }
  | { code: 'INVALID_PARTY' }
  | { code: 'AD_LIMIT' }
  | { code: 'UNKNOWN_PRODUCT' };
