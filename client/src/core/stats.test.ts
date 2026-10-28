import { describe, expect, it } from 'vitest';
import { cloneConfig, stats } from '../testing/fixtures';
import { applyEffects, deriveMonsterStats, deriveSlimeStats, monsterAbsorb, monsterGold } from './stats';

const caps = { damageReduction: 0.7, lifesteal: 0.5, critChance: 0.6 };

describe('deriveSlimeStats', () => {
  it('기본값 + 공격력 강화 레벨 × 3', () => {
    const cfg = cloneConfig();
    expect(deriveSlimeStats({ upgrades: { attack: 0 } }, cfg)).toMatchObject({ maxHp: 120, attack: 12, critChance: 0.05 });
    expect(deriveSlimeStats({ upgrades: { attack: 5 } }, cfg).attack).toBe(27);
  });

  it('최대 HP 강화 레벨 × 25 · 치명타 강화 레벨 × 0.5%p', () => {
    const s = deriveSlimeStats({ upgrades: { maxHp: 4, critChance: 10 } }, cloneConfig());
    expect(s.maxHp).toBe(220);
    expect(s.critChance).toBeCloseTo(0.1);
    expect(s.attack).toBe(12);
  });

  it('레벨 1 을 넘는 레벨마다 기본 HP · 공격력 +2% (강화분에는 붙지 않음)', () => {
    // 흡수 160 → 레벨 5 → 기본값 × 1.08
    const s = deriveSlimeStats({ upgrades: { attack: 2, maxHp: 0 }, absorption: { golem: 160 } }, cloneConfig());
    expect(s.maxHp).toBe(130); // round(120 × 1.08)
    expect(s.attack).toBe(19); // round(12 × 1.08) + 3 × 2
  });

  it('흡수 특성이 슬라임 효과로 들어간다', () => {
    const s = deriveSlimeStats({ upgrades: {}, absorption: { bat: 300, golem: 1000, fire: 50 } }, cloneConfig());
    expect(s.lifesteal).toBe(0.02);
    expect(s.damageReduction).toBe(0.06);
    expect(s.burn).toEqual({ chance: 0.05, dpsRatio: 0.05, durationMs: 2000, maxStacks: 1 });
  });

  it('치명타 확률은 상한(60%)을 넘지 않는다', () => {
    const cfg = cloneConfig();
    cfg.balance.slimeBase.critChance = 0.5;
    expect(deriveSlimeStats({ upgrades: { critChance: 50 } }, cfg).critChance).toBe(0.6);
  });
});

describe('applyEffects — 같은 종류 합산', () => {
  it('흡혈 · 피해감소는 더한 뒤 상한', () => {
    const merged = applyEffects(
      stats(),
      [
        { kind: 'lifesteal', ratio: 0.3 },
        { kind: 'lifesteal', ratio: 0.3 },
        { kind: 'damageReduction', ratio: 0.2 },
      ],
      caps,
    );
    expect(merged.lifesteal).toBe(0.5);
    expect(merged.damageReduction).toBe(0.2);
  });

  it('화상은 확률을 더하고(최대 1) 나머지는 큰 값', () => {
    const merged = applyEffects(
      stats(),
      [
        { kind: 'burnOnHit', chance: 0.5, dpsRatio: 0.3, durationMs: 3000, maxStacks: 3 },
        { kind: 'burnOnHit', chance: 0.7, dpsRatio: 0.1, durationMs: 4000, maxStacks: 1 },
      ],
      caps,
    );
    expect(merged.burn).toEqual({ chance: 1, dpsRatio: 0.3, durationMs: 4000, maxStacks: 3 });
  });
});

describe('몬스터 수치', () => {
  it('스테이지 배율 × 계열 배율을 반올림한다', () => {
    const cfg = cloneConfig();
    // 3 스테이지 골렘: HP 40 × 1.22² × 1.8 = 107.2 · 공격력 4 × 1.22² × 1.4 = 8.3
    expect(deriveMonsterStats('golem', 3, cfg)).toMatchObject({ maxHp: 107, attack: 8, damageReduction: 0.3, attackIntervalMs: 1600 });
    expect(deriveMonsterStats('fireDragon', 6, cfg).burn).toEqual({ chance: 0.5, dpsRatio: 0.3, durationMs: 3000, maxStacks: 3 });
  });

  it('골드 = 4 × 1.3^(s−1) × 계열 배율', () => {
    expect(monsterGold('fireDragon', 6, cloneConfig())).toBe(16);
  });

  it('처치당 흡수 = 1 + floor((s−1) ÷ 4)', () => {
    const cfg = cloneConfig();
    expect([1, 4, 5, 6].map((s) => monsterAbsorb(cfg.stages[s - 1]!.spawns[0]!.monster, s, cfg))).toEqual([1, 1, 2, 2]);
  });

  it('스테이지 overrides 가 있으면 공식 대신 쓴다', () => {
    const cfg = cloneConfig();
    cfg.stages[0]!.overrides = { hp: 500, atk: 50, goldPerKill: 100 };
    expect(deriveMonsterStats('bat', 1, cfg)).toMatchObject({ maxHp: 350, attack: 30 });
    expect(monsterGold('bat', 1, cfg)).toBe(90);
  });
});
