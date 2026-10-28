import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { GameConfig } from '../core/model/config';
import type { GameSession } from '../session/GameSession';
import type { GameStore, GameStoreState } from '../store/gameStore';

export interface GameContextValue {
  session: GameSession;
  store: GameStore;
  config: GameConfig;
  /** 전투 화면을 붙이고, 떼는 함수를 돌려준다. ui 가 Phaser 를 직접 알지 않게 조립 지점에서 넘긴다 */
  mountBattle: (parent: HTMLElement) => () => void;
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
