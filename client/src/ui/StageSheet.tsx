import { useEffect, useRef, useState } from 'react';
import { sceneColors } from '../art/backgrounds';
import { findMonster, findStage } from '../core/lookup';
import type { StageDef } from '../core/model/config';
import { openSheet } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';
import { IconCaret, IconCrown, IconLock, IconMap } from './icons';
import { monsterImage } from './portraits';
import { Sheet } from './Sheet';

type Status = 'cleared' | 'next' | 'locked';

const thumbStyle = (scene: string) => {
  const colors = sceneColors(scene);
  return { background: `radial-gradient(circle at 50% 85%, ${colors.glow}66, transparent 60%), linear-gradient(${colors.sky[0]}, ${colors.sky[1]} 72%, ${colors.ground} 72%)` };
};

export function StageSheet() {
  const { store } = useGameContext();
  const open = useGame((s) => s.sheet === 'stage');
  const close = () => openSheet(store, 'none');
  return (
    <Sheet open={open} title="사냥터" icon={<IconMap size={24} />} onClose={close}>
      <StageList onClose={close} />
    </Sheet>
  );
}

/** 시트를 열 때마다 새로 그린다 — 지금 있는 장만 펼치고 지금 스테이지가 보이게 */
function StageList({ onClose }: { onClose: () => void }) {
  const { session, config } = useGameContext();
  const highest = useGame((s) => s.progress.stage.highestCleared);
  const current = useGame((s) => s.hud.stageId);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set([findStage(config, current).chapter]));
  const currentCard = useRef<HTMLButtonElement>(null);

  // scrollIntoView 는 바깥 화면까지 밀어 올리므로 시트 본문만 굴린다
  useEffect(() => {
    const card = currentCard.current;
    const body = card?.closest('.sheet-body');
    if (!card || !body) return;
    body.scrollTop += card.getBoundingClientRect().top - body.getBoundingClientRect().top - (body.clientHeight - card.clientHeight) / 2;
  }, []);

  const toggle = (chapter: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(chapter)) next.add(chapter);
      return next;
    });
  const statusOf = (st: StageDef): Status => (st.id <= highest ? 'cleared' : st.id === highest + 1 ? 'next' : 'locked');

  return (
    <>
      <p className="hint">클리어한 스테이지는 사냥터로, 바로 다음 스테이지는 도전으로 들어갑니다. 장 마지막에는 보스가 기다립니다.</p>
      {config.chapters.map((ch) => {
        const stages = config.stages.filter((st) => st.chapter === ch.id);
        const cleared = stages.filter((st) => st.id <= highest).length;
        const boss = stages.find((st) => st.boss);
        const locked = stages[0]!.id > highest + 1;
        const isOpen = expanded.has(ch.id);
        return (
          <section key={ch.id} className={`chapter ${locked ? 'locked' : ''}`}>
            <button className={`chapter-head ${isOpen ? 'open' : ''}`} onClick={() => toggle(ch.id)} aria-expanded={isOpen}>
              <span className="chapter-thumb" style={thumbStyle((boss ?? stages[0]!).scene)}>
                {boss && <img src={monsterImage(config, boss.boss!.monster)} alt="" />}
              </span>
              <span className="chapter-text">
                <small>{ch.id}장</small>
                <strong>{ch.name}</strong>
                <span className="chapter-progress" aria-label={`${stages.length}개 중 ${cleared}개 클리어`}>
                  <span className="bar">
                    <span style={{ width: `${(cleared / stages.length) * 100}%` }} />
                  </span>
                  {cleared}/{stages.length}
                </span>
              </span>
              {cleared === stages.length ? <IconCrown size={18} className="chapter-crown" /> : locked ? <IconLock size={16} className="chapter-lock" /> : null}
              <IconCaret size={16} className="chapter-caret" />
            </button>
            {isOpen && (
              <ul className="card-list">
                {stages.map((st) => {
                  const families = [...new Set(st.spawns.map((sp) => findMonster(config, sp.monster).family))];
                  const status = statusOf(st);
                  const face = st.boss?.monster ?? st.spawns[0]?.monster;
                  return (
                    <li key={st.id}>
                      <button
                        ref={st.id === current ? currentCard : undefined}
                        className={`card stage-card status-${status} ${st.id === current ? 'current' : ''}`}
                        disabled={status === 'locked'}
                        onClick={() => {
                          if (status === 'cleared') session.huntAt(st.id);
                          else session.challengeNext();
                          onClose();
                        }}
                      >
                        <span className="stage-thumb" style={thumbStyle(st.scene)}>
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
            )}
          </section>
        );
      })}
    </>
  );
}
