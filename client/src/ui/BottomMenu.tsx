import type { ReactNode } from 'react';
import { anyFormAvailable } from '../core/progression/forms';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { openSheet, type Sheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';
import { IconAbsorb, IconEvolve, IconMap, IconSword } from './icons';

export function BottomMenu() {
  const { config } = useGameContext();
  const canUpgrade = useGame((s) =>
    config.upgrades.some((def) => {
      const level = s.progress.slime.upgrades[def.id] ?? 0;
      return !isMaxLevel(def, level) && s.progress.gold >= getUpgradeCost(def, level);
    }),
  );
  const canEvolve = useGame((s) => anyFormAvailable(s.progress, config));

  return (
    <nav className="menu">
      <MenuButton sheet="upgrade" label="강화" tone="orange" icon={<IconSword size={28} />} badge={canUpgrade} />
      <MenuButton sheet="stage" label="사냥터" tone="green" icon={<IconMap size={28} />} />
      <MenuButton sheet="absorb" label="흡수" tone="purple" icon={<IconAbsorb size={28} />} />
      <MenuButton sheet="evolve" label="진화" tone="gold" icon={<IconEvolve size={28} />} badge={canEvolve} />
    </nav>
  );
}

function MenuButton({ sheet, label, tone, icon, badge }: { sheet: Exclude<Sheet, 'none'>; label: string; tone: string; icon: ReactNode; badge?: boolean }) {
  const { store } = useGameContext();
  const active = useGame((s) => s.sheet === sheet);
  return (
    <button className={`menu-item tone-${tone} ${active ? 'active' : ''}`} onClick={() => openSheet(store, active ? 'none' : sheet)}>
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {badge && <span className="dot" aria-label={`${label} 가능`} />}
    </button>
  );
}
