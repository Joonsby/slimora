export const BATTLE_SPEEDS = [1, 2, 3] as const;
export type BattleSpeed = (typeof BATTLE_SPEEDS)[number];

export interface GameSettings {
  battleSpeed: BattleSpeed;
}

export const DEFAULT_SETTINGS: GameSettings = { battleSpeed: 1 };

export function normalizeSettings(raw: unknown): GameSettings {
  const speed = (raw as { battleSpeed?: unknown } | null)?.battleSpeed;
  return {
    battleSpeed: BATTLE_SPEEDS.includes(speed as BattleSpeed) ? (speed as BattleSpeed) : DEFAULT_SETTINGS.battleSpeed,
  };
}
