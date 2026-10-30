import { useEffect, useState } from 'react';
import { numberToHex } from '../art/color';
import type { SlimePreset } from '../art/slime';
import { slimeTint } from '../art/slimeColor';
import { findMonster, findStage, lastStageId } from '../core/lookup';
import { getSlimeLevel } from '../core/progression/absorption';
import { findForm } from '../core/progression/forms';
import { BATTLE_SPEEDS } from '../session/settings';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { IconAuto, IconCaret, IconCoin, IconCrown, IconFlag, IconGem, IconSound, IconSpeed, IconTrophy } from './icons';
import { slimeImage } from './portraits';

/** 전투 화면 위에 얹는 HUD. 오른쪽 위는 토스 닫기 버튼 자리라 비워 둔다 */
export function Hud() {
  const { session, store, config, leaderboard, shop } = useGameContext();
  const gold = useGame((s) => s.progress.gold);
  const gems = useGame((s) => s.progress.gems);
  const hud = useGame((s) => s.hud);
  const autoAdvance = useGame((s) => s.progress.stage.autoAdvance);
  const speed = useGame((s) => s.settings.battleSpeed);
  const sound = useGame((s) => s.settings.sound);
  const level = useGame((s) => getSlimeLevel(s.progress.slime.absorption, config));
  const look = useSlimeLook();

  const stage = findStage(config, hud.stageId);
  const nextSpeed = BATTLE_SPEEDS[(BATTLE_SPEEDS.indexOf(speed) + 1) % BATTLE_SPEEDS.length]!;

  return (
    <header className="hud">
      <div className="hud-top">
        <button className="stage-pill" onClick={() => openSheet(store, 'stage')} aria-label={`스테이지 ${hud.stageId} ${stage.name}, 사냥터 선택`}>
          <span className="stage-no">{hud.stageId}</span>
          <span className="stage-text">
            <small>{stage.chapter}장</small>
            <strong>{stage.name}</strong>
          </span>
          <IconCaret size={16} className="caret" />
        </button>
        {leaderboard && (
          <button className="hud-btn icon trophy" onClick={() => void leaderboard.open()} aria-label="랭킹">
            <IconTrophy size={20} />
          </button>
        )}
        <button className={`hud-btn icon ${sound ? 'on' : ''}`} onClick={() => session.setSound(!sound)} aria-pressed={sound} aria-label={sound ? '소리 끄기' : '소리 켜기'}>
          <IconSound size={18} muted={!sound} />
        </button>
      </div>
      <div className="hud-row">
        <div className="res wallet">
          <span className="gold" aria-label={`골드 ${gold}`}>
            <IconCoin size={20} />
            {formatNumber(gold)}
          </span>
          <span className="gems" role="button" aria-label={`보석 ${gems}, ${shop ? '상점' : '용병'} 열기`} onClick={() => openSheet(store, shop ? 'shop' : 'mercenary')}>
            <IconGem size={18} />
            {formatNumber(gems)}
            {shop && <b className="gem-plus">+</b>}
          </span>
        </div>
        <button className="res level" onClick={() => openSheet(store, 'absorb')} aria-label={`슬라임 레벨 ${level}, 흡수 보기`}>
          <img src={slimeImage(look.color, look.preset)} alt="" />
          <span>
            <small className="lv-prefix">Lv </small>
            {level}
          </span>
        </button>
        <span className="spacer" />
        <button className={`hud-btn ${autoAdvance ? 'on' : ''}`} onClick={() => session.setAutoAdvance(!autoAdvance)} aria-pressed={autoAdvance} aria-label="자동진행">
          <IconAuto size={15} />
          <span className="hud-btn-text">자동</span>
        </button>
        <button className={`hud-btn ${speed > 1 ? 'on' : ''}`} onClick={() => session.setBattleSpeed(nextSpeed)} aria-label={`전투 속도 ${speed}배`}>
          <IconSpeed size={13} />×{speed}
        </button>
      </div>
      {hud.boss ? <BossBar /> : hud.mode === 'challenge' ? <ChallengeBar kills={hud.kills} goal={hud.killsToClear} /> : null}
    </header>
  );
}

function ChallengeBar({ kills, goal }: { kills: number; goal: number }) {
  const ratio = goal > 0 ? Math.min(1, kills / goal) : 0;
  return (
    <div className="progress challenge" role="progressbar" aria-valuenow={kills} aria-valuemin={0} aria-valuemax={goal} aria-label="도전 진행">
      <span className="progress-label">
        <IconFlag size={13} />
        도전
      </span>
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="progress-value">
        {kills}/{goal}
      </span>
    </div>
  );
}

/** 보스 체력 · 남은 시간. 전투 뷰를 0.2초마다 읽는다 (엔진 시각이라 배속을 따른다) */
function BossBar() {
  const { session, config } = useGameContext();
  const [state, setState] = useState<{ name: string; hp: number; left: number | null } | null>(null);
  useEffect(() => {
    const read = () => {
      const view = session.view();
      const m = view?.monster;
      if (!view || !m) return setState(null);
      setState({
        name: findMonster(config, m.defId).name,
        hp: Math.max(0, m.hp / m.stats.maxHp),
        left: view.bossEndsAt === null ? null : Math.max(0, view.bossEndsAt - view.now),
      });
    };
    read();
    const id = setInterval(read, 200);
    return () => clearInterval(id);
  }, [session, config]);
  if (!state) return null;
  const sec = state.left === null ? null : Math.ceil(state.left / 1000);
  return (
    <div className={`progress boss ${sec !== null && sec <= 10 ? 'urgent' : ''}`} role="progressbar" aria-valuenow={Math.round(state.hp * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`보스 ${state.name}`}>
      <span className="progress-label">
        <IconCrown size={15} />
        {state.name}
      </span>
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${state.hp * 100}%` }} />
      </span>
      {sec !== null && <span className="progress-value">{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</span>}
    </div>
  );
}

/** 사냥 중이고 다음 스테이지가 열려 있으면 전투 화면 오른쪽 아래에 도전 버튼 */
export function ChallengeButton() {
  const { session, config } = useGameContext();
  const mode = useGame((s) => s.hud.mode);
  const highest = useGame((s) => s.progress.stage.highestCleared);
  if (mode !== 'farm' || highest >= lastStageId(config)) return null;
  return (
    <button className="challenge-cta" onClick={() => session.challengeNext()}>
      <IconFlag size={18} />
      <span>
        <small>스테이지 {highest + 1}</small>
        도전하기
      </span>
    </button>
  );
}

/** 지금 슬라임 외형 — 진화했으면 형태 색, 아니면 흡수 색 */
export function useSlimeLook(): { color: string; preset: SlimePreset } {
  const { config } = useGameContext();
  const absorption = useGame((s) => s.progress.slime.absorption);
  const formId = useGame((s) => s.progress.slime.form);
  const form = formId ? findForm(config, formId) : undefined;
  if (form) return { color: form.visual.tint, preset: form.visual.preset as SlimePreset };
  return { color: numberToHex(slimeTint(absorption, config.families)), preset: null };
}
