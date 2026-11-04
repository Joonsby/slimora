import { describe, expect, it } from 'vitest';
import { dungeonInit } from '../core/progression/dungeon';
import { seedFrom } from '../core/rng';
import { cloneConfig } from '../testing/fixtures';
import { autoPlay } from './autoPlay';
import { pickByName, runDungeon, ULTS } from './dungeonBot';

/**
 * 밸런스 회귀 — 첫 던전(스테이지 2 를 막 깬 진행, 처음 깨는 사람의 도움)을 자동 플레이어로 돌린다.
 * 시뮬레이션 승률은 사람의 승률이 아니다. 설정을 바꾸다 초반 경험이 크게 무너지는 것을 막는 경계선이다 (DUNGEON.md 14장)
 */
describe('밸런스 회귀 — 첫 던전', async () => {
  const cfg = cloneConfig();
  const { progress } = await autoPlay(cfg, { maxGameMs: 60 * 60_000, retryAfterMs: 20_000, stepMs: 250, speed: 3, seed: 1, untilStage: cfg.dungeon.unlockStage, recruit: true, ultimate: true });
  const SEEDS = 80;
  const clearRate = (pick: string, ult: keyof typeof ULTS) => {
    let clears = 0;
    for (let i = 0; i < SEEDS; i++) {
      const init = dungeonInit(progress, 1, seedFrom(0xd0, 1, i), cfg);
      if (runDungeon(init, cfg, pickByName(pick), ULTS[ult], seedFrom(0xb07, i), { teach: true }).state.phase === 'cleared') clears += 1;
    }
    return clears / SEEDS;
  };

  it('처음 깨는 사람에게 도움이 붙는다', () => {
    expect(dungeonInit(progress, 1, 1, cfg).assist).toBe(true);
  });

  it('규칙을 익힌 사람(무작위 스킬 · 예고를 보고 필살기)은 절반 넘게, 조합까지 하면 대부분 깬다 — 그래도 둘의 차이는 남는다', () => {
    const basic = clearRate('무작위', '적절');
    const good = clearRate('시너지', '적절');
    const blind = clearRate('무작위', '무작위');
    expect(basic).toBeGreaterThanOrEqual(0.5);
    expect(basic).toBeLessThanOrEqual(0.85);
    expect(good).toBeGreaterThanOrEqual(0.75);
    expect(good - basic).toBeGreaterThanOrEqual(0.08);
    // 필살기 타이밍이 의미가 있다
    expect(basic - blind).toBeGreaterThanOrEqual(0.15);
  });

  it('시너지 전략도 제시된 셋 · 다시 뽑기 횟수를 지킨다 (어기면 runDungeon 이 던진다)', () => {
    const init = dungeonInit(progress, 1, 5, cfg);
    const r = runDungeon(init, cfg, pickByName('시너지'), ULTS.적절, 9, { teach: true });
    expect(r.rerolls).toBeLessThanOrEqual(init.rerolls);
    expect(r.picks.length).toBeLessThanOrEqual(cfg.dungeon.picks.beforeWaves.length);
  });
});
