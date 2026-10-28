import type { EffectSpec } from './effects';
import type { FamilyId, MonsterId, StageId, UpgradeId } from './ids';

export interface GameConfig {
  configVersion: string;
  balance: BalanceConfig;
  families: FamilyDef[];
  monsters: MonsterDef[];
  stages: StageDef[];
  upgrades: UpgradeDef[];
}

export interface BalanceConfig {
  slimeBase: { maxHp: number; attack: number; attackIntervalMs: number; critChance: number; critMultiplier: number };
  caps: { damageReduction: number; lifesteal: number; critChance: number };
  battle: { spawnDelayMs: number; regenOnKillRatio: number; deathDelayMs: number; burnTickMs: number };
  stageScaling: { hpBase: number; atkBase: number; powerGrowth: number; goldBase: number; goldGrowth: number };
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
  effects: EffectSpec[];
  visual: { preset: string; tint: string; scale: number };
}

export interface StageDef {
  id: StageId;
  chapter: number;
  name: string;
  spawns: { monster: MonsterId; weight: number }[];
  killsToClear: number;
  overrides?: Partial<{ hp: number; atk: number; goldPerKill: number }>;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  perLevel: number;
  maxLevel: number | null;
  /** cost(lv) = floor(base × growth^lv) */
  cost: { base: number; growth: number };
}
