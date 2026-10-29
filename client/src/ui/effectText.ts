import type { EffectSpec } from '../core/model/effects';

const pct = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

/** 효과를 사람이 읽는 문장으로 */
export function describeEffect(e: EffectSpec): string {
  switch (e.kind) {
    case 'lifesteal':
      return `흡혈 ${pct(e.ratio)}`;
    case 'damageReduction':
      return `받는 피해 −${pct(e.ratio)}`;
    case 'burnOnHit':
      return e.chance >= 1 ? `공격마다 화상 (공격력의 ${pct(e.dpsRatio)}/초, 최대 ${e.maxStacks}중첩)` : `공격 시 ${pct(e.chance)} 확률로 화상`;
    case 'heavyAttack':
      return `${e.every}번째 공격마다 강타 ×${e.multiplier}`;
    case 'enrage':
      return `HP ${pct(e.hpBelowRatio)} 이하에서 격노`;
  }
}

export function describeEffects(effects: readonly EffectSpec[]): string {
  return effects.map(describeEffect).join(' · ');
}
