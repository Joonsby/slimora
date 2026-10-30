import { sceneColors } from '../art/backgrounds';
import { findMonster } from '../core/lookup';
import { openSheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';
import { IconCrown, IconLock, IconMap } from './icons';
import { monsterImage } from './portraits';
import { Sheet } from './Sheet';

export function StageSheet() {
  const { session, store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'stage');
  const highest = useGame((s) => s.progress.stage.highestCleared);
  const current = useGame((s) => s.hud.stageId);

  const close = () => openSheet(store, 'none');
  const chapters = [...new Set(config.stages.map((s) => s.chapter))];

  return (
    <Sheet open={open} title="사냥터" icon={<IconMap size={24} />} onClose={close}>
      <p className="hint">클리어한 스테이지는 사냥터로, 바로 다음 스테이지는 도전으로 들어갑니다.</p>
      {chapters.map((chapter) => (
        <section key={chapter} className="chapter">
          <h3 className="chapter-title">{chapter}장</h3>
          <ul className="card-list">
            {config.stages
              .filter((st) => st.chapter === chapter)
              .map((st) => {
                const families = [...new Set(st.spawns.map((sp) => findMonster(config, sp.monster).family))];
                const status = st.id <= highest ? 'cleared' : st.id === highest + 1 ? 'next' : 'locked';
                const colors = sceneColors(st.scene);
                const face = st.boss?.monster ?? st.spawns[0]?.monster;
                return (
                  <li key={st.id}>
                    <button
                      className={`card stage-card status-${status} ${st.id === current ? 'current' : ''}`}
                      disabled={status === 'locked'}
                      onClick={() => {
                        if (status === 'cleared') session.huntAt(st.id);
                        else session.challengeNext();
                        close();
                      }}
                    >
                      <span className="stage-thumb" style={{ background: `radial-gradient(circle at 50% 85%, ${colors.glow}66, transparent 60%), linear-gradient(${colors.sky[0]}, ${colors.sky[1]} 72%, ${colors.ground} 72%)` }}>
                        {face && <img src={monsterImage(config, face)} alt="" />}
                        <span className="stage-no">{st.id}</span>
                      </span>
                      <span className="card-body">
                        <span className="card-title">
                          {st.name}
                          {st.id === current && <span className="tag">현재</span>}
                        </span>
                        <span className="families">
                          {families.map((f) => {
                            const fam = config.families.find((x) => x.id === f);
                            return (
                              <span key={f} className="family-chip" style={{ color: fam?.color, borderColor: `${fam?.color}55` }}>
                                {fam?.name ?? f}
                              </span>
                            );
                          })}
                          {st.boss && (
                            <span className="family-chip boss">
                              <IconCrown size={12} />
                              {findMonster(config, st.boss.monster).name}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className={`stage-action ${status}`}>{status === 'cleared' ? '사냥' : status === 'next' ? '도전' : <IconLock size={16} />}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
