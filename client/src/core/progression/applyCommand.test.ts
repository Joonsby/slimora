import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../../testing/fixtures';
import type { ProgressState } from '../model/progress';
import { applyCommand } from './applyCommand';
import { createInitialProgress } from './initial';
import { getUpgradeCost } from './upgrades';

const cfg = cloneConfig();
const initial = () => createInitialProgress(cfg);
const withStage = (patch: Partial<ProgressState['stage']>): ProgressState => ({ ...initial(), stage: { ...initial().stage, ...patch } });

function apply(s: ProgressState, ...args: Parameters<typeof applyCommand>[1][]) {
  return args.reduce((acc, cmd) => {
    const r = applyCommand(acc, cmd, cfg);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.value;
  }, s);
}

describe('보상 · 강화', () => {
  it('처치 보상은 골드와 계열별 처치 수를 쌓고 원본은 바꾸지 않는다', () => {
    const before = initial();
    const after = apply(before, { type: 'grantBattleReward', gold: 7, kills: { bat: 1 } }, { type: 'grantBattleReward', gold: 3, kills: { golem: 2 } });
    expect(after.gold).toBe(10);
    expect(after.lifetime).toMatchObject({ goldEarned: 10, kills: { bat: 1, golem: 2, fire: 0 } });
    expect(before.gold).toBe(0);
  });

  it('비용 = floor(10 × 1.13^레벨)', () => {
    const def = cfg.upgrades[0]!;
    expect([0, 1, 2, 10].map((lv) => getUpgradeCost(def, lv))).toEqual([10, 11, 12, 33]);
  });

  it('골드가 있으면 레벨이 오르고 비용만큼 줄어든다', () => {
    const s = apply(initial(), { type: 'grantBattleReward', gold: 25, kills: {} }, { type: 'purchaseUpgrade', upgrade: 'attack' });
    expect(s.gold).toBe(15);
    expect(s.slime.upgrades.attack).toBe(1);
  });

  it('골드가 모자라면 거부한다', () => {
    expect(applyCommand(initial(), { type: 'purchaseUpgrade', upgrade: 'attack' }, cfg)).toEqual({
      ok: false,
      error: { code: 'NOT_ENOUGH_GOLD', need: 10, have: 0 },
    });
  });

  it('음수 · 비정상 보상은 거부한다', () => {
    expect(applyCommand(initial(), { type: 'grantBattleReward', gold: -1, kills: {} }, cfg).ok).toBe(false);
    expect(applyCommand(initial(), { type: 'grantBattleReward', gold: Number.NaN, kills: {} }, cfg).ok).toBe(false);
  });
});

describe('스테이지 진행', () => {
  it('클리어 + 자동진행 ON → 다음 스테이지 도전', () => {
    expect(apply(withStage({ current: 2 }), { type: 'stageCleared', stage: 2 }).stage).toEqual({
      highestCleared: 2,
      current: 3,
      mode: 'challenge',
      autoAdvance: true,
    });
  });

  it('클리어 + 자동진행 OFF → 같은 스테이지 사냥', () => {
    expect(apply(withStage({ current: 2, autoAdvance: false }), { type: 'stageCleared', stage: 2 }).stage).toMatchObject({
      highestCleared: 2,
      current: 2,
      mode: 'farm',
    });
  });

  it('마지막 스테이지를 깨면 그 자리에서 사냥', () => {
    const last = cfg.stages.length;
    expect(apply(withStage({ current: last, highestCleared: last - 1 }), { type: 'stageCleared', stage: last }).stage).toMatchObject({
      highestCleared: last,
      current: last,
      mode: 'farm',
    });
  });

  it('도전 실패 → 최고 클리어 스테이지 사냥으로 후퇴하고 자동진행을 끈다', () => {
    expect(apply(withStage({ current: 5, highestCleared: 4 }), { type: 'challengeFailed', stage: 5 }).stage).toEqual({
      highestCleared: 4,
      current: 4,
      mode: 'farm',
      autoAdvance: false,
    });
  });

  it('클리어한 곳이 없으면 1 스테이지를 다시 도전한다', () => {
    expect(apply(initial(), { type: 'challengeFailed', stage: 1 }).stage).toMatchObject({ current: 1, mode: 'challenge', autoAdvance: true });
  });

  it('사냥은 클리어한 곳만, 도전은 바로 다음 스테이지까지만', () => {
    const s = withStage({ highestCleared: 2, current: 2, mode: 'farm' });
    expect(apply(s, { type: 'enterStage', stage: 1, mode: 'farm' }).stage).toMatchObject({ current: 1, mode: 'farm' });
    expect(apply(s, { type: 'enterStage', stage: 3, mode: 'challenge' }).stage).toMatchObject({ current: 3, mode: 'challenge' });
    expect(applyCommand(s, { type: 'enterStage', stage: 3, mode: 'farm' }, cfg)).toMatchObject({ ok: false, error: { code: 'STAGE_LOCKED' } });
    expect(applyCommand(s, { type: 'enterStage', stage: 4, mode: 'challenge' }, cfg)).toMatchObject({ ok: false, error: { code: 'STAGE_LOCKED' } });
    expect(applyCommand(s, { type: 'enterStage', stage: 99, mode: 'challenge' }, cfg).ok).toBe(false);
  });

  it('사망은 통계에만 남는다', () => {
    const s = apply(initial(), { type: 'recordDeath' }, { type: 'recordDeath' });
    expect(s.lifetime.deaths).toBe(2);
    expect(s.gold).toBe(0);
  });
});
