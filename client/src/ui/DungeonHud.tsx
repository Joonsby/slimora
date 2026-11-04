import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PATTERN_COUNTER } from '../core/dungeon/engine';
import type { GameConfig } from '../core/model/config';
import { SKILL_IDS, type BossPatternKind } from '../core/model/dungeon';
import { COUNTER_HINT, PATTERN_NAME, SKILL_ICON } from './dungeonText';
import { useGame, useGameContext } from './GameContext';
import { IconCrown, IconPortal } from './icons';
import { UltimateButton } from './UltimateButton';

/**
 * 던전 위쪽 — 단계 · 웨이브 · 시너지 · 보스. 오른쪽 위는 토스 닫기 버튼 자리라 비워 둔다.
 * 일시정지 · 포기 확인 창은 앱 전체에 띄운다 (HUD 는 높이가 내용만큼이고 터치를 통과시킨다)
 */
export function DungeonHud() {
  const { session, config } = useGameContext();
  const hud = useGame((s) => s.dungeon);
  const firstRun = useGame((s) => s.progress.dungeon.runs === 0);
  const [confirm, setConfirm] = useState(false);
  // 포기를 물으려고 멈췄으면 「계속하기」에서 다시 진행한다
  const pausedForConfirm = useRef(false);
  const askGiveUp = () => {
    pausedForConfirm.current = session.pauseDungeon();
    setConfirm(true);
  };
  const cancelGiveUp = () => {
    setConfirm(false);
    if (pausedForConfirm.current) session.continueDungeon();
    pausedForConfirm.current = false;
  };
  if (!hud) return null;
  const over = hud.phase === 'cleared' || hud.phase === 'failed';
  const header = (
    <header className="hud dungeon-hud">
      <div className="hud-top">
        <span className="stage-pill dungeon-pill">
          <span className="stage-no">
            <IconPortal size={22} />
          </span>
          <span className="stage-text">
            <small>도전 던전</small>
            <strong>{hud.level}단계</strong>
          </span>
        </span>
        {!over && (
          <span className="dungeon-hud-actions">
            {hud.phase !== 'choosing' && (
              <button className="hud-btn pause-btn" aria-label="일시정지" disabled={hud.paused !== null} onClick={() => session.pauseDungeon()}>
                <span aria-hidden="true">Ⅱ</span>
              </button>
            )}
            <button className="hud-btn give-up" onClick={askGiveUp}>
              포기
            </button>
          </span>
        )}
      </div>
      <div className="wave-track" role="progressbar" aria-valuenow={hud.wave} aria-valuemin={0} aria-valuemax={hud.waves} aria-label={`웨이브 ${hud.wave}/${hud.waves}`}>
        <span className="wave-label">
          웨이브 <b>{Math.max(1, hud.wave)}</b>/{hud.waves}
        </span>
        <span className="wave-pips">
          {Array.from({ length: hud.waves }, (_, i) => {
            const n = i + 1;
            const done = n < hud.wave || (n === hud.wave && hud.phase !== 'fighting');
            const boss = String(n) in config.dungeon.waves.bosses;
            return (
              <span key={n} className={`pip ${done ? 'done' : ''} ${n === hud.wave && hud.phase === 'fighting' ? 'now' : ''} ${boss ? 'boss' : ''}`}>
                {boss && <IconCrown size={11} />}
              </span>
            );
          })}
        </span>
      </div>
      {hud.synergies.length > 0 && (
        <div className="synergy-chips">
          {/* 좁은 화면에서 두 줄이 되면 전장을 가린다 — 셋까지만, 나머지는 개수로 */}
          {hud.synergies.slice(0, MAX_CHIPS).map((id) => (
            <span key={id} className="synergy-chip">
              ◆ {config.dungeon.synergies[id].name}
            </span>
          ))}
          {hud.synergies.length > MAX_CHIPS && <span className="synergy-chip more">+{hud.synergies.length - MAX_CHIPS}</span>}
        </div>
      )}
      {hud.boss && hud.phase === 'fighting' && <BossBar />}
      {firstRun && hud.wave <= 2 && hud.phase === 'fighting' && !hud.paused && <p className="dungeon-tip">적을 누르면 그 적부터 공격해요</p>}
      {!firstRun && hud.phase === 'fighting' && !hud.paused && nextIsBoss(hud.wave, config) && <p className="dungeon-tip">다음은 보스 — 필살기를 아껴 두면 첫 큰 공격을 끊을 수 있어요</p>}
    </header>
  );
  const layer = typeof document !== 'undefined' ? document.querySelector('.app') : null;
  return (
    <>
      {header}
      {layer &&
        createPortal(
          <>
            {(hud.paused === 'user' || hud.paused === 'background') && !confirm && (
              <div className="modal-backdrop pause-backdrop">
                <div className="modal confirm pause-panel" role="dialog" aria-label="일시정지">
                  <h2>일시정지</h2>
                  <p className="muted">
                    {hud.level}단계 · 웨이브 {Math.max(1, hud.wave)}/{hud.waves}
                    {hud.paused === 'background' ? ' — 멈춰 둔 곳에서 이어집니다' : ''}
                  </p>
                  <div className="modal-actions">
                    <button className="btn-ad" onClick={askGiveUp}>
                      포기
                    </button>
                    <button className="btn-ok" onClick={() => session.continueDungeon()}>
                      계속하기
                    </button>
                  </div>
                </div>
              </div>
            )}
            {confirm && (
              <div className="modal-backdrop" onClick={cancelGiveUp}>
                <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
                  <h2>던전을 포기할까요?</h2>
                  <p className="muted">지금까지 깬 웨이브와 처치 보상은 받아요.</p>
                  <div className="modal-actions">
                    <button
                      className="btn-ad"
                      onClick={() => {
                        setConfirm(false);
                        pausedForConfirm.current = false;
                        session.abandonDungeon();
                      }}
                    >
                      포기하기
                    </button>
                    <button className="btn-ok" onClick={cancelGiveUp}>
                      계속하기
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>,
          layer,
        )}
    </>
  );
}

/** HUD 에 이름으로 보여 줄 시너지 수 */
const MAX_CHIPS = 3;

/** 지금 웨이브 다음이 보스 웨이브인가 */
function nextIsBoss(wave: number, cfg: GameConfig): boolean {
  return String(wave + 1) in cfg.dungeon.waves.bosses;
}

interface BossView {
  name: string;
  hp: number;
  casting: { pattern: BossPatternKind; progress: number } | null;
  guard: boolean;
  stagger: boolean;
  enraged: boolean;
}

/** 보스 체력과 패턴 예고. 전투 뷰를 0.1초마다 읽는다 */
function BossBar() {
  const { session, config } = useGameContext();
  const [view, setView] = useState<BossView | null>(null);
  useEffect(() => {
    const read = () => {
      const d = session.dungeonView();
      const m = d?.monsters.find((x) => x.boss);
      const b = m?.boss;
      if (!d || !m || !b) return setView(null);
      const c = b.casting;
      setView({
        name: config.dungeon.bosses[b.id]?.name ?? '',
        hp: Math.max(0, m.hp / m.stats.maxHp),
        casting: c
          ? {
              pattern: c.pattern.kind,
              progress: Math.min(1, (d.now - c.startedAt) / Math.max(1, c.impactAt - c.startedAt)),
            }
          : null,
        guard: b.guardUntil > d.now,
        stagger: b.staggerUntil > d.now,
        enraged: b.enraged,
      });
    };
    read();
    const id = setInterval(read, 100);
    return () => clearInterval(id);
  }, [session, config]);
  if (!view) return null;
  const counter = view.casting ? PATTERN_COUNTER[view.casting.pattern] : view.guard ? 'break' : null;
  return (
    <div className={`progress boss dungeon-boss ${view.casting ? 'casting' : ''} ${view.enraged ? 'urgent' : ''}`} role="progressbar" aria-valuenow={Math.round(view.hp * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`보스 ${view.name}`}>
      <span className="progress-label">
        <IconCrown size={15} />
        {view.name}
      </span>
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${view.hp * 100}%` }} />
        {view.casting && <span className="cast-fill" style={{ width: `${view.casting.progress * 100}%` }} />}
      </span>
      <span className="boss-state">
        {view.casting ? `${PATTERN_NAME[view.casting.pattern]}!` : view.guard ? '경화' : view.stagger ? '경직' : view.enraged ? '격노' : ''}
        {counter && <b className="counter-hint">{COUNTER_HINT[counter]}</b>}
      </span>
    </div>
  );
}

/** 던전 아래쪽 — 메뉴 자리에 필살기 버튼과 얻은 스킬 */
export function DungeonBar() {
  const { config } = useGameContext();
  const skills = useGame((s) => s.dungeon?.skills);
  if (!skills) return null;
  const owned = SKILL_IDS.filter((id) => (skills[id] ?? 0) > 0);
  const slots = Array.from({ length: 6 }, (_, i) => owned[i] ?? null);
  const slot = (id: (typeof slots)[number], i: number) => {
    if (!id) return <span key={i} className="skill-slot empty" />;
    const Icon = SKILL_ICON[id];
    const level = skills[id] ?? 0;
    return (
      <span key={i} className="skill-slot" style={{ ['--skill' as string]: config.dungeon.skills[id].color }} title={config.dungeon.skills[id].name}>
        <Icon size={24} />
        <b className="skill-lv">{level >= config.dungeon.skills[id].levels.length ? 'MAX' : level}</b>
      </span>
    );
  };
  return (
    <nav className="menu dungeon-bar" aria-label="스킬 · 필살기">
      <span className="skill-slots">{slots.slice(0, 3).map(slot)}</span>
      <UltimateButton big />
      <span className="skill-slots">{slots.slice(3).map((id, i) => slot(id, i + 3))}</span>
    </nav>
  );
}
