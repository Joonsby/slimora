import { waveCount } from '../dungeon/engine';
import { dungeonRefStage } from '../dungeon/rules';
import type { RuleError } from '../model/commands';
import type { GameConfig } from '../model/config';
import { SYNERGY_IDS, type DungeonInit, type DungeonSummary, type ResearchDef } from '../model/dungeon';
import type { DungeonProgress, ProgressState } from '../model/progress';
import { err, ok, type Result } from '../result';
import { deriveSlimeStats, stageBase } from '../stats';
import { slimeBonus } from './bonus';
import { findMercenary, partyAllies } from './mercenary';

/** 던전을 열 기준 — 모든 회차를 통틀어 가장 높이 깬 스테이지 */
export function dungeonReach(p: Pick<ProgressState, 'stage' | 'prestige'>): number {
  return Math.max(p.stage.highestCleared, p.prestige.bestStage);
}

export function dungeonOpen(p: Pick<ProgressState, 'stage' | 'prestige'>, cfg: GameConfig): boolean {
  return dungeonReach(p) >= cfg.dungeon.unlockStage;
}

/** 1 단계는 던전이 열리면, 그 위는 앞 단계를 깼거나 기준 스테이지까지 왔으면 */
export function isLevelUnlocked(p: Pick<ProgressState, 'stage' | 'prestige' | 'dungeon'>, level: number, cfg: GameConfig): boolean {
  if (!dungeonOpen(p, cfg) || !Number.isInteger(level) || level < 1 || level > cfg.dungeon.levels.count) return false;
  return level === 1 || p.dungeon.cleared >= level - 1 || dungeonReach(p) >= dungeonRefStage(level, cfg);
}

export function highestUnlockedLevel(p: Pick<ProgressState, 'stage' | 'prestige' | 'dungeon'>, cfg: GameConfig): number {
  let level = 0;
  while (level < cfg.dungeon.levels.count && isLevelUnlocked(p, level + 1, cfg)) level++;
  return level;
}

/**
 * 단계를 지금 힘으로 견준 값 — 1 이면 적정. 슬라임의 기대 초당 피해(치명타 · 용병 포함) × 실질 HP(피해감소 · 연구 포함)를
 * 기준 스테이지의 (HP × 공격력) 으로 나누고 powerBase 로 맞춘다. 강화 돌파처럼 힘이 크게 뛰어도 맞는 단계를 고르게 해 준다
 */
export function dungeonPower(p: ProgressState, level: number, cfg: GameConfig): number {
  const bonus = slimeBonus(p, cfg);
  const s = deriveSlimeStats(p.slime, cfg, bonus);
  const hit = s.attack * (1 + s.critChance * (s.critMultiplier - 1));
  const allies = partyAllies(p.mercenaries, cfg).reduce((sum, a) => sum + (s.attack * a.power * 1000) / a.intervalMs, 0);
  // 화상은 공격 간격마다 쌓여 지속시간 동안 유지된다
  const burn = s.burn ? s.attack * s.burn.dpsRatio * Math.min(s.burn.maxStacks, (s.burn.durationMs / s.attackIntervalMs) * s.burn.chance) : 0;
  const dps = (hit * 1000) / s.attackIntervalMs + allies + burn;
  const ehp = (s.maxHp * (1 + researchBonus(p.dungeon, cfg).hp) * (1 + s.lifesteal)) / (1 - s.damageReduction);
  const base = stageBase(cfg, dungeonRefStage(level, cfg));
  const form = p.slime.form ? (cfg.dungeon.forms[p.slime.form]?.power ?? 1) : 1;
  return (dps * ehp * form) / (base.hp * base.atk * cfg.dungeon.levels.powerBase);
}

export type DungeonDifficulty = 'easy' | 'fair' | 'hard' | 'brutal';

/** 세기 → 난이도 표시. 경계는 시뮬레이션의 실제 클리어율로 맞춘다 (DUNGEON.md) */
export function difficultyOf(power: number, cfg: GameConfig): DungeonDifficulty {
  const t = cfg.dungeon.levels.difficulty;
  return power >= t.easy ? 'easy' : power >= t.fair ? 'fair' : power >= t.hard ? 'hard' : 'brutal';
}

/** 지금 힘에 맞는 단계 — 열린 단계 중 세기가 levels.recommend 이상인 가장 높은 단계 (없으면 1). 넉넉하게 잡는다 */
export function recommendedLevel(p: ProgressState, cfg: GameConfig): number {
  const top = highestUnlockedLevel(p, cfg);
  let level = 1;
  while (level < top && dungeonPower(p, level + 1, cfg) >= cfg.dungeon.levels.recommend) level++;
  return level;
}

