import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../data';
import type { ProgressState } from '../model/progress';
import { createInitialProgress } from '../progression/initial';
import { computeOfflineReward, offlineStage } from './offline';

const HOUR = 3_600_000;

function progress(patch: Partial<ProgressState['stage']> = {}, attack = 10): ProgressState {
  const p = createInitialProgress(gameConfig);
  return { ...p, slime: { ...p.slime, upgrades: { attack, maxHp: attack, critChance: 0 } }, stage: { ...p.stage, highestCleared: 3, current: 2, mode: 'farm', ...patch } };
}

describe('오프라인 보상', () => {
  it('1분 미만 · 시계를 되돌린 경우는 주지 않는다', () => {
    expect(computeOfflineReward(progress(), 59_999, gameConfig, 1)).toBeNull();
    expect(computeOfflineReward(progress(), -HOUR, gameConfig, 1)).toBeNull();
    expect(computeOfflineReward(progress(), Number.NaN, gameConfig, 1)).toBeNull();
  });

  it('떠나 있던 시간에 비례하고 8시간에서 멈춘다', () => {
    const one = computeOfflineReward(progress(), HOUR, gameConfig, 7)!;
    const two = computeOfflineReward(progress(), 2 * HOUR, gameConfig, 7)!;
    const day = computeOfflineReward(progress(), 24 * HOUR, gameConfig, 7)!;
    expect(one.gold).toBeGreaterThan(0);
    expect(two.gold).toBeCloseTo(one.gold * 2, -1);
    expect(day.awayMs).toBe(8 * HOUR);
    expect(day.capped).toBe(true);
    expect(day.gold).toBe(computeOfflineReward(progress(), 8 * HOUR, gameConfig, 7)!.gold);
  });

  it('사냥 중이면 그 사냥터, 도전 중이면 최고 클리어 스테이지의 계열을 흡수한다', () => {
    expect(offlineStage(progress({ mode: 'farm', current: 2 }))).toBe(2);
    expect(offlineStage(progress({ mode: 'challenge', current: 4 }))).toBe(3);
    // 2 = 골렘 사냥터, 3 = 화염 드래곤
    expect(Object.keys(computeOfflineReward(progress({ mode: 'farm', current: 2 }), HOUR, gameConfig, 1)!.absorb)).toEqual(['golem']);
    expect(Object.keys(computeOfflineReward(progress({ mode: 'challenge', current: 4 }), HOUR, gameConfig, 1)!.absorb)).toEqual(['fire']);
  });

  it('효율 50% — 같은 시간 화면을 켜 둔 것보다 적다', () => {
    const half = computeOfflineReward(progress(), HOUR, gameConfig, 3)!;
    const full = computeOfflineReward(progress(), HOUR, { ...gameConfig, balance: { ...gameConfig.balance, offline: { ...gameConfig.balance.offline, efficiency: 1 } } }, 3)!;
    expect(half.gold).toBeCloseTo(full.gold / 2, -1);
  });
});
