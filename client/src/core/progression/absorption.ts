import type { GameConfig, TraitDef } from '../model/config';
import type { EffectSpec } from '../model/effects';
import type { FamilyId } from '../model/ids';

export type Absorption = Partial<Record<FamilyId, number>>;

export type GrowthChange = { type: 'levelUp'; level: number } | { type: 'traitTierUp'; family: FamilyId; tier: number };

export function totalAbsorption(absorption: Absorption): number {
  return Object.values(absorption).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** 레벨 = 1 + floor(√(흡수 총합 ÷ divisor)) */
export function getSlimeLevel(absorption: Absorption, cfg: GameConfig): number {
  return 1 + Math.floor(Math.sqrt(totalAbsorption(absorption) / cfg.balance.level.divisor));
}

/** 다음 레벨이 되는 흡수 총합 */
export function absorptionForLevel(level: number, cfg: GameConfig): number {
  return cfg.balance.level.divisor * (level - 1) ** 2;
}

/** 0 = 아직 없음, 1 부터 단계 */
export function traitTier(trait: TraitDef, amount: number): number {
  let tier = 0;
  trait.tiers.forEach((t, i) => {
    if (amount >= t.minAbsorb) tier = i + 1;
  });
  return tier;
}

/** 계열마다 가장 높은 단계의 효과만 모은다 */
export function collectTraitEffects(absorption: Absorption, cfg: GameConfig): EffectSpec[] {
  return cfg.traits.flatMap((trait) => {
    const tier = traitTier(trait, absorption[trait.family] ?? 0);
    return tier > 0 ? trait.tiers[tier - 1]!.effects : [];
  });
}

/** 흡수량이 바뀌어 새로 오른 레벨 · 특성 단계 */
export function diffGrowth(prev: Absorption, next: Absorption, cfg: GameConfig): GrowthChange[] {
  const changes: GrowthChange[] = [];
  for (const trait of cfg.traits) {
    const before = traitTier(trait, prev[trait.family] ?? 0);
    const after = traitTier(trait, next[trait.family] ?? 0);
    for (let tier = before + 1; tier <= after; tier++) changes.push({ type: 'traitTierUp', family: trait.family, tier });
  }
  const levelBefore = getSlimeLevel(prev, cfg);
  const levelAfter = getSlimeLevel(next, cfg);
  if (levelAfter > levelBefore) changes.push({ type: 'levelUp', level: levelAfter });
  return changes;
}
