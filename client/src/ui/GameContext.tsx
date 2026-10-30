import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { GameConfig } from '../core/model/config';
import type { Sfx } from '../audio/sfx';
import type { GameSession } from '../session/GameSession';
import type { Leaderboard, RewardedAds, ShopStore } from '../session/ports';
import type { GameStore, GameStoreState } from '../store/gameStore';

export interface GameContextValue {
  session: GameSession;
  store: GameStore;
  config: GameConfig;
  /** 전투 화면을 붙이고, 떼는 함수를 돌려준다. ui 가 Phaser 를 직접 알지 않게 조립 지점에서 넘긴다 */
  mountBattle: (parent: HTMLElement) => () => void;
  /** 보상형 광고. 광고를 쓸 수 없는 환경(원스토어 앱 · 일반 브라우저)이면 null */
  ads: RewardedAds | null;
  sfx: Sfx;
  /** 토스 게임센터 리더보드. 토스 밖이면 null */
  leaderboard: Leaderboard | null;
  /** 인앱 결제. 결제할 수 없는 환경(일반 브라우저)이면 null */
  shop: ShopStore | null;
}

const GameContext = createContext<GameContextValue | null>(null);

export const GameProvider = GameContext.Provider;

export function useGameContext(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('GameProvider 밖에서 사용됨');
  return value;
}

/** 스토어 조각 구독. 원시값이나 그대로 보관된 참조만 고를 것 (새 객체를 만들면 무한 렌더) */
export function useGame<T>(selector: (s: GameStoreState) => T): T {
  return useStore(useGameContext().store, selector);
}
