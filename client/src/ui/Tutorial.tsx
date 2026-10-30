import { useEffect, useRef, useState } from 'react';
import { lastStageId } from '../core/lookup';
import type { GameConfig } from '../core/model/config';
import { traitTier } from '../core/progression/absorption';
import { anyFormAvailable } from '../core/progression/forms';
import { essenceForRebirth } from '../core/progression/prestige';
import { getUpgradeCost } from '../core/progression/upgrades';
import type { GameStoreState } from '../store/gameStore';
import { useGame, useGameContext } from './GameContext';
import { useSlimeLook } from './Hud';
import { slimeImage } from './portraits';

interface Step {
  id: string;
  /** 짚어 줄 요소. 없으면 가운데 말풍선만 */
  target: string | null;
  text: string;
  when: (s: GameStoreState, cfg: GameConfig) => boolean;
  /** 이렇게 되면 안내를 본 것으로 친다 (대개 그 메뉴를 열었을 때) */
  done?: (s: GameStoreState) => boolean;
}

/** 처음 몇 분 동안 한 번씩만 짚어 준다 */
const STEPS: Step[] = [
  {
    id: 'welcome',
    target: null,
    text: '슬라임은 혼자서 싸워요! 쓰러뜨린 몬스터의 골드를 모으고, 그 힘을 흡수해 강해집니다.',
    when: (s) => s.progress.stage.highestCleared === 0 && s.progress.lifetime.goldEarned < 40,
  },
  {
    id: 'upgrade',
    target: '.menu-item.tone-orange',
    text: '골드가 모였어요! 강화에서 공격력을 올려 보세요.',
    when: (s, cfg) => {
      const attack = cfg.upgrades.find((u) => u.id === 'attack');
      return !!attack && Object.values(s.progress.slime.upgrades).every((lv) => !lv) && s.progress.gold >= getUpgradeCost(attack, 0);
    },
    done: (s) => s.sheet === 'upgrade',
  },
  {
    id: 'challenge',
    target: '.challenge-cta',
    text: '이 사냥터에서 충분히 강해졌다면 다음 스테이지에 도전하세요. 실패해도 다시 사냥하면 돼요.',
    when: (s, cfg) => s.hud.mode === 'farm' && s.progress.stage.highestCleared >= 1 && s.progress.stage.highestCleared < lastStageId(cfg),
    done: (s) => s.hud.mode === 'challenge',
  },
  {
    id: 'mercenary',
    target: '.menu-item.tone-blue',
    text: '보석으로 용병을 영입해 보세요! 함께 싸우며 지원 공격을 하고 능력도 올려 줍니다.',
    when: (s, cfg) => s.progress.stage.highestCleared >= 1 && s.progress.gems >= cfg.balance.gacha.single && Object.keys(s.progress.mercenaries.owned).length === 0,
    done: (s) => s.sheet === 'mercenary',
  },
  {
    id: 'absorb',
    target: '.res.level',
    text: '몬스터를 흡수해 특성이 생겼어요! 레벨을 누르면 계열별 힘을 확인할 수 있어요.',
    when: (s, cfg) => cfg.traits.some((t) => traitTier(t, s.progress.slime.absorption[t.family] ?? 0) > 0),
    done: (s) => s.sheet === 'absorb',
  },
  {
    id: 'evolve',
    target: '.menu-item.tone-gold',
    text: '진화할 수 있어요! 슬라임의 모습과 능력이 완전히 바뀝니다.',
    when: (s, cfg) => anyFormAvailable(s.progress, cfg),
    done: (s) => s.sheet === 'evolve',
  },
  {
    id: 'rebirth',
    target: '.menu-item.tone-rose',
    text: '환생할 수 있어요! 처음부터 다시 하는 대신, 영원히 남는 정수로 훨씬 강해집니다.',
    when: (s, cfg) => s.progress.prestige.count === 0 && essenceForRebirth(s.progress, cfg) > 0,
    done: (s) => s.sheet === 'rebirth',
  },
];

function currentStep(s: GameStoreState, cfg: GameConfig): Step | null {
  if (!s.ready || s.sheet !== 'none' || s.offline) return null;
  return STEPS.find((step) => !s.settings.tutorial.includes(step.id) && step.when(s, cfg)) ?? null;
}

/** 튜토리얼 말풍선. 화면을 막지 않고 짚기만 한다 — 짚은 메뉴를 누르거나 「알겠어요」로 넘어간다 */
export function Tutorial() {
  const { session, store, config } = useGameContext();
  const stepId = useGame((s) => currentStep(s, config)?.id ?? null);
  const step = STEPS.find((s) => s.id === stepId) ?? null;
  const look = useSlimeLook();
  const [measured, setMeasured] = useState<{ target: string; rect: DOMRect } | null>(null);
  const rect = step?.target && measured?.target === step.target ? measured.rect : null;
  const shown = useRef<Step | null>(null);
  useEffect(() => {
    if (step) shown.current = step;
  }, [step]);

  // 짚은 메뉴를 열면(도전이면 도전을 시작하면) 본 것으로
  useEffect(
    () =>
      store.subscribe((s) => {
        const st = shown.current;
        if (st?.done?.(s) && !s.settings.tutorial.includes(st.id)) session.completeTutorial(st.id);
      }),
    [store, session],
  );

  // 짚을 요소의 위치를 잰다 (다음 프레임 — 요소가 막 그려졌을 수 있다)
  useEffect(() => {
    const target = step?.target;
    if (!target) return;
    const measure = () => {
      const r = document.querySelector(target)?.getBoundingClientRect();
      setMeasured(r ? { target, rect: r } : null);
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  if (!step || (step.target && !rect)) return null;
  const below = rect ? rect.top + rect.height / 2 < window.innerHeight * 0.5 : false;
  const bubbleStyle = rect
    ? below
      ? { top: rect.bottom + 14 }
      : { bottom: window.innerHeight - rect.top + 14 }
    : { top: '38%' };
  const arrowLeft = rect ? Math.min(Math.max(rect.left + rect.width / 2, 36), window.innerWidth - 36) : null;

  return (
    <div className="coach" aria-live="polite">
      {rect && <span className="coach-ring" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className={`coach-bubble ${rect ? (below ? 'below' : 'above') : 'center'}`} style={bubbleStyle}>
        {arrowLeft !== null && <span className="coach-arrow" style={{ left: arrowLeft - 12 }} />}
        <img src={slimeImage(look.color, look.preset)} alt="" />
        <p>{step.text}</p>
        <button onClick={() => session.completeTutorial(step.id)}>알겠어요</button>
      </div>
    </div>
  );
}
