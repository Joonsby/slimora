import { lastStageId } from '../core/lookup';
import type { GameConfig } from '../core/model/config';
import type { FormId, LegacyId, MercenaryId, UpgradeId } from '../core/model/ids';
import type { ProgressState } from '../core/model/progress';
import { findForm, formStatus } from '../core/progression/forms';
import { createInitialProgress } from '../core/progression/initial';
import { essenceForRebirth, isLegacyMaxed, legacyCost } from '../core/progression/prestige';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { MemorySaveRepository } from '../persistence/MemorySaveRepository';
import { GameSession } from '../session/GameSession';
import type { PlatformAdapter } from '../session/ports';
import type { BattleSpeed } from '../session/settings';
import { createGameStore } from '../store/gameStore';

export interface AutoPlayOptions {
  maxGameMs: number;
  /** 실패 후 이만큼 사냥하다 재도전한다 */
  retryAfterMs: number;
  stepMs?: number;
  seed?: number;
  /** 이 스테이지를 깨면 멈춘다. 기본은 마지막 스테이지 */
  untilStage?: number;
  /** 이 형태로 진화할 수 있게 되면 진화한다 */
  evolveTo?: FormId;
  /** 처음 true 가 된 시각을 watchHitAtMs 로 돌려준다 */
  watch?: (progress: ProgressState) => boolean;
  /** 이만큼 새 스테이지를 못 깨면 환생하고 정수를 가장 싼 강화부터 쓴다. 없으면 환생하지 않는다 */
  rebirthWhenStuckMs?: number;
  /** 보석이 10연 뽑기 값만큼 모이면 뽑고, 등급 · 레벨이 높은 용병으로 편성한다 */
  recruit?: boolean;
  /** 전투 배속. 시각(…AtMs)은 배속을 곱한 전투 시간으로 센다 */
  speed?: BattleSpeed;
}

export interface AutoPlayResult {
  clearedAtMs: Record<number, number>;
  finishedAtMs: number | null;
  failures: number;
  deaths: number;
  upgrades: Record<UpgradeId, number>;
  absorption: ProgressState['slime']['absorption'];
  watchHitAtMs: number | null;
  evolvedAtMs: number | null;
  elapsedMs: number;
  /** 모든 회차를 통틀어 그 스테이지를 처음 깬 시각 */
  firstClearAtMs: Record<number, number>;
  rebirths: number;
  /** 환생할 때마다 [그 회차 최고 스테이지, 환생 시각] */
  runs: [number, number][];
}

