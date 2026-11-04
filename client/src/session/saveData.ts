import { restoreDungeon } from '../core/dungeon/checkpoint';
import { lastStageId } from '../core/lookup';
import type { GameConfig } from '../core/model/config';
import { SYNERGY_IDS, type DungeonState } from '../core/model/dungeon';
import type { ProgressState, PurchaseOrder } from '../core/model/progress';
import { createInitialProgress } from '../core/progression/initial';
import type { SaveEnvelope } from './ports';
import { DEFAULT_SETTINGS, normalizeSettings, type GameSettings } from './settings';

/**
 * v1 → v2: 슬라임에 계열별 흡수량(absorption) 추가. v2 → v3: 진화 형태(form · unlockedForms) 추가. v3 → v4: 환생(prestige) 추가.
 * v4 → v5: 보석 · 용병 · 하루 횟수 추가. v5 → v6: 결제(purchases) 추가. v6 → v7: 도전 던전(dungeon) 추가.
 * v7 → v8: 진행 중인 던전(dungeonRun) · 반영한 판 기록(dungeon.claimed) 추가, 던전 단계를 스테이지 2 칸 → 1 칸으로
 */
export const SCHEMA_VERSION = 8;

export interface SaveData {
  installId: string;
  createdAt: number;
  /** 다음 단계의 오프라인 보상 기준 */
  lastActiveAt: number;
  progress: ProgressState;
  settings: GameSettings;
  /** 진행 중이던 던전 판 (체크포인트). 진행 상태와 한 번에 저장해 보상과 어긋나지 않는다 */
  dungeonRun: DungeonState | null;
}

export function newSaveData(cfg: GameConfig, now: number, installId: string): SaveData {
  return { installId, createdAt: now, lastActiveAt: now, progress: createInitialProgress(cfg), settings: { ...DEFAULT_SETTINGS }, dungeonRun: null };
}

export function toEnvelope(data: SaveData, cfg: GameConfig, now: number): SaveEnvelope {
  return { schemaVersion: SCHEMA_VERSION, configVersion: cfg.configVersion, savedAt: now, data };
}

/** 단계별 마이그레이션. 키 = 출발 버전 */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  1: (data) => {
    const d = data as { progress?: { slime?: Record<string, unknown> } };
    const slime = d.progress?.slime;
    if (!slime) return data;
    return { ...d, progress: { ...d.progress, slime: { ...slime, absorption: slime.absorption ?? {} } } };
  },
  2: (data) => {
    const d = data as { progress?: { slime?: Record<string, unknown> } };
    const slime = d.progress?.slime;
    if (!slime) return data;
    return { ...d, progress: { ...d.progress, slime: { ...slime, form: slime.form ?? null, unlockedForms: slime.unlockedForms ?? [] } } };
  },
  3: (data) => {
    const d = data as { progress?: Record<string, unknown> };
    if (!d.progress) return data;
    return { ...d, progress: { ...d.progress, prestige: d.progress.prestige ?? { count: 0, essence: 0, legacy: {}, bestStage: 0 } } };
  },
  // 이미 하던 사람도 시작 선물(보석)을 받는다 — 값은 normalizeProgress 가 채운다
  4: (data) => data,
  // 결제 기록은 normalizeProgress 가 빈 값으로 채운다
  5: (data) => data,
  // 던전 기록도 normalizeProgress 가 빈 값으로 채운다
  6: (data) => data,
  // 던전 단계가 스테이지 2 칸마다 → 1 칸마다로 바뀌었다. 옛 L 단계(스테이지 2L) = 새 2L − 1 단계
  7: (data) => {
    const d = data as { progress?: { dungeon?: { cleared?: unknown; best?: Record<string, unknown> } } };
    const dungeon = d.progress?.dungeon;
    if (!dungeon) return data;
    const cleared = typeof dungeon.cleared === 'number' && dungeon.cleared > 0 ? dungeon.cleared * 2 - 1 : 0;
    const best = Object.fromEntries(Object.entries(dungeon.best ?? {}).map(([level, waves]) => [String(Number(level) * 2 - 1), waves]));
    return { ...d, progress: { ...d.progress, dungeon: { ...dungeon, cleared, best } } };
  },
};

