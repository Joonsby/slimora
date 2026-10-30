import type { Leaderboard } from '../session/ports';

/**
 * 토스 게임센터 리더보드 (미니앱당 하나). 미니앱 정보가 승인돼야 동작하고, 승인 전에는 notFound.
 * 열면 미니앱이 백그라운드로 간다 — 돌아오면 평소처럼 이어진다
 */
export function createTossLeaderboard(): Leaderboard {
  const sdk = () => import('@apps-in-toss/web-framework');
  return {
    async submit(score) {
      try {
        const { Game } = await sdk();
        if (!Game.setLeaderboardScore.isSupported()) return 'failed';
        const result = await Game.setLeaderboardScore({ score: String(score) });
        switch (result?.statusCode) {
          case 'SUCCESS':
            return 'ok';
          case 'PROFILE_NOT_FOUND':
            return 'noProfile';
          case 'LEADERBOARD_NOT_FOUND':
            return 'notFound';
          default:
            return 'failed';
        }
      } catch {
        return 'failed';
      }
    },
    async open() {
      try {
        const { Game } = await sdk();
        if (!Game.openLeaderboard.isSupported()) return false;
        await Game.openLeaderboard();
        return true;
      } catch {
        return false;
      }
    },
  };
}
