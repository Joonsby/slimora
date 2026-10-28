import type { GameConfig, MonsterDef, StageDef, UpgradeDef } from './model/config';
import type { MonsterId, StageId, UpgradeId } from './model/ids';

export function findStage(cfg: GameConfig, id: StageId): StageDef {
  const stage = cfg.stages.find((s) => s.id === id);
  if (!stage) throw new Error(`없는 스테이지: ${id}`);
  return stage;
}

export function hasStage(cfg: GameConfig, id: StageId): boolean {
  return cfg.stages.some((s) => s.id === id);
}

export function lastStageId(cfg: GameConfig): StageId {
  return cfg.stages.length;
}

export function findMonster(cfg: GameConfig, id: MonsterId): MonsterDef {
  const monster = cfg.monsters.find((m) => m.id === id);
  if (!monster) throw new Error(`없는 몬스터: ${id}`);
  return monster;
}

export function findUpgrade(cfg: GameConfig, id: UpgradeId): UpgradeDef | undefined {
  return cfg.upgrades.find((u) => u.id === id);
}
