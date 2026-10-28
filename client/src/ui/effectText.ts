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
      return `공격 시 ${pct(e.chance)} 확률로 화상`;
  }
}

export function describeEffects(effects: readonly EffectSpec[]): string {
  return effects.map(describeEffect).join(' · ');
}
