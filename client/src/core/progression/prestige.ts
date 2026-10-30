import type { RuleError } from '../model/commands';
import type { GameConfig, LegacyDef } from '../model/config';
import type { LegacyId } from '../model/ids';
import type { PrestigeProgress, ProgressState } from '../model/progress';
import { err, ok, type Result } from '../result';
import { createInitialProgress } from './initial';

/** 영구 강화가 주는 것. attack · maxHp · gold 는 곱하는 배율, offlineMs 는 오프라인 보상 상한에 더하는 시간 */
export interface LegacyBonus {
  attack: number;
  maxHp: number;
  gold: number;
  offlineMs: number;
}

export const NO_LEGACY: LegacyBonus = { attack: 1, maxHp: 1, gold: 1, offlineMs: 0 };

export function findLegacy(cfg: GameConfig, id: LegacyId): LegacyDef | undefined {
  return cfg.legacy.find((l) => l.id === id);
}

export function legacyCost(def: LegacyDef, level: number): number {
  return Math.ceil(def.cost.base * def.cost.growth ** level);
}

export function isLegacyMaxed(def: LegacyDef, level: number): boolean {
  return def.maxLevel !== null && level >= def.maxLevel;
}

export function legacyBonus(prestige: Pick<PrestigeProgress, 'legacy'> | undefined, cfg: GameConfig): LegacyBonus {
  const bonus = { ...NO_LEGACY };
  for (const def of cfg.legacy) {
    const amount = def.perLevel * (prestige?.legacy[def.id] ?? 0);
    if (def.stat === 'offlineHours') bonus.offlineMs += amount * 3_600_000;
    else bonus[def.stat] += amount;
  }
  return bonus;
}

/** 지금 환생하면 받는 정수. 아직 못 하면 0 */
export function essenceForRebirth(p: ProgressState, cfg: GameConfig): number {
  const { unlockStage, essenceBase, essenceGrowth } = cfg.balance.prestige;
  const highest = p.stage.highestCleared;
  if (highest < unlockStage) return 0;
  return Math.floor(essenceBase * essenceGrowth ** (highest - unlockStage));
}

/**
 * 환생 — 골드 · 강화 · 흡수 · 스테이지를 처음으로 되돌리고 정수를 받는다.
 * 진화한 형태 · 해금한 형태 · 누적 기록 · 정수와 영구 강화는 남는다
 */
export function rebirth(p: ProgressState, cfg: GameConfig): Result<ProgressState, RuleError> {
  const gained = essenceForRebirth(p, cfg);
  if (gained <= 0) return err({ code: 'REBIRTH_LOCKED', need: cfg.balance.prestige.unlockStage });
  const fresh = createInitialProgress(cfg);
  return ok({
    ...fresh,
    slime: { ...fresh.slime, form: p.slime.form, unlockedForms: p.slime.unlockedForms },
    stage: { ...fresh.stage, autoAdvance: p.stage.autoAdvance },
    lifetime: p.lifetime,
    gems: p.gems + cfg.balance.gems.rebirth,
    mercenaries: p.mercenaries,
    daily: p.daily,
    purchases: p.purchases,
    prestige: {
      ...p.prestige,
      count: p.prestige.count + 1,
      essence: p.prestige.essence + gained,
      bestStage: Math.max(p.prestige.bestStage, p.stage.highestCleared),
    },
  });
}

export function purchaseLegacy(p: ProgressState, id: LegacyId, cfg: GameConfig): Result<ProgressState, RuleError> {
  const def = findLegacy(cfg, id);
  if (!def) return err({ code: 'UNKNOWN_LEGACY' });
  const level = p.prestige.legacy[id] ?? 0;
  if (isLegacyMaxed(def, level)) return err({ code: 'MAX_LEVEL' });
  const cost = legacyCost(def, level);
  if (p.prestige.essence < cost) return err({ code: 'NOT_ENOUGH_ESSENCE', need: cost, have: p.prestige.essence });
  return ok({ ...p, prestige: { ...p.prestige, essence: p.prestige.essence - cost, legacy: { ...p.prestige.legacy, [id]: level + 1 } } });
}

/** 랭킹 점수 — 환생 횟수 × 100 + 모든 회차 최고 스테이지. 줄지 않는다 */
export function rankScore(p: Pick<ProgressState, 'prestige' | 'stage'>): number {
  return p.prestige.count * 100 + Math.max(p.prestige.bestStage, p.stage.highestCleared);
}
