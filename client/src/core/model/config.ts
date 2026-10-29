import type { EffectSpec } from './effects';
import type { FamilyId, FormId, MonsterId, StageId, UpgradeId } from './ids';

export interface GameConfig {
  configVersion: string;
  balance: BalanceConfig;
  families: FamilyDef[];
  monsters: MonsterDef[];
  stages: StageDef[];
  upgrades: UpgradeDef[];
  traits: TraitDef[];
  forms: FormDef[];
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

export interface StageDef {
  id: StageId;
  chapter: number;
  name: string;
  spawns: { monster: MonsterId; weight: number }[];
  killsToClear: number;
  /** 처치 목표를 채우면 등장한다. 등장 순간부터 제한시간이 흐른다 */
  boss?: { monster: MonsterId; timeLimitMs: number };
  overrides?: Partial<{ hp: number; atk: number; goldPerKill: number; absorbPerKill: number }>;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  perLevel: number;
  maxLevel: number | null;
  /** cost(lv) = floor(base × growth^lv) */
  cost: { base: number; growth: number };
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
