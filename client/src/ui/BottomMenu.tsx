import type { ReactNode } from 'react';
import { anyFormAvailable } from '../core/progression/forms';
import { essenceForRebirth, isLegacyMaxed, legacyCost } from '../core/progression/prestige';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { openSheet, type Sheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';
import { IconEvolve, IconMap, IconParty, IconRebirth, IconSword } from './icons';

export function BottomMenu() {
  const { config } = useGameContext();
  const canUpgrade = useGame((s) =>
    config.upgrades.some((def) => {
      const level = s.progress.slime.upgrades[def.id] ?? 0;
      return !isMaxLevel(def, level) && s.progress.gold >= getUpgradeCost(def, level);
    }),
  );
  const canEvolve = useGame((s) => anyFormAvailable(s.progress, config));
  // 한 번 뽑을 보석이 있으면
  const mercenaryNews = useGame((s) => s.progress.gems >= config.balance.gacha.single);
  // 처음 환생할 수 있게 됐거나, 정수로 살 수 있는 영구 강화가 있으면
  const rebirthNews = useGame(
    (s) =>
      (s.progress.prestige.count === 0 && essenceForRebirth(s.progress, config) > 0) ||
      config.legacy.some((l) => {
        const lv = s.progress.prestige.legacy[l.id] ?? 0;
        return !isLegacyMaxed(l, lv) && s.progress.prestige.essence >= legacyCost(l, lv);
      }),
  );

  return (
    <nav className="menu">
      <MenuButton sheet="upgrade" label="강화" tone="orange" icon={<IconSword size={28} />} badge={canUpgrade} />
      <MenuButton sheet="stage" label="사냥터" tone="green" icon={<IconMap size={28} />} />
      <MenuButton sheet="mercenary" label="용병" tone="blue" icon={<IconParty size={30} />} badge={mercenaryNews} />
      <MenuButton sheet="evolve" label="진화" tone="gold" icon={<IconEvolve size={28} />} badge={canEvolve} />
      <MenuButton sheet="rebirth" label="환생" tone="rose" icon={<IconRebirth size={28} />} badge={rebirthNews} />
    </nav>
  );
}

function MenuButton({ sheet, label, tone, icon, badge }: { sheet: Exclude<Sheet, 'none'>; label: string; tone: string; icon: ReactNode; badge?: boolean }) {
  const { store, sfx } = useGameContext();
  const active = useGame((s) => s.sheet === sheet);
  return (
    <button
      className={`menu-item tone-${tone} ${active ? 'active' : ''}`}
      onClick={() => {
        sfx.play('tap');
        openSheet(store, active ? 'none' : sheet);
      }}
    >
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {badge && <span className="dot" aria-label={`${label} 가능`} />}
    </button>
  );
}