/** 가장 싼 강화부터 살 수 있는 만큼 사고, 실패하면 잠시 사냥하다 재도전하는 자동 플레이어. 밸런스 점검용 */
export async function autoPlay(cfg: GameConfig, opts: AutoPlayOptions): Promise<AutoPlayResult> {
  let clock = 0;
  const platform: PlatformAdapter = { now: () => clock, onVisibilityChange: () => () => {} };
  const store = createGameStore(createInitialProgress(cfg));
  const session = new GameSession({ config: cfg, store, repo: new MemorySaveRepository(), platform, seed: opts.seed ?? 1 });
  await session.start();
  const speed = opts.speed ?? 1;
  session.setBattleSpeed(speed);

  const clearedAtMs: Record<number, number> = {};
  const firstClearAtMs: Record<number, number> = {};
  let failures = 0;
  let rebirths = 0;
  const runs: [number, number][] = [];
  let lastNewStageAt = 0;
  session.onEvents((events) => {
    for (const e of events) {
      if (e.type === 'stageCleared') {
        if (rebirths === 0) clearedAtMs[e.stageId] ??= clock * speed;
        if (firstClearAtMs[e.stageId] === undefined) firstClearAtMs[e.stageId] = clock * speed;
        lastNewStageAt = clock;
      }
      if (e.type === 'challengeFailed') failures += 1;
    }
  });

  const last = opts.untilStage ?? lastStageId(cfg);
  const target = opts.evolveTo ? findForm(cfg, opts.evolveTo) : undefined;
  let evolvedAtMs: number | null = null;
  const step = opts.stepMs ?? 100;
  let farmingSince: number | null = null;
  let watchHitAtMs: number | null = null;
  while (clock < opts.maxGameMs) {
    clock += step;
    session.tick(step);
    for (let next = cheapestUpgrade(cfg, store.getState().progress); next; next = cheapestUpgrade(cfg, store.getState().progress)) {
      if (!session.purchaseUpgrade(next).ok) break;
    }
    if (target && evolvedAtMs === null && !session.inBossFight()) {
      const p = store.getState().progress;
      if (formStatus(target, p.slime, p.stage.highestCleared) === 'available' && session.evolve(target.id).ok) evolvedAtMs = clock * speed;
    }
    if (opts.recruit) recruit(session, cfg, store.getState().progress);
    if (opts.rebirthWhenStuckMs !== undefined && clock - lastNewStageAt >= opts.rebirthWhenStuckMs && !session.inBossFight() && essenceForRebirth(store.getState().progress, cfg) > 0) {
      const reached = store.getState().progress.stage.highestCleared;
      if (session.rebirth().ok) {
        rebirths += 1;
        runs.push([reached, clock * speed]);
        lastNewStageAt = clock;
        for (let next = cheapestLegacy(cfg, store.getState().progress); next; next = cheapestLegacy(cfg, store.getState().progress)) {
          if (!session.purchaseLegacy(next).ok) break;
        }
      }
    }
    const progress = store.getState().progress;
    if (watchHitAtMs === null && opts.watch?.(progress)) watchHitAtMs = clock * speed;
    const { stage } = progress;
    if (stage.highestCleared >= last && (!opts.watch || watchHitAtMs !== null)) break;
    if (stage.mode === 'farm' && stage.highestCleared < last) {
      farmingSince ??= clock;
      if (clock - farmingSince >= opts.retryAfterMs) {
        session.challengeNext();
        farmingSince = null;
      }
    } else {
      farmingSince = null;
    }
  }

  const p = store.getState().progress;
  session.dispose();
  return {
    clearedAtMs,
    finishedAtMs: p.stage.highestCleared >= last ? clock * speed : null,
    failures,
    deaths: p.lifetime.deaths,
    upgrades: p.slime.upgrades,
    absorption: p.slime.absorption,
    watchHitAtMs,
    evolvedAtMs,
    elapsedMs: clock * speed,
    firstClearAtMs,
    rebirths,
    runs,
  };
}

/** 지금 살 수 있는 정수 강화 중 가장 싼 것 (오프라인 시간은 시뮬레이션에 의미가 없어 뺀다) */
function cheapestLegacy(cfg: GameConfig, p: ProgressState): LegacyId | null {
  let best: { id: LegacyId; cost: number } | null = null;
  for (const def of cfg.legacy) {
    if (def.stat === 'offlineHours') continue;
    const level = p.prestige.legacy[def.id] ?? 0;
    if (isLegacyMaxed(def, level)) continue;
    const cost = legacyCost(def, level);
    if (cost <= p.prestige.essence && (!best || cost < best.cost)) best = { id: def.id, cost };
  }
  return best?.id ?? null;
}

const RARITY_RANK = { common: 0, rare: 1, legendary: 2 } as const;

/** 10연 뽑기를 할 수 있으면 하고, 등급 · 레벨 순으로 편성한다 */
function recruit(session: GameSession, cfg: GameConfig, p: ProgressState): void {
  if (p.gems < cfg.balance.gacha.ten || !session.summon(10)) return;
  const owned = session.getProgress().mercenaries.owned;
  const score = (id: MercenaryId) => RARITY_RANK[cfg.mercenaries.find((m) => m.id === id)!.rarity] * 100 + (owned[id] ?? 0);
  const party = Object.keys(owned)
    .sort((a, b) => score(b) - score(a))
    .slice(0, cfg.balance.party.slots);
  session.setParty(party);
}

/** 지금 살 수 있는 강화 중 가장 싼 것 */
function cheapestUpgrade(cfg: GameConfig, p: { gold: number; slime: { upgrades: Record<UpgradeId, number> } }): UpgradeId | null {
  let best: { id: UpgradeId; cost: number } | null = null;
  for (const def of cfg.upgrades) {
    const level = p.slime.upgrades[def.id] ?? 0;
    if (isMaxLevel(def, level)) continue;
    const cost = getUpgradeCost(def, level);
    if (cost <= p.gold && (!best || cost < best.cost)) best = { id: def.id, cost };
  }
  return best?.id ?? null;
}
