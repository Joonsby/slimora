import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../data';
import { createBattle, stepBattle } from '../battle/engine';
import type { ProgressState } from '../model/progress';
import { deriveSlimeStats } from '../stats';
import { applyCommand } from './applyCommand';
import { createInitialProgress } from './initial';
import { essenceForRebirth, legacyBonus, legacyCost, rankScore } from './prestige';

const cfg = gameConfig;

function played(highestCleared: number): ProgressState {
  const p = createInitialProgress(cfg);
  return {
    ...p,
    gold: 5000,
    slime: { upgrades: { attack: 30, maxHp: 20, critChance: 10 }, absorption: { bat: 900, golem: 300, fire: 100 }, form: 'vampire', unlockedForms: ['vampire'] },
    stage: { highestCleared, current: highestCleared, mode: 'farm', autoAdvance: false },
    lifetime: { kills: { bat: 500, golem: 200, fire: 80 }, goldEarned: 90_000, deaths: 3 },
  };
}

const run = (p: ProgressState, c: Parameters<typeof applyCommand>[1]) => {
  const r = applyCommand(p, c, cfg);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe('환생', () => {
  it('1장 보스(스테이지 10)를 깨야 할 수 있고, 깊이 갈수록 정수를 더 받는다', () => {
    const { essenceBase, essenceGrowth } = cfg.balance.prestige;
    expect(applyCommand(played(9), { type: 'rebirth' }, cfg)).toEqual({ ok: false, error: { code: 'REBIRTH_LOCKED', need: 10 } });
    expect(essenceForRebirth(played(10), cfg)).toBe(essenceBase);
    expect(essenceForRebirth(played(13), cfg)).toBe(Math.floor(essenceBase * essenceGrowth ** 3));
    expect(essenceForRebirth(played(20), cfg)).toBeGreaterThan(essenceForRebirth(played(13), cfg));
  });

  it('골드 · 강화 · 흡수 · 스테이지는 처음으로, 형태 · 누적 기록 · 정수는 남는다', () => {
    const before = played(10);
    const after = run(before, { type: 'rebirth' });
    expect(after.gold).toBe(0);
    expect(after.slime).toEqual({ upgrades: { attack: 0, maxHp: 0, critChance: 0 }, absorption: { bat: 0, golem: 0, fire: 0 }, form: 'vampire', unlockedForms: ['vampire'] });
    expect(after.stage).toEqual({ highestCleared: 0, current: 1, mode: 'challenge', autoAdvance: false });
    expect(after.lifetime).toEqual(before.lifetime);
    expect(after.prestige).toMatchObject({ count: 1, essence: essenceForRebirth(before, cfg), bestStage: 10 });
  });

  it('정수로 영구 강화를 사고, 비용은 레벨마다 오른다', () => {
    let p = run(played(15), { type: 'rebirth' });
    const essence = p.prestige.essence;
    const might = cfg.legacy.find((l) => l.id === 'might')!;
    p = run(p, { type: 'purchaseLegacy', legacy: 'might' });
    expect(p.prestige.essence).toBe(essence - legacyCost(might, 0));
    expect(p.prestige.legacy.might).toBe(1);
    expect(applyCommand({ ...p, prestige: { ...p.prestige, essence: 0 } }, { type: 'purchaseLegacy', legacy: 'might' }, cfg)).toMatchObject({ ok: false, error: { code: 'NOT_ENOUGH_ESSENCE' } });
    expect(applyCommand(p, { type: 'purchaseLegacy', legacy: 'ghost' }, cfg)).toEqual({ ok: false, error: { code: 'UNKNOWN_LEGACY' } });
  });

  it('랭킹 점수 = 환생 횟수 × 100 + 모든 회차 최고 스테이지 — 환생해도 줄지 않는다', () => {
    const before = played(12);
    expect(rankScore(before)).toBe(12);
    const after = run(before, { type: 'rebirth' });
    expect(rankScore(after)).toBe(112);
    expect(rankScore({ ...after, stage: { ...after.stage, highestCleared: 15 } })).toBe(115);
  });

  it('영구 강화가 공격력 · HP · 처치 골드 · 오프라인 상한을 올린다 — 배율은 레벨마다 곱한다', () => {
    const bonus = legacyBonus({ legacy: { might: 2, jelly: 1, greed: 2, dream: 3 } }, cfg);
    expect(bonus.attack).toBeCloseTo(1.1 * 1.1);
    expect(bonus.maxHp).toBeCloseTo(1.1);
    expect(bonus.gold).toBeCloseTo(1.1 * 1.1);
    expect(bonus.offlineMs).toBe(3 * 3_600_000);
    const plain = deriveSlimeStats({ upgrades: { attack: 10 } }, cfg);
    const strong = deriveSlimeStats({ upgrades: { attack: 10 } }, cfg, bonus);
    expect(strong.attack).toBe(Math.round(plain.attack * bonus.attack));
    expect(strong.maxHp).toBe(Math.round(plain.maxHp * bonus.maxHp));

    const gold = (goldMul: number) => {
      const b = createBattle({ stageId: 1, mode: 'farm', slime: deriveSlimeStats({ upgrades: { attack: 50 } }, cfg), seed: 1, goldMul }, cfg);
      return stepBattle(b, 30_000, cfg).filter((e) => e.type === 'monsterKilled').reduce((sum, e) => sum + (e.type === 'monsterKilled' ? e.gold : 0), 0);
    };
    expect(gold(bonus.gold)).toBeGreaterThan(gold(1));
  });
});
