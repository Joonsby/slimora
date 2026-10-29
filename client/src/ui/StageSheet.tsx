import { findMonster } from '../core/lookup';
import { openSheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';
import { Sheet } from './Sheet';

export function StageSheet() {
  const { session, store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'stage');
  const highest = useGame((s) => s.progress.stage.highestCleared);
  const current = useGame((s) => s.hud.stageId);

  const close = () => openSheet(store, 'none');

  return (
    <Sheet open={open} title="사냥터 선택" onClose={close}>
      <p className="hint">클리어한 스테이지는 사냥터로, 바로 다음 스테이지는 도전으로 들어갑니다.</p>
      <ul className="stage-list">
        {config.stages.map((st) => {
          const families = [...new Set(st.spawns.map((sp) => findMonster(config, sp.monster).family))];
          const status = st.id <= highest ? 'cleared' : st.id === highest + 1 ? 'next' : 'locked';
          return (
            <li key={st.id}>
              <button
                className={`stage-item status-${status} ${st.id === current ? 'current' : ''}`}
                disabled={status === 'locked'}
                onClick={() => {
                  if (status === 'cleared') session.huntAt(st.id);
                  else session.challengeNext();
                  close();
                }}
              >
                <span className="stage-no">{st.id}</span>
                <span className="stage-name">
                  {st.name}
                  <span className="families">
                    {families.map((f) => {
                      const fam = config.families.find((x) => x.id === f);
                      return (
                        <span key={f} className="family" style={{ color: fam?.color }}>
                          ● {fam?.name ?? f}
                        </span>
                      );
                    })}
                    {st.boss && <span className="boss-tag">보스 {findMonster(config, st.boss.monster).name}</span>}
                  </span>
                </span>
                <span className="stage-action">{status === 'cleared' ? '사냥' : status === 'next' ? '도전' : '잠김'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
