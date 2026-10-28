import type { EffectSpec } from './effects';
import type { FamilyId, MonsterId, StageId, UpgradeId } from './ids';

export interface GameConfig {
  configVersion: string;
  balance: BalanceConfig;
  families: FamilyDef[];
  monsters: MonsterDef[];
  stages: StageDef[];
  upgrades: UpgradeDef[];
  traits: TraitDef[];
}

export interface BalanceConfig {
  slimeBase: { maxHp: number; attack: number; attackIntervalMs: number; critChance: number; critMultiplier: number };
  caps: { damageReduction: number; lifesteal: number; critChance: number };
  battle: { spawnDelayMs: number; regenOnKillRatio: number; deathDelayMs: number; burnTickMs: number };
  stageScaling: { hpBase: number; atkBase: number; powerGrowth: number; goldBase: number; goldGrowth: number; absorbStep: number };
  /** 레벨 = 1 + floor(√(흡수 총합 ÷ divisor)). 레벨 1 을 넘는 레벨마다 기본 HP · 공격력 +statBonusPerLevel */
  level: { divisor: number; statBonusPerLevel: number };
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
