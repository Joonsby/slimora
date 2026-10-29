import { useEffect, useState } from 'react';
import { findStage, lastStageId } from '../core/lookup';
import { getSlimeLevel } from '../core/progression/absorption';
import { BATTLE_SPEEDS } from '../session/settings';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';

export function Hud() {
  const { session, store, config } = useGameContext();
  const gold = useGame((s) => s.progress.gold);
  const hud = useGame((s) => s.hud);
  const highest = useGame((s) => s.progress.stage.highestCleared);
  const autoAdvance = useGame((s) => s.progress.stage.autoAdvance);
  const speed = useGame((s) => s.settings.battleSpeed);
  const level = useGame((s) => getSlimeLevel(s.progress.slime.absorption, config));

  const stage = findStage(config, hud.stageId);
  const canChallenge = hud.mode === 'farm' && highest < lastStageId(config);
  const nextSpeed = BATTLE_SPEEDS[(BATTLE_SPEEDS.indexOf(speed) + 1) % BATTLE_SPEEDS.length]!;

  return (
    <header className="hud">
      <div className="hud-row">
        <button className="stage-button" onClick={() => openSheet(store, 'stage')}>
          <span className="stage-no">{hud.stageId}</span>
          <span className="stage-name">{stage.name}</span>
          <span className="caret">▾</span>
        </button>
        <span className="spacer" />
        {canChallenge && (
          <button className="challenge-button" onClick={() => session.challengeNext()}>
            도전 ▶
          </button>
        )}
        <div className="gold" aria-label="골드">
          <span className="gold-icon">G</span>
          {formatNumber(gold)}
        </div>
      </div>
      <div className="hud-row">
        {hud.boss ? (
          <BossTimer />
        ) : (
          <span className={`chip mode-${hud.mode}`}>{hud.mode === 'challenge' ? `도전 ${hud.kills}/${hud.killsToClear}` : '사냥 중'}</span>
        )}
        <button className="chip level" onClick={() => openSheet(store, 'absorb')} aria-label={`슬라임 레벨 ${level}, 흡수 보기`}>
          Lv {level}
        </button>
        <span className="spacer" />
        <button className={`toggle ${autoAdvance ? 'on' : ''}`} onClick={() => session.setAutoAdvance(!autoAdvance)} aria-pressed={autoAdvance} aria-label="자동진행">
          자동 {autoAdvance ? 'ON' : 'OFF'}
        </button>
        <button className="toggle" onClick={() => session.setBattleSpeed(nextSpeed)} aria-label={`전투 속도 ${speed}배`}>
          ×{speed}
        </button>
      </div>
    </header>
  );
}

/** 보스 남은 시간. 전투 뷰를 0.2초마다 읽는다 (엔진 시각이라 배속을 따른다) */
function BossTimer() {
  const { session } = useGameContext();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const view = session.view();
      setLeft(view && view.bossEndsAt !== null ? Math.max(0, view.bossEndsAt - view.now) : null);
    }, 200);
    return () => clearInterval(id);
  }, [session]);
  const sec = left === null ? 0 : Math.ceil(left / 1000);
  return <span className="chip mode-boss">{left === null ? '보스 등장' : `보스 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</span>;
}
