import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../../testing/fixtures';
import { absorptionForLevel, collectTraitEffects, diffGrowth, getSlimeLevel, traitTier } from './absorption';

const cfg = cloneConfig();
const bat = cfg.traits.find((t) => t.family === 'bat')!;

describe('슬라임 레벨', () => {
  it('레벨 = 1 + floor(√(흡수 총합 ÷ 10)) — 모든 계열을 더한다', () => {
    expect(getSlimeLevel({}, cfg)).toBe(1);
    expect(getSlimeLevel({ bat: 9 }, cfg)).toBe(1);
    expect(getSlimeLevel({ bat: 5, golem: 5 }, cfg)).toBe(2);
    expect(getSlimeLevel({ fire: 40 }, cfg)).toBe(3);
    expect(getSlimeLevel({ bat: 1000 }, cfg)).toBe(11);
  });

  it('레벨 N 이 되는 흡수 총합 = 10 × (N−1)²', () => {
    for (const level of [2, 3, 7, 20]) {
      const need = absorptionForLevel(level, cfg);
      expect(getSlimeLevel({ bat: need }, cfg)).toBe(level);
      expect(getSlimeLevel({ bat: need - 1 }, cfg)).toBe(level - 1);
    }
  });
});

describe('특성', () => {
  it('문턱 50 · 300 · 1,000 에서 단계가 오른다', () => {
    expect([0, 49, 50, 299, 300, 999, 1000, 99999].map((n) => traitTier(bat, n))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('계열마다 가장 높은 단계의 효과 하나만 적용된다 (단계끼리 더하지 않음)', () => {
    expect(collectTraitEffects({ bat: 400, golem: 10, fire: 1000 }, cfg)).toEqual([
      { kind: 'lifesteal', ratio: 0.02 },
      { kind: 'burnOnHit', chance: 0.15, dpsRatio: 0.05, durationMs: 2000, maxStacks: 1 },
    ]);
  });

  it('한 번에 여러 단계를 넘으면 단계마다 변화를 알린다', () => {
    expect(diffGrowth({ bat: 10 }, { bat: 310 }, cfg)).toEqual([
      { type: 'traitTierUp', family: 'bat', tier: 1 },
      { type: 'traitTierUp', family: 'bat', tier: 2 },
      { type: 'levelUp', level: 6 },
    ]);
    expect(diffGrowth({ bat: 10 }, { bat: 11 }, cfg)).toEqual([]);
  });
});
