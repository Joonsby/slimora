import { findUpgrade } from '../core/lookup';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { openSheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';

export function BottomMenu() {
  const { store, config } = useGameContext();
  const canUpgrade = useGame((s) => {
    const def = findUpgrade(config, 'attack');
    const level = s.progress.slime.upgrades.attack ?? 0;
    return !!def && !isMaxLevel(def, level) && s.progress.gold >= getUpgradeCost(def, level);
  });

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
