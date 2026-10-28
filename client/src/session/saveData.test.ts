import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../testing/fixtures';
import { newSaveData, normalizeProgress, restoreSaveData, toEnvelope } from './saveData';

const cfg = cloneConfig();

describe('저장 데이터', () => {
  it('저장 → 복원이 같은 데이터를 돌려준다', () => {
    const data = newSaveData(cfg, 1000, 'install-1');
    data.progress.gold = 321;
    data.progress.slime.upgrades.attack = 4;
    data.progress.stage = { highestCleared: 3, current: 2, mode: 'farm', autoAdvance: false };
    data.settings.battleSpeed = 3;
    const restored = restoreSaveData(structuredClone(toEnvelope(data, cfg, 2000)), cfg);
    expect(restored).toEqual(data);
  });

  it('모르는 버전 · 필수값 누락은 null', () => {
    const data = newSaveData(cfg, 0, 'x');
    expect(restoreSaveData({ ...toEnvelope(data, cfg, 0), schemaVersion: 99 }, cfg)).toBeNull();
    expect(restoreSaveData({ ...toEnvelope(data, cfg, 0), data: { ...data, installId: '' } }, cfg)).toBeNull();
    expect(restoreSaveData({ ...toEnvelope(data, cfg, 0), data: 'oops' }, cfg)).toBeNull();
  });

  it('범위를 벗어난 값은 안전한 값으로 되돌린다', () => {
    const p = normalizeProgress(
      {
        gold: -50,
        slime: { upgrades: { attack: 'abc' } },
        stage: { highestCleared: 99, current: 50, mode: 'farm', autoAdvance: 'yes' },
        lifetime: { kills: { bat: 3.7, ghost: 10 }, goldEarned: Number.NaN, deaths: 2 },
      },
      cfg,
    );
    const last = cfg.stages.length;
    expect(p).toEqual({
      gold: 0,
      slime: { upgrades: { attack: 0 } },
      stage: { highestCleared: last, current: last, mode: 'farm', autoAdvance: true },
      lifetime: { kills: { bat: 3, golem: 0, fire: 0 }, goldEarned: 0, deaths: 2 },
    });
  });

  it('클리어하지 않은 스테이지를 사냥 중이라고 적혀 있으면 도전으로 바꾼다', () => {
    expect(normalizeProgress({ stage: { highestCleared: 2, current: 3, mode: 'farm' } }, cfg).stage).toMatchObject({ current: 3, mode: 'challenge' });
  });
});
