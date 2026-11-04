import { createStore, type StoreApi } from 'zustand/vanilla';
import type { OfflineReward } from '../core/idle/offline';
import type { BattleMode } from '../core/model/battle';
import type { BossPatternKind, DungeonPhase, DungeonState, DungeonSummary, SkillId, SynergyId } from '../core/model/dungeon';
import type { StageId } from '../core/model/ids';
import type { ProgressState } from '../core/model/progress';
import type { DungeonGains } from '../core/progression/dungeon';
import { DEFAULT_SETTINGS, type GameSettings } from '../session/settings';

/** 전투 상태 중 React 가 보여줄 저빈도 요약. HP 같은 프레임 단위 값은 넣지 않는다 */
export interface BattleHud {
  stageId: StageId;
  mode: BattleMode;
  kills: number;
  killsToClear: number;
  /** 보스가 나왔거나 곧 나온다 */
  boss: boolean;
}

/** 던전 한 판 동안 React 가 보여 줄 요약. 웨이브 · 선택 · 스킬이 바뀔 때만 갱신한다 */
export interface DungeonHud {
  level: number;
  wave: number;
  waves: number;
  phase: DungeonPhase;
  skills: Partial<Record<SkillId, number>>;
  synergies: SynergyId[];
  offer: SkillId[] | null;
  rerolls: number;
  /** 보스 웨이브면 보스 id */
  boss: string | null;
  /** 보스가 준비 중인 큰 공격 */
  casting: BossPatternKind | null;
  ultReady: boolean;
}

/** 끝난 던전의 결과 화면 */
export interface DungeonResult {
  summary: DungeonSummary;
  gains: DungeonGains;
  record: DungeonState['record'];
  skills: Partial<Record<SkillId, number>>;
  kills: number;
  /** 전투 시간 (엔진 시각) */
  durationMs: number;
  abandoned: boolean;
}

export type Sheet = 'none' | 'upgrade' | 'stage' | 'absorb' | 'evolve' | 'rebirth' | 'mercenary' | 'shop' | 'dungeon';
export type LogTone = 'normal' | 'good' | 'bad' | 'gold';

export interface LogEntry {
  id: number;
  text: string;
  tone: LogTone;
}

/** 오프라인 보상 창. 기본 보상은 이미 받았고, 광고 보너스만 남아 있을 수 있다 */
export interface OfflineNotice {
  reward: OfflineReward;
  bonus: 'available' | 'claimed';
}

export interface GameStoreState {
  ready: boolean;
  progress: ProgressState;
  settings: GameSettings;
  hud: BattleHud;
  sheet: Sheet;
  log: LogEntry[];
  offline: OfflineNotice | null;
  /** 도전 던전 중이면 그 요약 */
  dungeon: DungeonHud | null;
  dungeonResult: DungeonResult | null;
}

export type GameStore = StoreApi<GameStoreState>;

export const LOG_LIMIT = 30;

export function createGameStore(progress: ProgressState): GameStore {
  return createStore<GameStoreState>()(() => ({
    ready: false,
    progress,
    settings: { ...DEFAULT_SETTINGS },
    hud: { stageId: progress.stage.current, mode: progress.stage.mode, kills: 0, killsToClear: 0, boss: false },
    sheet: 'none',
    log: [],
    offline: null,
    dungeon: null,
    dungeonResult: null,
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
