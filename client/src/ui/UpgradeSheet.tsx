import type { GameConfig, UpgradeDef } from '../core/model/config';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { HoldButton } from './HoldButton';
import { Sheet } from './Sheet';

export function UpgradeSheet() {
  const { session, store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'upgrade');
  const gold = useGame((s) => s.progress.gold);
  const levels = useGame((s) => s.progress.slime.upgrades);

  return (
    <Sheet open={open} title="강화" onClose={() => openSheet(store, 'none')}>
      <p className="hint">길게 누르면 연속으로 강화합니다.</p>
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
                {formatNumber(statValue(config, def, level))}
                {!maxed && <span className="next-value"> →{formatNumber(statValue(config, def, level + 1))}</span>}
              </span>
            </div>
            <HoldButton className="buy" disabled={maxed || gold < cost} onFire={() => session.purchaseUpgrade(def.id).ok}>
              {maxed ? '최대' : `G ${formatNumber(cost)}`}
            </HoldButton>
          </div>
        );
      })}
    </Sheet>
  );
}

function statValue(config: GameConfig, def: UpgradeDef, level: number): number {
  switch (def.id) {
    case 'attack':
      return config.balance.slimeBase.attack + def.perLevel * level;
  }
}
