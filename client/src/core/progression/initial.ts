import type { GameConfig } from '../model/config';
import type { FamilyId, UpgradeId } from '../model/ids';
import type { ProgressState } from '../model/progress';

export function createInitialProgress(cfg: GameConfig): ProgressState {
  return {
    gold: 0,
    slime: {
      upgrades: Object.fromEntries(cfg.upgrades.map((u) => [u.id, 0])) as Record<UpgradeId, number>,
      absorption: Object.fromEntries(cfg.families.map((f) => [f.id, 0])) as Record<FamilyId, number>,
      form: null,
      unlockedForms: [],
    },
    stage: { highestCleared: 0, current: 1, mode: 'challenge', autoAdvance: true },
    lifetime: {
      kills: Object.fromEntries(cfg.families.map((f) => [f.id, 0])) as Record<FamilyId, number>,
      goldEarned: 0,
      deaths: 0,
    },
  };
}
