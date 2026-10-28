import { lastStageId } from '../core/lookup';
import type { GameConfig } from '../core/model/config';
import { createInitialProgress } from '../core/progression/initial';
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
  attackLevel: number;
  elapsedMs: number;
}

/** 살 수 있으면 바로 강화하고, 실패하면 잠시 사냥하다 재도전하는 자동 플레이어. 밸런스 점검용 */
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
    while (session.purchaseUpgrade('attack').ok) {
      // 살 수 있는 만큼 산다
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
    attackLevel: p.slime.upgrades.attack,
    elapsedMs: clock,
  };
}
