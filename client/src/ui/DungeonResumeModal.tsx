import { SKILL_IDS } from '../core/model/dungeon';
import { SKILL_ICON } from './dungeonText';
import { useGame, useGameContext } from './GameContext';
import { IconPortal } from './icons';

/** 다시 실행했을 때 진행 중이던 던전이 있으면 — 이어 하거나, 포기하고 그때까지의 보상을 받는다 */
export function DungeonResumeModal() {
  const { session, config, sfx } = useGameContext();
  const info = useGame((s) => s.dungeonResume);
  if (!info) return null;
  const owned = SKILL_IDS.filter((id) => (info.skills[id] ?? 0) > 0);
  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-resume" role="dialog" aria-label="진행 중인 던전">
        <span className="resume-icon">
          <IconPortal size={34} />
        </span>
        <h2>진행 중인 도전 던전이 있어요</h2>
        <p className="muted">
          {info.level}단계 · 웨이브 <b>{info.wave}</b>/{info.waves} · HP {Math.max(1, Math.round(info.hp * 100))}%
        </p>
        {owned.length > 0 && (
          <div className="result-skills">
            {owned.map((id) => {
              const Icon = SKILL_ICON[id];
              return (
                <span key={id} className="skill-slot" style={{ ['--skill' as string]: config.dungeon.skills[id].color }} title={config.dungeon.skills[id].name}>
                  <Icon size={22} />
                  <b className="skill-lv">{info.skills[id]}</b>
                </span>
              );
            })}
          </div>
        )}
        {info.synergies.length > 0 && <p className="bonus-done">◆ {info.synergies.map((id) => config.dungeon.synergies[id].name).join(' · ')}</p>}
        <div className="modal-actions">
          <button
            className="btn-ad"
            onClick={() => {
              sfx.play('tap');
              session.abandonSavedDungeon();
            }}
          >
            포기하고 보상 받기
          </button>
          <button
            className="btn-ok"
            onClick={() => {
              sfx.play('tap');
              session.resumeSavedDungeon();
            }}
          >
            이어하기
          </button>
        </div>
      </div>
    </div>
  );
}
