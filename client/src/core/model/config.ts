import type { EffectSpec } from './effects';
import type { FamilyId, FormId, LegacyId, MercenaryId, MonsterId, StageId, UpgradeId } from './ids';

export interface GameConfig {
  configVersion: string;
  balance: BalanceConfig;
  families: FamilyDef[];
  monsters: MonsterDef[];
  /** 장 이름 (사냥터 목록 · HUD). 스테이지의 chapter 가 가리킨다 */
  chapters: ChapterDef[];
  stages: StageDef[];
  upgrades: UpgradeDef[];
  traits: TraitDef[];
  forms: FormDef[];
  /** 환생 정수로 사는 영구 강화 */
  legacy: LegacyDef[];
  /** 뽑기로 모으는 동료 */
  mercenaries: MercenaryDef[];
  /** 결제 상품. sku 는 두 스토어(앱인토스 · 원스토어)에 같은 ID 로 등록한다 */
  shop: ProductDef[];
}

export interface ProductDef {
  sku: string;
  name: string;
  /** consumable = 여러 번 살 수 있다 · once = 한 번만 (스타터 팩 · 광고 패스) */
  kind: 'consumable' | 'once';
  /** 보너스 포함 지급 보석 */
  gems: number;
  /** 표시용 — gems 중 보너스 */
  bonus: number;
  essence: number;
  adPass: boolean;
  /** 스토어 가격을 못 받을 때 보여 줄 원화 가격 */
  priceKrw: number;
  desc: string;
}

export interface BalanceConfig {
  slimeBase: { maxHp: number; attack: number; attackIntervalMs: number; critChance: number; critMultiplier: number };
  caps: { damageReduction: number; lifesteal: number; critChance: number };
  battle: { spawnDelayMs: number; regenOnKillRatio: number; deathDelayMs: number; burnTickMs: number };
  stageScaling: { hpBase: number; atkBase: number; powerGrowth: number; goldBase: number; goldGrowth: number; absorbStep: number };
  /** 레벨 = 1 + floor(√(흡수 총합 ÷ divisor)). 레벨 1 을 넘는 레벨마다 기본 HP · 공격력 +statBonusPerLevel */
  level: { divisor: number; statBonusPerLevel: number };
  /** 전환 비용 = floor(switchCostBase × switchCostGrowth^최고클리어). 진화 연출 동안 전투를 멈춘다 */
  evolution: { switchCostBase: number; switchCostGrowth: number; pauseMs: number };
  /** 떠나 있던 시간(minAwayMs 이상, capMs 까지)만큼 사냥터를 simMs 동안 실제로 돌려 본 속도 × efficiency 로 준다. 광고를 보면 adMultiplier 배 */
  offline: { minAwayMs: number; capMs: number; efficiency: number; simMs: number; adMultiplier: number };
  /** unlockStage 를 깨면 환생할 수 있다. 받는 정수 = floor(essenceBase × essenceGrowth^(최고클리어 − unlockStage)) */
  prestige: { unlockStage: StageId; essenceBase: number; essenceGrowth: number };
  /** 보석 뽑기. 등급을 rates 로 고르고, 그 등급 안에서는 같은 확률. ten 은 희귀 이상 1명 보장 */
  gacha: { single: number; ten: number; rates: Record<Rarity, number>; maxLevel: number; maxedRefund: number };
  /** 보석 얻는 곳. 첫 클리어 = firstClearBase + firstClearPerStage × (스테이지 − 1) */
  gems: { starter: number; firstClearBase: number; firstClearPerStage: number; rebirth: number; adReward: number; adDailyLimit: number };
  /** 함께 싸우는 용병 수. 레벨마다 지원 공격 +supportPerLevel, 패시브 +passivePerLevel (비율) */
  party: { slots: number; supportPerLevel: number; passivePerLevel: number };
}

export type Rarity = 'common' | 'rare' | 'legendary';

/** 용병. 편성하면 지원 공격(슬라임 공격력 × power, intervalMs 마다)과 패시브를 준다 */
export interface MercenaryDef {
  id: MercenaryId;
  name: string;
  rarity: Rarity;
  /** 외형: 몬스터 프리셋(bat · golem · dragon) 또는 slime */
  look: { preset: string; tint: string };
  support: { power: number; intervalMs: number };
  passive: { stat: 'attack' | 'maxHp' | 'gold' | 'critChance' | 'damageReduction'; value: number };
}

export interface FamilyDef {
  id: FamilyId;
  name: string;
  color: string;
}

export interface MonsterDef {
  id: MonsterId;
  family: FamilyId;
  name: string;
  hpMul: number;
  atkMul: number;
  attackIntervalMs: number;
  goldMul: number;
  absorbMul: number;
  effects: EffectSpec[];
  visual: { preset: string; tint: string; scale: number };
}

export interface ChapterDef {
  id: number;
  name: string;
}

export interface StageDef {
  id: StageId;
  chapter: number;
  name: string;
  /** 전투 배경 장면 키 (art/backgrounds). 모르는 키면 기본 장면 */
  scene: string;
  spawns: { monster: MonsterId; weight: number }[];
  killsToClear: number;
  /** 처치 목표를 채우면 등장한다. 등장 순간부터 제한시간이 흐른다 */
  boss?: { monster: MonsterId; timeLimitMs: number };
  overrides?: Partial<{ hp: number; atk: number; goldPerKill: number; absorbPerKill: number }>;
}

/** 영구 강화. 공격력 · 최대 HP · 골드는 배율(+perLevel), offlineHours 는 오프라인 보상 상한에 더하는 시간 */
export interface LegacyDef {
  id: LegacyId;
  name: string;
  stat: 'attack' | 'maxHp' | 'gold' | 'offlineHours';
  perLevel: number;
  maxLevel: number | null;
  /** cost(lv) = ceil(base × growth^lv) 정수 */
  cost: { base: number; growth: number };
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  perLevel: number;
  maxLevel: number | null;
  /** cost(lv) = floor(base × growth^lv) */
  cost: { base: number; growth: number };
  /** 돌파 — every 레벨마다 그 능력치 전체에 multiplier 를 곱한다 */
  milestone?: { every: number; multiplier: number };
}

/** 계열 흡수량이 문턱을 넘으면 그 단계의 효과가 적용된다 (단계끼리 더하지 않고 가장 높은 단계 하나) */
export interface TraitDef {
  family: FamilyId;
  tiers: { minAbsorb: number; effects: EffectSpec[] }[];
}

/** 진화 형태. 요건을 채우면 진화할 수 있고, 숙련 단계는 그 계열 흡수량으로 정해진다 */
export interface FormDef {
  id: FormId;
  name: string;
  family: FamilyId;
  requires: { absorb: number; stageCleared: StageId };
  hpMul: number;
  atkMul: number;
  mastery: { minAbsorb: number; effects: EffectSpec[] }[];
  visual: { preset: string; tint: string };
}