export function findResearch(cfg: GameConfig, id: string): ResearchDef | undefined {
  return cfg.dungeon.research.find((r) => r.id === id);
}

export function researchCost(def: ResearchDef, level: number): number {
  return Math.ceil(def.cost.base * def.cost.growth ** level);
}

/** 연구로 늘어난 값 — hp · charge 는 비율, reroll · choice 는 개수 */
export function researchBonus(d: Pick<DungeonProgress, 'research'>, cfg: GameConfig): Record<ResearchDef['stat'], number> {
  const bonus = { hp: 0, charge: 0, reroll: 0, choice: 0 };
  for (const r of cfg.dungeon.research) bonus[r.stat] += r.perLevel * (d.research[r.id] ?? 0);
  return bonus;
}

export function purchaseResearch(p: ProgressState, id: string, cfg: GameConfig): Result<ProgressState, RuleError> {
  const def = findResearch(cfg, id);
  if (!def) return err({ code: 'UNKNOWN_RESEARCH' });
  const level = p.dungeon.research[id] ?? 0;
  if (level >= def.maxLevel) return err({ code: 'MAX_LEVEL' });
  const cost = researchCost(def, level);
  if (p.dungeon.crystals < cost) return err({ code: 'NOT_ENOUGH_CRYSTALS', need: cost, have: p.dungeon.crystals });
  return ok({ ...p, dungeon: { ...p.dungeon, crystals: p.dungeon.crystals - cost, research: { ...p.dungeon.research, [id]: level + 1 } } });
}

/** 아직 한 번도 깨지 못했으면 1 단계에 도움이 붙는다 (DungeonConfig.assist) */
export function assistActive(p: Pick<ProgressState, 'dungeon'>, level: number): boolean {
  return level === 1 && p.dungeon.cleared === 0;
}

/** 지금 진행으로 던전에 들어갈 때의 전투 준비 — 슬라임 능력치 · 형태 · 용병 · 연구. runId 는 판마다 달라야 한다 */
export function dungeonInit(p: ProgressState, level: number, seed: number, cfg: GameConfig, runId = `run-${seed >>> 0}`): DungeonInit {
  const bonus = slimeBonus(p, cfg);
  const research = researchBonus(p.dungeon, cfg);
  const stats = deriveSlimeStats(p.slime, cfg, bonus);
  return {
    runId,
    level,
    rewardStage: Math.min(dungeonRefStage(level, cfg), p.stage.highestCleared + 1),
    assist: assistActive(p, level),
    slime: { ...stats, maxHp: Math.round(stats.maxHp * (1 + research.hp)) },
    form: p.slime.form,
    allies: partyAllies(p.mercenaries, cfg).map((a) => ({ ...a, preset: findMercenary(cfg, a.id)?.look.preset ?? '' })),
    seed,
    // 처치 골드는 판을 열 때 정한다 — 너무 쉬운 단계면 줄어든다
    goldMul: bonus.gold * easyRate(p, level, cfg).gold,
    rerolls: cfg.dungeon.picks.rerolls + research.reroll,
    offerSize: cfg.dungeon.picks.size + research.choice,
    chargeMul: 1 + research.charge,
  };
}

export interface DungeonGains {
  crystals: number;
  /** 실제로 받는 흡수 (처치 흡수 × absorbMul × 쉬운 단계 배율) */
  absorb: Partial<Record<string, number>>;
  /** 단계 첫 클리어 보석 */
  firstClearGems: number;
  /** 처음 발견한 시너지 */
  newSynergies: string[];
  synergyGems: number;
  /** 이 단계 최고 기록을 넘었다 */
  newBest: boolean;
}

/** 단계를 처음 깨면 받는 보석 */
export function firstClearGems(level: number, cfg: GameConfig): number {
  const g = cfg.dungeon.rewards.firstClearGems;
  return Math.round(g.base + g.perLevel * (level - 1));
}

/** 지금 힘에 비해 너무 쉬운 단계면 결정 · 골드가 줄어든다 — 쉬운 단계를 빨리 돌려 모으는 것보다 맞는 단계가 낫게 */
export function easyRate(p: ProgressState, level: number, cfg: GameConfig): { crystals: number; gold: number } {
  const power = dungeonPower(p, level, cfg);
  const rate = { crystals: 1, gold: 1 };
  for (const step of cfg.dungeon.rewards.easy) {
    if (power < step.power) continue;
    rate.crystals = Math.min(rate.crystals, step.crystals);
    rate.gold = Math.min(rate.gold, step.gold);
  }
  return rate;
}

