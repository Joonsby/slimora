import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BattleMode } from '../core/model/battle';
import type { StageId } from '../core/model/ids';
import type { ProgressState } from '../core/model/progress';
import { DEFAULT_SETTINGS, type GameSettings } from '../session/settings';

/** 전투 상태 중 React 가 보여줄 저빈도 요약. HP 같은 프레임 단위 값은 넣지 않는다 */
export interface BattleHud {
  stageId: StageId;
  mode: BattleMode;
  kills: number;
  killsToClear: number;
}

export type Sheet = 'none' | 'upgrade' | 'stage' | 'absorb';
export type LogTone = 'normal' | 'good' | 'bad' | 'gold';

export interface LogEntry {
  id: number;
  text: string;
  tone: LogTone;
}

export interface GameStoreState {
  ready: boolean;
  progress: ProgressState;
  settings: GameSettings;
  hud: BattleHud;
  sheet: Sheet;
  log: LogEntry[];
}

export type GameStore = StoreApi<GameStoreState>;

export const LOG_LIMIT = 30;

export function createGameStore(progress: ProgressState): GameStore {
  return createStore<GameStoreState>()(() => ({
    ready: false,
    progress,
    settings: { ...DEFAULT_SETTINGS },
    hud: { stageId: progress.stage.current, mode: progress.stage.mode, kills: 0, killsToClear: 0 },
    sheet: 'none',
    log: [],
  }));
}

let logSeq = 0;

export function pushLog(store: GameStore, entries: readonly Omit<LogEntry, 'id'>[]): void {
  if (entries.length === 0) return;
  const added = entries.map((e) => ({ ...e, id: ++logSeq }));
  store.setState((s) => ({ log: [...s.log, ...added].slice(-LOG_LIMIT) }));
}

export function openSheet(store: GameStore, sheet: Sheet): void {
  store.setState({ sheet });
}
