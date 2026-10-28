import type { UpgradeDef } from '../model/config';

export function getUpgradeCost(def: UpgradeDef, level: number): number {
  return Math.floor(def.cost.base * def.cost.growth ** level);
}

export function isMaxLevel(def: UpgradeDef, level: number): boolean {
  return def.maxLevel !== null && level >= def.maxLevel;
}
