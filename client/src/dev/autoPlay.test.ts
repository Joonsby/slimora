import { describe, expect, it } from 'vitest';
import { gameConfig } from '../data';
import { autoPlay } from './autoPlay';

/** 밸런스 불변식 — 수치를 바꾸다 게임이 막히거나 너무 쉬워지면 여기서 걸린다 */
describe('자동 플레이로 본 진행', () => {
  it('공격력 강화만으로 마지막 스테이지까지 깰 수 있다 (×1 기준 3~20분)', async () => {
    const result = await autoPlay(gameConfig, { maxGameMs: 30 * 60_000, retryAfterMs: 30_000, seed: 1 });
    expect(result.finishedAtMs).not.toBeNull();
    expect(result.finishedAtMs!).toBeGreaterThan(3 * 60_000);
    expect(result.finishedAtMs!).toBeLessThan(20 * 60_000);
  });

  it('강화 없이도 1 스테이지는 깬다', async () => {
    const result = await autoPlay(gameConfig, { maxGameMs: 60_000, retryAfterMs: 30_000, seed: 2 });
    expect(result.clearedAtMs[1]).toBeLessThan(60_000);
  });
});
