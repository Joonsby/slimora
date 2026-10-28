/** 코드가 아는 효과 종류. 누가 무엇을 얼마나 갖는지는 데이터가 정한다 */
export type EffectSpec =
  | { kind: 'lifesteal'; ratio: number }
  | { kind: 'damageReduction'; ratio: number }
  | { kind: 'burnOnHit'; chance: number; dpsRatio: number; durationMs: number; maxStacks: number };

export type EffectKind = EffectSpec['kind'];

export const EFFECT_KINDS: readonly EffectKind[] = ['lifesteal', 'damageReduction', 'burnOnHit'];