/** 읽을 수 없는 저장이면 null */
export function restoreSaveData(env: SaveEnvelope, cfg: GameConfig): SaveData | null {
  let version = env.schemaVersion;
  let data = env.data;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return null;
    data = migrate(data);
    version += 1;
  }
  if (version !== SCHEMA_VERSION || typeof data !== 'object' || data === null) return null;

  const raw = data as Partial<Record<keyof SaveData, unknown>>;
  if (typeof raw.installId !== 'string' || raw.installId.length === 0) return null;
  return {
    installId: raw.installId,
    createdAt: finiteOr(raw.createdAt, 0),
    lastActiveAt: finiteOr(raw.lastActiveAt, 0),
    progress: normalizeProgress(raw.progress, cfg),
    settings: normalizeSettings(raw.settings),
    // 손상된 판은 버린다 — 진행 상태는 그대로 쓴다
    dungeonRun: raw.dungeonRun === null || raw.dungeonRun === undefined ? null : restoreDungeon(raw.dungeonRun, cfg),
  };
}

/** 저장에 진행 중인 던전이 있었는데 읽지 못했다 (손상) */
export function dungeonRunLost(env: SaveEnvelope, data: SaveData): boolean {
  const raw = (env.data as { dungeonRun?: unknown } | null)?.dungeonRun;
  return raw !== null && raw !== undefined && data.dungeonRun === null;
}

/** 손상·조작·설정 변경에 대비해 값을 범위 안으로 되돌린다 */
export function normalizeProgress(raw: unknown, cfg: GameConfig): ProgressState {
  const base = createInitialProgress(cfg);
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const slime = (r.slime ?? {}) as Record<string, unknown>;
  const upgrades = (slime.upgrades ?? {}) as Record<string, unknown>;
  const absorption = (slime.absorption ?? {}) as Record<string, unknown>;
  const stage = (r.stage ?? {}) as Record<string, unknown>;
  const lifetime = (r.lifetime ?? {}) as Record<string, unknown>;
  const kills = (lifetime.kills ?? {}) as Record<string, unknown>;

  for (const u of cfg.upgrades) {
    const level = nonNegInt(upgrades[u.id]);
    base.slime.upgrades[u.id] = u.maxLevel === null ? level : Math.min(level, u.maxLevel);
  }
  for (const f of cfg.families) {
    base.lifetime.kills[f.id] = nonNegInt(kills[f.id]);
    base.slime.absorption[f.id] = nonNegInt(absorption[f.id]);
  }
  const formIds = new Set(cfg.forms.map((f) => f.id));
  const known = (v: unknown): v is string => typeof v === 'string' && formIds.has(v);
  const unlocked = Array.isArray(slime.unlockedForms) ? slime.unlockedForms.filter(known) : [];
  base.slime.form = known(slime.form) ? slime.form : null;
  base.slime.unlockedForms = [...new Set(base.slime.form ? [...unlocked, base.slime.form] : unlocked)];

  const last = lastStageId(cfg);
  const highestCleared = Math.min(nonNegInt(stage.highestCleared), last);
  const current = Math.min(Math.max(1, nonNegInt(stage.current)), Math.min(last, highestCleared + 1));
  const mode = stage.mode === 'farm' && current <= highestCleared ? 'farm' : 'challenge';

  return {
    gold: nonNegNumber(r.gold),
    slime: base.slime,
    stage: { highestCleared, current, mode, autoAdvance: typeof stage.autoAdvance === 'boolean' ? stage.autoAdvance : true },
    lifetime: { kills: base.lifetime.kills, goldEarned: nonNegNumber(lifetime.goldEarned), deaths: nonNegInt(lifetime.deaths) },
    prestige: normalizePrestige(r.prestige, cfg),
    gems: r.gems === undefined ? cfg.balance.gems.starter : nonNegInt(r.gems),
    mercenaries: normalizeMercenaries(r.mercenaries, cfg),
    daily: normalizeDaily(r.daily),
    purchases: normalizePurchases(r.purchases, cfg),
    dungeon: normalizeDungeon(r.dungeon, cfg),
  };
}

