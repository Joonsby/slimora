import type { GameConfig } from '../core/model/config';
import type { UpgradeId } from '../core/model/ids';
import type { SlimeProgress } from '../core/model/progress';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { deriveSlimeStats, UPGRADE_STAT } from '../core/stats';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { HoldButton } from './HoldButton';
import { Sheet } from './Sheet';

export function UpgradeSheet() {
  const { session, store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'upgrade');
  const gold = useGame((s) => s.progress.gold);
  const slime = useGame((s) => s.progress.slime);
  const levels = slime.upgrades;

  return (
    <Sheet open={open} title="강화" onClose={() => openSheet(store, 'none')}>
      <p className="hint">길게 누르면 연속으로 강화합니다.</p>
      <div className="upgrade-list">
        {config.upgrades.map((def) => {
          const level = levels[def.id] ?? 0;
          const maxed = isMaxLevel(def, level);
          const cost = getUpgradeCost(def, level);
          return (
            <div className="upgrade-row" key={def.id}>
              <div className="upgrade-info">
                <strong>
                  {def.name} <span className="muted">Lv {level}</span>
                </strong>
                <span>
                  {formatStat(def.id, statAt(config, slime, def.id, level))}
                  {!maxed && <span className="next-value"> → {formatStat(def.id, statAt(config, slime, def.id, level + 1))}</span>}
                </span>
              </div>
              <HoldButton className="buy" disabled={maxed || gold < cost} onFire={() => session.purchaseUpgrade(def.id).ok}>
                {maxed ? '최대' : `G ${formatNumber(cost)}`}
              </HoldButton>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/** 해당 강화만 level 로 바꿨을 때의 능력치 (레벨 · 형태 · 상한 반영) */
function statAt(config: GameConfig, slime: SlimeProgress, id: UpgradeId, level: number): number {
  return deriveSlimeStats({ ...slime, upgrades: { ...slime.upgrades, [id]: level } }, config)[UPGRADE_STAT[id]];
}

function formatStat(id: UpgradeId, value: number): string {
  return id === 'critChance' ? `${(value * 100).toFixed(1)}%` : formatNumber(value);
}
