import { lastStageId } from '../core/lookup';
import type { GameConfig } from '../core/model/config';
import type { UpgradeId } from '../core/model/ids';
import { createInitialProgress } from '../core/progression/initial';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { MemorySaveRepository } from '../persistence/MemorySaveRepository';
import { GameSession } from '../session/GameSession';
import type { PlatformAdapter } from '../session/ports';
import { createGameStore } from '../store/gameStore';

export interface AutoPlayOptions {
  maxGameMs: number;
  /** 실패 후 이만큼 사냥하다 재도전한다 */
  retryAfterMs: number;
  stepMs?: number;
  seed?: number;
}

export interface AutoPlayResult {
  clearedAtMs: Record<number, number>;
  finishedAtMs: number | null;
  failures: number;
  deaths: number;
  upgrades: Record<UpgradeId, number>;
  elapsedMs: number;
}

/** 가장 싼 강화부터 살 수 있는 만큼 사고, 실패하면 잠시 사냥하다 재도전하는 자동 플레이어. 밸런스 점검용 */
export async function autoPlay(cfg: GameConfig, opts: AutoPlayOptions): Promise<AutoPlayResult> {
  let clock = 0;
  const platform: PlatformAdapter = { now: () => clock, onVisibilityChange: () => () => {} };
  const store = createGameStore(createInitialProgress(cfg));
  const session = new GameSession({ config: cfg, store, repo: new MemorySaveRepository(), platform, seed: opts.seed ?? 1 });
  await session.start();

  const clearedAtMs: Record<number, number> = {};
  let failures = 0;
  session.onEvents((events) => {
    for (const e of events) {
      if (e.type === 'stageCleared') clearedAtMs[e.stageId] ??= clock;
      if (e.type === 'challengeFailed') failures += 1;
    }
  });

  const last = lastStageId(cfg);
  const step = opts.stepMs ?? 100;
  let farmingSince: number | null = null;
  while (clock < opts.maxGameMs) {
    clock += step;
    session.tick(step);
    for (let next = cheapestUpgrade(cfg, store.getState().progress); next; next = cheapestUpgrade(cfg, store.getState().progress)) {
      if (!session.purchaseUpgrade(next).ok) break;
    }
    const { stage } = store.getState().progress;
    if (stage.highestCleared >= last) break;
    if (stage.mode === 'farm') {
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
    finishedAtMs: p.stage.highestCleared >= last ? clock : null,
    failures,
    deaths: p.lifetime.deaths,
    upgrades: p.slime.upgrades,
    elapsedMs: clock,
  };
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
