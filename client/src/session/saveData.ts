import { lastStageId } from '../core/lookup';
import type { GameConfig } from '../core/model/config';
import type { ProgressState } from '../core/model/progress';
import { createInitialProgress } from '../core/progression/initial';
import type { SaveEnvelope } from './ports';
import { DEFAULT_SETTINGS, normalizeSettings, type GameSettings } from './settings';

export const SCHEMA_VERSION = 1;

export interface SaveDataV1 {
  installId: string;
  createdAt: number;
  /** 다음 단계의 오프라인 보상 기준 */
  lastActiveAt: number;
  progress: ProgressState;
  settings: GameSettings;
}

export function newSaveData(cfg: GameConfig, now: number, installId: string): SaveDataV1 {
  return { installId, createdAt: now, lastActiveAt: now, progress: createInitialProgress(cfg), settings: { ...DEFAULT_SETTINGS } };
}

export function toEnvelope(data: SaveDataV1, cfg: GameConfig, now: number): SaveEnvelope {
  return { schemaVersion: SCHEMA_VERSION, configVersion: cfg.configVersion, savedAt: now, data };
}

/** 단계별 마이그레이션. 키 = 출발 버전 */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {};

/** 읽을 수 없는 저장이면 null */
export function restoreSaveData(env: SaveEnvelope, cfg: GameConfig): SaveDataV1 | null {
  let version = env.schemaVersion;
  let data = env.data;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return null;
    data = migrate(data);
    version += 1;
  }
  if (version !== SCHEMA_VERSION || typeof data !== 'object' || data === null) return null;

  const raw = data as Partial<Record<keyof SaveDataV1, unknown>>;
  if (typeof raw.installId !== 'string' || raw.installId.length === 0) return null;
  return {
    installId: raw.installId,
    createdAt: finiteOr(raw.createdAt, 0),
    lastActiveAt: finiteOr(raw.lastActiveAt, 0),
    progress: normalizeProgress(raw.progress, cfg),
    settings: normalizeSettings(raw.settings),
  };
}

/** 손상·조작·설정 변경에 대비해 값을 범위 안으로 되돌린다 */
export function normalizeProgress(raw: unknown, cfg: GameConfig): ProgressState {
  const base = createInitialProgress(cfg);
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const slime = (r.slime ?? {}) as Record<string, unknown>;
  const upgrades = (slime.upgrades ?? {}) as Record<string, unknown>;
  const stage = (r.stage ?? {}) as Record<string, unknown>;
  const lifetime = (r.lifetime ?? {}) as Record<string, unknown>;
  const kills = (lifetime.kills ?? {}) as Record<string, unknown>;

  for (const u of cfg.upgrades) {
    const level = nonNegInt(upgrades[u.id]);
    base.slime.upgrades[u.id] = u.maxLevel === null ? level : Math.min(level, u.maxLevel);
  }
  for (const f of cfg.families) base.lifetime.kills[f.id] = nonNegInt(kills[f.id]);

  const last = lastStageId(cfg);
  const highestCleared = Math.min(nonNegInt(stage.highestCleared), last);
  const current = Math.min(Math.max(1, nonNegInt(stage.current)), Math.min(last, highestCleared + 1));
  const mode = stage.mode === 'farm' && current <= highestCleared ? 'farm' : 'challenge';

  return {
    gold: nonNegNumber(r.gold),
    slime: base.slime,
    stage: { highestCleared, current, mode, autoAdvance: typeof stage.autoAdvance === 'boolean' ? stage.autoAdvance : true },
    lifetime: { kills: base.lifetime.kills, goldEarned: nonNegNumber(lifetime.goldEarned), deaths: nonNegInt(lifetime.deaths) },
  };
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nonNegNumber(v: unknown): number {
  return Math.max(0, finiteOr(v, 0));
}

function nonNegInt(v: unknown): number {
  return Math.floor(nonNegNumber(v));
}