function normalizeDungeon(raw: unknown, cfg: GameConfig): ProgressState['dungeon'] {
  const d = (raw ?? {}) as { cleared?: unknown; best?: Record<string, unknown>; crystals?: unknown; research?: Record<string, unknown>; synergies?: unknown; runs?: unknown; claimed?: unknown };
  const levels = cfg.dungeon.levels.count;
  const waves = cfg.dungeon.waves.monsters.length;
  const best: Record<number, number> = {};
  for (const [key, value] of Object.entries(d.best ?? {})) {
    const level = Number(key);
    const record = Math.min(nonNegInt(value), waves);
    if (Number.isInteger(level) && level >= 1 && level <= levels && record > 0) best[level] = record;
  }
  const synergyIds = new Set<string>(SYNERGY_IDS);
  return {
    cleared: Math.min(nonNegInt(d.cleared), levels),
    best,
    crystals: nonNegInt(d.crystals),
    research: Object.fromEntries(cfg.dungeon.research.map((r) => [r.id, Math.min(nonNegInt(d.research?.[r.id]), r.maxLevel)])),
    synergies: Array.isArray(d.synergies) ? [...new Set(d.synergies.filter((s): s is string => typeof s === 'string' && synergyIds.has(s)))] : [],
    runs: nonNegInt(d.runs),
    claimed: Array.isArray(d.claimed) ? [...new Set(d.claimed.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 64))].slice(-20) : [],
  };
}

function normalizePurchases(raw: unknown, cfg: GameConfig): ProgressState['purchases'] {
  const p = (raw ?? {}) as { owned?: unknown; orders?: unknown };
  const owned = Array.isArray(p.owned) ? p.owned.filter((x): x is string => typeof x === 'string') : [];
  const onceSkus = new Set(cfg.shop.filter((s) => s.kind === 'once').map((s) => s.sku));
  const orders = (Array.isArray(p.orders) ? (p.orders as unknown[]) : [])
    .map((o) => (o ?? {}) as { id?: unknown; sku?: unknown })
    .filter((o): o is PurchaseOrder => typeof o.id === 'string' && typeof o.sku === 'string' && cfg.shop.some((s) => s.sku === o.sku))
    .map(({ id, sku }) => ({ id, sku }));
  return { owned: [...new Set(owned.filter((s) => onceSkus.has(s)))], orders: orders.slice(-100) };
}

function normalizeMercenaries(raw: unknown, cfg: GameConfig): ProgressState['mercenaries'] {
  const m = (raw ?? {}) as { owned?: Record<string, unknown>; party?: unknown };
  const owned: Record<string, number> = {};
  for (const def of cfg.mercenaries) {
    const level = Math.min(nonNegInt(m.owned?.[def.id]), cfg.balance.gacha.maxLevel);
    if (level > 0) owned[def.id] = level;
  }
  const party = Array.isArray(m.party) ? [...new Set(m.party.filter((id): id is string => typeof id === 'string' && id in owned))].slice(0, cfg.balance.party.slots) : [];
  return { owned, party };
}

function normalizeDaily(raw: unknown): ProgressState['daily'] {
  const d = (raw ?? {}) as { day?: unknown; adGems?: unknown };
  return { day: typeof d.day === 'string' ? d.day : '', adGems: nonNegInt(d.adGems) };
}

function normalizePrestige(raw: unknown, cfg: GameConfig): ProgressState['prestige'] {
  const p = (raw ?? {}) as Record<string, unknown>;
  const legacy = (p.legacy ?? {}) as Record<string, unknown>;
  return {
    count: nonNegInt(p.count),
    essence: nonNegInt(p.essence),
    legacy: Object.fromEntries(cfg.legacy.map((l) => [l.id, l.maxLevel === null ? nonNegInt(legacy[l.id]) : Math.min(nonNegInt(legacy[l.id]), l.maxLevel)])),
    bestStage: Math.min(nonNegInt(p.bestStage), lastStageId(cfg)),
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
