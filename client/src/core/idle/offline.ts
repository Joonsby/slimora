import { createBattle, stepBattle } from '../battle/engine';
import type { GameConfig } from '../model/config';
import type { FamilyId, StageId } from '../model/ids';
import type { ProgressState } from '../model/progress';
import { slimeBonus } from '../progression/bonus';
import { partyAllies } from '../progression/mercenary';
import { deriveSlimeStats } from '../stats';

export interface OfflineReward {
  /** 보상을 계산한 시간 (상한 적용) */
  awayMs: number;
  /** 상한에 걸려 잘렸는가 */
  capped: boolean;
  stageId: StageId;
  gold: number;
  kills: Partial<Record<FamilyId, number>>;
  absorb: Partial<Record<FamilyId, number>>;
}

const SIM_STEP_MS = 500;

/** 보상을 받을 사냥터 — 사냥 중이면 그곳, 도전 중이면 최고 클리어 스테이지 (없으면 1) */
export function offlineStage(p: ProgressState): StageId {
  return p.stage.mode === 'farm' ? p.stage.current : Math.max(1, p.stage.highestCleared);
}

/**
 * 오프라인 보상 (GAME_DESIGN 4-11). 그 사냥터를 실제 전투 엔진으로 simMs 동안 돌려 본 속도를
 * 떠나 있던 시간만큼 늘리고 efficiency 를 곱한다. 자주 죽는 사냥터면 그만큼 줄어든다.
 * 너무 짧거나 시계가 거꾸로 갔거나 받을 것이 없으면 null
 */
export function computeOfflineReward(p: ProgressState, awayMs: number, cfg: GameConfig, seed: number): OfflineReward | null {
  const o = cfg.balance.offline;
  if (!(awayMs >= o.minAwayMs)) return null;
  const bonus = slimeBonus(p, cfg);
  const cap = o.capMs + bonus.offlineMs;
  const counted = Math.min(awayMs, cap);
  const stageId = offlineStage(p);
  const battle = createBattle({ stageId, mode: 'farm', slime: deriveSlimeStats(p.slime, cfg, bonus), seed, goldMul: bonus.gold, allies: partyAllies(p.mercenaries, cfg) }, cfg);

  let gold = 0;
  const kills: Partial<Record<FamilyId, number>> = {};
  const absorb: Partial<Record<FamilyId, number>> = {};
  for (let t = 0; t < o.simMs; t += SIM_STEP_MS) {
    for (const e of stepBattle(battle, SIM_STEP_MS, cfg)) {
      if (e.type !== 'monsterKilled') continue;
      gold += e.gold;
      kills[e.family] = (kills[e.family] ?? 0) + 1;
      absorb[e.family] = (absorb[e.family] ?? 0) + e.absorb;
    }
  }

  const scale = (counted / o.simMs) * o.efficiency;
  const scaleAll = (r: Partial<Record<FamilyId, number>>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.floor((v ?? 0) * scale)]).filter(([, v]) => (v as number) > 0));
  const reward = { awayMs: counted, capped: awayMs > cap, stageId, gold: Math.floor(gold * scale), kills: scaleAll(kills), absorb: scaleAll(absorb) };
  return reward.gold > 0 || Object.keys(reward.absorb).length > 0 ? reward : null;
}
