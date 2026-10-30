import { rankScore } from '../core/progression/prestige';
import type { GameStore } from '../store/gameStore';
import { pushLog } from '../store/gameStore';
import type { GameSession } from './GameSession';
import type { Leaderboard } from './ports';

/**
 * 랭킹 점수 제출. 게임에 들어오자마자가 아니라 플레이를 마친 시점(스테이지 클리어 · 환생)에,
 * 이번 실행에서 아직 올리지 않은 더 높은 점수일 때만 보낸다
 */
export function attachRanking(session: GameSession, store: GameStore, board: Leaderboard): () => void {
  let submitted = 0;
  let pending = false;
  let toldProfile = false;
  return session.onEvents((events) => {
    if (pending || !events.some((e) => e.type === 'stageCleared' || e.type === 'rebirth')) return;
    const score = rankScore(store.getState().progress);
    if (score <= submitted) return;
    pending = true;
    void board.submit(score).then((result) => {
      pending = false;
      if (result === 'ok') submitted = score;
      if (result === 'noProfile' && !toldProfile) {
        toldProfile = true;
        pushLog(store, [{ text: '랭킹에 오르려면 트로피 버튼에서 게임 프로필을 만들어 주세요', tone: 'normal' }]);
      }
    });
  });
}
