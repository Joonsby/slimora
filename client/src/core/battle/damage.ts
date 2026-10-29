import type { BurnSpec, BurnState, CombatStats } from '../model/battle';

export interface HitResult {
  amount: number;
  crit: boolean;
  /** 피해감소로 깎인 양 (표시용) */
  reducedBy: number;
}

/** 최종피해 = max(1, floor(공격력 × 치명타배율 × 강타배율 × (1 − 피해감소))) */
export function computeHit(attacker: CombatStats, defender: CombatStats, critRoll: number, heavyMultiplier = 1): HitResult {
  const crit = critRoll < attacker.critChance;
  const raw = attacker.attack * (crit ? attacker.critMultiplier : 1) * heavyMultiplier;
  const amount = Math.max(1, Math.floor(raw * (1 - defender.damageReduction)));
  return { amount, crit, reducedBy: Math.max(0, Math.floor(raw) - amount) };
}

export function lifestealAmount(damage: number, ratio: number): number {
  return Math.floor(damage * ratio);
}

/** 화상은 피해감소를 무시한다 */
export function burnTickDamage(burn: BurnState, tickMs: number): number {
  return Math.max(1, Math.floor((burn.stacks * burn.dpsPerStack * tickMs) / 1000));
}

/** 새로 걸거나, 이미 걸려 있으면 1중첩 더하고 지속시간을 갱신한다 */
export function applyBurn(current: BurnState | null, spec: BurnSpec, attackerAttack: number, now: number, tickMs: number): BurnState {
  const dps = attackerAttack * spec.dpsRatio;
  if (!current) {
    return { stacks: 1, dpsPerStack: dps, endsAt: now + spec.durationMs, nextTickAt: now + tickMs };
  }
  return {
    stacks: Math.min(spec.maxStacks, current.stacks + 1),
    dpsPerStack: Math.max(current.dpsPerStack, dps),
    endsAt: now + spec.durationMs,
    nextTickAt: current.nextTickAt,
  };
}
