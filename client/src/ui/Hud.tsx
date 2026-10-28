import { findStage, lastStageId } from '../core/lookup';
import { deriveSlimeStats } from '../core/stats';
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
  const attack = useGame((s) => deriveSlimeStats(s.progress.slime, config).attack);

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
        <span className={`chip mode-${hud.mode}`}>{hud.mode === 'challenge' ? `도전 ${hud.kills}/${hud.killsToClear}` : '사냥 중'}</span>
        <span className="chip stat">공격력 {formatNumber(attack)}</span>
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
