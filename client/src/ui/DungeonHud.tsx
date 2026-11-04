import { useEffect, useState } from 'react';
import { PATTERN_COUNTER } from '../core/dungeon/engine';
import { SKILL_IDS, type BossPatternKind } from '../core/model/dungeon';
import { COUNTER_HINT, PATTERN_NAME, SKILL_ICON } from './dungeonText';
import { useGame, useGameContext } from './GameContext';
import { IconCrown, IconPortal } from './icons';
import { UltimateButton } from './UltimateButton';

/** 던전 위쪽 — 단계 · 웨이브 · 시너지 · 보스. 오른쪽 위는 토스 닫기 버튼 자리라 비워 둔다 */
export function DungeonHud() {
  const { session, config } = useGameContext();
  const hud = useGame((s) => s.dungeon);
  const firstRun = useGame((s) => s.progress.dungeon.runs === 0);
  const [confirm, setConfirm] = useState(false);
  if (!hud) return null;
  const over = hud.phase === 'cleared' || hud.phase === 'failed';
  return (
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
          <button className="hud-btn give-up" onClick={() => setConfirm(true)}>
            포기
          </button>
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
          {hud.synergies.map((id) => (
            <span key={id} className="synergy-chip">
              ◆ {config.dungeon.synergies[id].name}
            </span>
          ))}
        </div>
      )}
      {hud.boss && hud.phase === 'fighting' && <BossBar />}
      {firstRun && hud.wave <= 2 && hud.phase === 'fighting' && <p className="dungeon-tip">적을 누르면 그 적부터 공격해요</p>}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
            <h2>던전을 포기할까요?</h2>
            <p className="muted">지금까지 깬 웨이브와 처치 보상은 받아요.</p>
            <div className="modal-actions">
              <button
                className="btn-ad"
                onClick={() => {
                  setConfirm(false);
                  session.abandonDungeon();
                }}
              >
                포기하기
              </button>
              <button className="btn-ok" onClick={() => setConfirm(false)}>
                계속하기
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
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
        casting: c ? { pattern: c.pattern.kind, progress: Math.min(1, (d.now - c.startedAt) / Math.max(1, c.impactAt - c.startedAt)) } : null,
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
