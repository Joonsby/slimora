import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { openSheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';

export function BottomMenu() {
  const { store, config } = useGameContext();
  const canUpgrade = useGame((s) =>
    config.upgrades.some((def) => {
      const level = s.progress.slime.upgrades[def.id] ?? 0;
      return !isMaxLevel(def, level) && s.progress.gold >= getUpgradeCost(def, level);
    }),
  );

  return (
    <nav className="menu">
      <button onClick={() => openSheet(store, 'upgrade')}>
        강화{canUpgrade && <span className="dot" aria-label="강화 가능" />}
      </button>
      <button onClick={() => openSheet(store, 'stage')}>사냥터</button>
      <button disabled>
        흡수<small>다음 단계</small>
      </button>
      <button disabled>
        진화<small>다음 단계</small>
      </button>
    </nav>
  );
}
