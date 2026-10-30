import { describe, expect, it } from 'vitest';
import { gameConfig } from '../data';
import { autoPlay } from './autoPlay';

const MIN = 60_000;
const DAY = 86_400_000;

/** 밸런스 불변식 — 수치를 바꾸다 게임이 막히거나 너무 쉬워지면 여기서 걸린다 */
describe('자동 플레이로 본 진행', () => {
  it('1 스테이지는 강화를 조금 하면 3분 안에 깬다', async () => {
    const result = await autoPlay(gameConfig, { maxGameMs: 10 * MIN, retryAfterMs: 30_000, seed: 2, untilStage: 1 });
    expect(result.clearedAtMs[1]).toBeLessThan(3 * MIN);
  });

  it('강화만으로 1장(보스 포함)을 깰 수 있지만 30~90분 걸리고, 실패를 몇 번 겪는다 (×1)', async () => {
    const result = await autoPlay(gameConfig, { maxGameMs: 3 * 60 * MIN, retryAfterMs: 30_000, seed: 1, untilStage: 10 });
    expect(result.finishedAtMs).not.toBeNull();
    expect(result.finishedAtMs!).toBeGreaterThan(30 * MIN);
    expect(result.finishedAtMs!).toBeLessThan(90 * MIN);
    expect(result.failures).toBeGreaterThanOrEqual(3);
  });

  it('진화 · 용병 · 환생을 쓰면 마지막 스테이지까지 간다 — ×1 전투 시간으로 4~30일', async () => {
    const result = await autoPlay(gameConfig, {
      maxGameMs: (40 * DAY) / 3,
      retryAfterMs: 30_000,
      stepMs: 250,
      speed: 3,
      seed: 1,
      evolveTo: 'iron',
      recruit: true,
      rebirthWhenStuckMs: 20 * MIN,
    });
    expect(result.finishedAtMs).not.toBeNull();
    expect(result.finishedAtMs!).toBeGreaterThan(4 * DAY);
    expect(result.finishedAtMs!).toBeLessThan(30 * DAY);
    expect(result.rebirths).toBeGreaterThanOrEqual(10);
  }, 60_000);
});
