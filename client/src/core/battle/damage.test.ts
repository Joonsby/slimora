import { describe, expect, it } from 'vitest';
import { stats } from '../../testing/fixtures';
import { applyBurn, burnTickDamage, computeHit, lifestealAmount } from './damage';

describe('computeHit — 피해 공식', () => {
  it('피해감소가 없으면 공격력 그대로', () => {
    expect(computeHit(stats({ attack: 10 }), stats(), 0.99)).toEqual({ amount: 10, crit: false, reducedBy: 0 });
  });

  it('치명타 판정값이 확률보다 작으면 배율을 곱하고 내림한다', () => {
    const attacker = stats({ attack: 25, critChance: 0.05, critMultiplier: 1.5 });
    expect(computeHit(attacker, stats(), 0.04)).toMatchObject({ amount: 37, crit: true });
    expect(computeHit(attacker, stats(), 0.05)).toMatchObject({ amount: 25, crit: false });
  });

  it('피해감소만큼 줄이고 깎인 양을 알려준다', () => {
    expect(computeHit(stats({ attack: 10 }), stats({ damageReduction: 0.3 }), 1)).toEqual({ amount: 7, crit: false, reducedBy: 3 });
  });

  it('아무리 막아도 최소 1 은 들어간다', () => {
    expect(computeHit(stats({ attack: 1 }), stats({ damageReduction: 0.7 }), 1).amount).toBe(1);
  });
});

describe('흡혈', () => {
  it('준 피해 × 비율을 내림한다', () => {
    expect(lifestealAmount(10, 0.2)).toBe(2);
    expect(lifestealAmount(4, 0.2)).toBe(0);
  });
});

describe('화상', () => {
  const spec = { chance: 1, dpsRatio: 0.5, durationMs: 3000, maxStacks: 3 };

  it('처음 걸면 1중첩, 지속시간과 첫 틱 시각을 정한다', () => {
    expect(applyBurn(null, spec, 10, 1000, 500)).toEqual({ stacks: 1, dpsPerStack: 5, endsAt: 4000, nextTickAt: 1500 });
  });

  it('다시 걸면 중첩이 늘고 지속시간이 갱신되며 틱 주기는 유지된다', () => {
    const first = applyBurn(null, spec, 10, 1000, 500);
    expect(applyBurn(first, spec, 10, 1800, 500)).toEqual({ stacks: 2, dpsPerStack: 5, endsAt: 4800, nextTickAt: 1500 });
  });

  it('중첩은 상한을 넘지 않는다', () => {
    let burn = applyBurn(null, spec, 10, 0, 500);
    for (let i = 0; i < 10; i++) burn = applyBurn(burn, spec, 10, i * 100, 500);
    expect(burn.stacks).toBe(3);
  });

  it('틱 피해 = 중첩 × 초당피해 × 틱(초), 최소 1', () => {
    expect(burnTickDamage({ stacks: 3, dpsPerStack: 2.7, endsAt: 0, nextTickAt: 0 }, 500)).toBe(4);
    expect(burnTickDamage({ stacks: 1, dpsPerStack: 0.1, endsAt: 0, nextTickAt: 0 }, 500)).toBe(1);
  });
});
