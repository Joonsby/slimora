import { dungeonOpen } from '../core/progression/dungeon';
import { openSheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';
import { IconLock, IconPortal } from './icons';

/** 사냥터 왼쪽의 도전 던전 입구. 열리기 전에도 보여 무엇이 기다리는지 알린다 */
export function DungeonButton() {
  const { store, config, sfx } = useGameContext();
  const open = useGame((s) => dungeonOpen(s.progress, config));
  const fresh = useGame((s) => s.progress.dungeon.runs === 0);
  return (
    <button
      className={`dungeon-btn ${open ? '' : 'locked'}`}
      onClick={() => {
        sfx.play('tap');
        openSheet(store, 'dungeon');
      }}
      aria-label={open ? '도전 던전' : `도전 던전 — 스테이지 ${config.dungeon.unlockStage} 클리어 시 열림`}
    >
      <span className="dungeon-btn-icon">{open ? <IconPortal size={30} /> : <IconLock size={20} />}</span>
      <span className="dungeon-btn-text">
        도전 던전
        {!open && <small>스테이지 {config.dungeon.unlockStage}</small>}
      </span>
      {open && fresh && <span className="dot" aria-hidden="true" />}
    </button>
  );
}
