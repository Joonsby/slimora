/** 코드가 아는 효과 종류. 누가 무엇을 얼마나 갖는지는 데이터가 정한다 */
export type EffectSpec =
  | { kind: 'lifesteal'; ratio: number }
  | { kind: 'damageReduction'; ratio: number }
  | { kind: 'burnOnHit'; chance: number; dpsRatio: number; durationMs: number; maxStacks: number }
  /** every 번째 공격마다 multiplier 배 강타. 직전 공격 때 예고한다 */
  | { kind: 'heavyAttack'; every: number; multiplier: number }
  /** HP 가 hpBelowRatio 아래로 떨어지면 공격 간격 × attackIntervalMul (1회) */
  | { kind: 'enrage'; hpBelowRatio: number; attackIntervalMul: number };

export type EffectKind = EffectSpec['kind'];

export const EFFECT_KINDS: readonly EffectKind[] = ['lifesteal', 'damageReduction', 'burnOnHit', 'heavyAttack', 'enrage'];
