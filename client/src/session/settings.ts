export const BATTLE_SPEEDS = [1, 2, 3] as const;
export type BattleSpeed = (typeof BATTLE_SPEEDS)[number];

export interface GameSettings {
  battleSpeed: BattleSpeed;
  sound: boolean;
  /** 본 튜토리얼 안내 */
  tutorial: string[];
}

export const DEFAULT_SETTINGS: GameSettings = { battleSpeed: 1, sound: true, tutorial: [] };

export function normalizeSettings(raw: unknown): GameSettings {
  const r = (raw ?? {}) as { battleSpeed?: unknown; sound?: unknown; tutorial?: unknown };
  return {
    battleSpeed: BATTLE_SPEEDS.includes(r.battleSpeed as BattleSpeed) ? (r.battleSpeed as BattleSpeed) : DEFAULT_SETTINGS.battleSpeed,
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_SETTINGS.sound,
    tutorial: Array.isArray(r.tutorial) ? r.tutorial.filter((s): s is string => typeof s === 'string') : [],
  };
}
