import { describe, expect, it } from 'vitest';
import { createInitialProgress } from '../core/progression/initial';
import { createGameStore } from '../store/gameStore';
import { cloneConfig } from '../testing/fixtures';
import type { GameSession, SessionEvent, SessionListener } from './GameSession';
import type { Leaderboard } from './ports';
import { attachRanking } from './rankingSync';

const cfg = cloneConfig();

function setup(answer: Awaited<ReturnType<Leaderboard['submit']>> = 'ok') {
  const store = createGameStore(createInitialProgress(cfg));
  let listener: SessionListener = () => {};
  const session = { onEvents: (l: SessionListener) => ((listener = l), () => {}) } as unknown as GameSession;
  const submitted: number[] = [];
  const board: Leaderboard = { submit: async (score) => (submitted.push(score), answer), open: async () => true };
  attachRanking(session, store, board);
  const clearStage = async (highestCleared: number) => {
    const p = store.getState().progress;
    store.setState({ progress: { ...p, stage: { ...p.stage, highestCleared } } });
    listener([{ type: 'stageCleared', at: 0, stageId: highestCleared } as SessionEvent]);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { store, submitted, clearStage, emit: (e: SessionEvent) => listener([e]) };
}

describe('랭킹 점수 제출', () => {
  it('들어오자마자는 보내지 않고, 클리어할 때 더 높은 점수만 보낸다', async () => {
    const { submitted, clearStage, emit } = setup();
    emit({ type: 'battleStarted', at: 0, stageId: 1, mode: 'challenge' });
    expect(submitted).toEqual([]);
    await clearStage(1);
    await clearStage(1);
    await clearStage(2);
    expect(submitted).toEqual([1, 2]);
  });

  it('프로필이 없으면 한 번만 안내하고, 다음 클리어 때 다시 시도한다', async () => {
    const { store, submitted, clearStage } = setup('noProfile');
    await clearStage(1);
    await clearStage(1);
    expect(submitted).toEqual([1, 1]);
    expect(store.getState().log.filter((l) => l.text.includes('게임 프로필'))).toHaveLength(1);
  });
});
