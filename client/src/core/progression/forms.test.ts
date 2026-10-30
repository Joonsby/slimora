import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../../testing/fixtures';
import type { ProgressState } from '../model/progress';
import { deriveSlimeStats } from '../stats';
import { applyCommand } from './applyCommand';
import { checkEvolve, diffForms, evolveCost, formStatus, masteryLevel } from './forms';
import { createInitialProgress } from './initial';

const cfg = cloneConfig();
const form = (id: string) => cfg.forms.find((f) => f.id === id)!;

function progress(patch: { gold?: number; bat?: number; golem?: number; fire?: number; cleared?: number; form?: string | null; unlocked?: string[] } = {}): ProgressState {
  const p = createInitialProgress(cfg);
  return {
    ...p,
    gold: patch.gold ?? 0,
    slime: {
      ...p.slime,
      absorption: { bat: patch.bat ?? 0, golem: patch.golem ?? 0, fire: patch.fire ?? 0 },
      form: patch.form ?? null,
      unlockedForms: patch.unlocked ?? (patch.form ? [patch.form] : []),
    },
    stage: { ...p.stage, highestCleared: patch.cleared ?? 0 },
  };
}

function evolve(s: ProgressState, id: string): ProgressState {
  const r = applyCommand(s, { type: 'evolve', form: id, inBossFight: false }, cfg);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe('형태 상태', () => {
  it('요건은 계열 흡수 200 과 3 스테이지 클리어 둘 다', () => {
    expect(formStatus(form('vampire'), progress({ bat: 200, cleared: 2 }).slime, 2)).toBe('locked');
    expect(formStatus(form('vampire'), progress({ bat: 199, cleared: 3 }).slime, 3)).toBe('locked');
    expect(formStatus(form('vampire'), progress({ bat: 200, cleared: 3 }).slime, 3)).toBe('available');
  });

  it('진화하면 현재 형태, 다른 형태로 바꾸면 해금 상태로 남는다', () => {
    const vampire = evolve(progress({ bat: 200, golem: 200, cleared: 3 }), 'vampire');
    expect(formStatus(form('vampire'), vampire.slime, 3)).toBe('current');
    const iron = evolve(vampire, 'iron');
    expect(formStatus(form('vampire'), iron.slime, 3)).toBe('unlocked');
    expect(formStatus(form('iron'), iron.slime, 3)).toBe('current');
    expect(iron.slime.unlockedForms).toEqual(['vampire', 'iron']);
  });

  it('흡수 · 클리어가 늘기만 하므로 진화 가능에서 잠김으로 돌아가지 않는다', () => {
    const before = progress({ bat: 250, cleared: 3 });
    const after = progress({ bat: 400, cleared: 5 });
    expect(diffForms(before, after, cfg)).toEqual([]);
    expect(diffForms(progress({ bat: 199, cleared: 3 }), progress({ bat: 200, cleared: 3 }), cfg)).toEqual([{ type: 'formAvailable', form: 'vampire' }]);
    expect(diffForms(progress({ fire: 300, cleared: 2 }), progress({ fire: 300, cleared: 3 }), cfg)).toEqual([{ type: 'formAvailable', form: 'flame' }]);
  });
});

describe('진화 검사', () => {
  it('순서: 보스전 → 이미 현재 형태 → 요건 → 골드', () => {
    const current = progress({ bat: 200, cleared: 3, form: 'vampire' });
    expect(checkEvolve(current, 'vampire', cfg, true)).toEqual({ ok: false, error: { code: 'IN_BOSS_FIGHT' } });
    expect(checkEvolve(current, 'vampire', cfg, false)).toEqual({ ok: false, error: { code: 'ALREADY_CURRENT' } });
    expect(checkEvolve(current, 'iron', cfg, false)).toEqual({ ok: false, error: { code: 'FORM_LOCKED' } });
    const back = progress({ bat: 200, golem: 200, cleared: 3, form: 'iron', unlocked: ['vampire', 'iron'] });
    expect(checkEvolve(back, 'vampire', cfg, false)).toEqual({ ok: false, error: { code: 'NOT_ENOUGH_GOLD', need: 345, have: 0 } });
    expect(checkEvolve(back, 'ghost', cfg, false)).toEqual({ ok: false, error: { code: 'UNKNOWN_FORM' } });
  });

  it('처음 진화하는 형태는 무료, 해금한 형태로 돌아갈 때는 floor(200 × 1.2^최고클리어)', () => {
    const s = progress({ bat: 200, golem: 200, cleared: 3, form: 'iron', unlocked: ['vampire', 'iron'] });
    expect(evolveCost(form('flame'), s.slime, 3, cfg)).toBe(0);
    expect(evolveCost(form('vampire'), s.slime, 3, cfg)).toBe(345);
    expect(evolveCost(form('vampire'), s.slime, 7, cfg)).toBe(Math.floor(200 * 1.2 ** 7));
    const r = applyCommand({ ...s, gold: 500 }, { type: 'evolve', form: 'vampire', inBossFight: false }, cfg);
    expect(r.ok && r.value.gold).toBe(155);
  });
});

describe('숙련과 능력치', () => {
  it('숙련은 그 계열 흡수 200 / 1,000 / 3,000 / 8,000 / 20,000 에서 오른다', () => {
    expect([199, 200, 999, 1000, 3000, 8000, 20000].map((n) => masteryLevel(form('iron'), { golem: n }))).toEqual([0, 1, 1, 2, 3, 4, 5]);
  });

  it('형태가 효과와 기본 능력치를 바꾼다', () => {
    const base = { upgrades: {}, absorption: { bat: 200, golem: 200, fire: 200 } };
    const plain = deriveSlimeStats(base, cfg);
    const vampire = deriveSlimeStats({ ...base, form: 'vampire' }, cfg);
    const iron = deriveSlimeStats({ ...base, form: 'iron' }, cfg);
    const flame = deriveSlimeStats({ ...base, form: 'flame' }, cfg);
    expect(vampire.lifesteal).toBeCloseTo(plain.lifesteal + 0.12);
    expect(iron.damageReduction).toBeCloseTo(plain.damageReduction + 0.2);
    expect(iron.maxHp).toBeGreaterThan(plain.maxHp);
    expect(iron.attack).toBeLessThan(plain.attack);
    expect(flame.burn).toMatchObject({ chance: 1, dpsRatio: 0.15, maxStacks: 3 });
  });

  it('숙련이 오르면 알린다 (현재 형태만)', () => {
    const before = progress({ golem: 990, cleared: 3, form: 'iron' });
    const after = progress({ golem: 1010, cleared: 3, form: 'iron' });
    expect(diffForms(before, after, cfg)).toEqual([{ type: 'masteryUp', form: 'iron', level: 2 }]);
  });
});
