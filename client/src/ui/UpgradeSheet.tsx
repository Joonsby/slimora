import type { ReactNode } from 'react';
import type { GameConfig } from '../core/model/config';
import type { UpgradeId } from '../core/model/ids';
import type { SlimeProgress } from '../core/model/progress';
import { getUpgradeCost, isMaxLevel } from '../core/progression/upgrades';
import { deriveSlimeStats, UPGRADE_STAT } from '../core/stats';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { HoldButton } from './HoldButton';
import { IconArrow, IconCoin, IconCrit, IconHeart, IconSword } from './icons';
import { Sheet } from './Sheet';

const ICONS: Record<string, ReactNode> = { attack: <IconSword size={30} />, maxHp: <IconHeart size={30} />, critChance: <IconCrit size={30} /> };

export function UpgradeSheet() {
  const { session, store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'upgrade');
  const gold = useGame((s) => s.progress.gold);
  const slime = useGame((s) => s.progress.slime);
  const levels = slime.upgrades;

  return (
    <Sheet open={open} title="강화" icon={<IconSword size={24} />} onClose={() => openSheet(store, 'none')}>
      <p className="hint">골드로 슬라임을 단련합니다. 버튼을 길게 누르면 연속으로 강화합니다.</p>
      <div className="card-list">
        {config.upgrades.map((def) => {
          const level = levels[def.id] ?? 0;
          const maxed = isMaxLevel(def, level);
          const cost = getUpgradeCost(def, level);
          return (
            <div className={`card upgrade-card up-${def.id}`} key={def.id}>
              <span className="card-icon">{ICONS[def.id]}</span>
              <div className="card-body">
                <span className="card-title">
                  {def.name} <span className="lv">Lv {level}</span>
                </span>
                <span className="stat-change">
                  {formatStat(def.id, statAt(config, slime, def.id, level))}
                  {!maxed && (
                    <>
                      <IconArrow size={13} />
                      <b>{formatStat(def.id, statAt(config, slime, def.id, level + 1))}</b>
                    </>
                  )}
                </span>
              </div>
              <HoldButton className="buy" disabled={maxed || gold < cost} onFire={() => session.purchaseUpgrade(def.id).ok}>
                {maxed ? (
                  '최대'
                ) : (
                  <>
                    <IconCoin size={18} />
                    {formatNumber(cost)}
                  </>
                )}
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