/** 결정 배율 (easyRate) */
export function crystalRate(p: ProgressState, level: number, cfg: GameConfig): number {
  return easyRate(p, level, cfg).crystals;
}

/** 결과로 받을 것 (골드 · 흡수는 summary.rewards 그대로) */
export function dungeonGains(p: ProgressState, s: DungeonSummary, cfg: GameConfig): DungeonGains {
  const r = cfg.dungeon.rewards;
  const firstClear = s.cleared && s.level > p.dungeon.cleared;
  const newSynergies = [...new Set(s.synergies)].filter((id) => !p.dungeon.synergies.includes(id));
  const crystals = r.crystalsPerWave * s.waves + r.crystalsPerBoss * s.bossKills + (s.cleared ? r.crystalsClear : 0);
  const rate = easyRate(p, s.level, cfg);
  const absorb = Object.fromEntries(Object.entries(s.rewards.absorb).map(([family, n]) => [family, Math.floor((n ?? 0) * r.absorbMul * rate.gold)]).filter(([, n]) => (n as number) > 0));
  return {
    crystals: Math.round(crystals * rate.crystals),
    absorb,
    firstClearGems: firstClear ? firstClearGems(s.level, cfg) : 0,
    newSynergies,
    synergyGems: r.synergyGems * newSynergies.length,
    newBest: s.waves > (p.dungeon.best[s.level] ?? 0),
  };
}

/** 결과를 반영한 판 id 를 이만큼 기억한다 */
const CLAIM_MEMORY = 20;

/** 던전 한 판을 마친 결과를 진행에 반영한다 — 골드 · 처치 · 흡수 · 결정 · 보석 · 기록. 같은 판(runId)은 한 번만 */
export function finishDungeon(p: ProgressState, s: DungeonSummary, cfg: GameConfig): Result<ProgressState, RuleError> {
  if (typeof s.runId !== 'string' || s.runId.length === 0 || s.runId.length > 64) return err({ code: 'INVALID_REWARD' });
  if (p.dungeon.claimed.includes(s.runId)) return err({ code: 'ALREADY_CLAIMED' });
  const valid =
    isLevelUnlocked(p, s.level, cfg) &&
    Number.isInteger(s.waves) &&
    s.waves >= 0 &&
    s.waves <= waveCount(cfg) &&
    s.cleared === (s.waves === waveCount(cfg)) &&
    Number.isInteger(s.bossKills) &&
    s.bossKills >= 0 &&
    s.bossKills <= Object.keys(cfg.dungeon.waves.bosses).length &&
    isAmount(s.rewards.gold) &&
    Object.values(s.rewards.kills).every(isAmount) &&
    Object.values(s.rewards.absorb).every(isAmount) &&
    s.synergies.every((id) => SYNERGY_IDS.includes(id));
  if (!valid) return err({ code: 'INVALID_REWARD' });
  const g = dungeonGains(p, s, cfg);
  const kills = { ...p.lifetime.kills };
  for (const [family, n] of Object.entries(s.rewards.kills)) kills[family] = (kills[family] ?? 0) + (n ?? 0);
  const absorption = { ...p.slime.absorption };
  for (const [family, n] of Object.entries(g.absorb)) absorption[family] = (absorption[family] ?? 0) + (n ?? 0);
  const d = p.dungeon;
  return ok({
    ...p,
    gold: p.gold + s.rewards.gold,
    gems: p.gems + g.firstClearGems + g.synergyGems,
    slime: Object.keys(g.absorb).length > 0 ? { ...p.slime, absorption } : p.slime,
    lifetime: { ...p.lifetime, kills, goldEarned: p.lifetime.goldEarned + s.rewards.gold },
    dungeon: {
      ...d,
      cleared: s.cleared ? Math.max(d.cleared, s.level) : d.cleared,
      best: g.newBest ? { ...d.best, [s.level]: s.waves } : d.best,
      crystals: d.crystals + g.crystals,
      synergies: g.newSynergies.length > 0 ? [...d.synergies, ...g.newSynergies] : d.synergies,
      runs: d.runs + 1,
      claimed: [...d.claimed, s.runId].slice(-CLAIM_MEMORY),
    },
  });
}

function isAmount(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}
