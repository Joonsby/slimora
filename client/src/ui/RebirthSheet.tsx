import { useState, type ReactNode } from 'react';
import type { LegacyDef } from '../core/model/config';
import { essenceForRebirth, isLegacyMaxed, legacyCost, rankScore } from '../core/progression/prestige';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { HoldButton } from './HoldButton';
import { useSlimeLook } from './Hud';
import { IconArrow, IconCoin, IconEssence, IconHeart, IconMoon, IconRebirth, IconSword } from './icons';
import { slimeImage } from './portraits';
import { Sheet } from './Sheet';

const ICONS: Record<LegacyDef['stat'], ReactNode> = {
  attack: <IconSword size={30} />,
  maxHp: <IconHeart size={30} />,
  gold: <IconCoin size={30} />,
  offlineHours: <IconMoon size={30} />,
};

/** 효과를 사람이 읽는 말로 — 공격력 +20% · 오프라인 보상 최대 +2시간 */
function effectAt(def: LegacyDef, level: number): string {
  const amount = def.perLevel * level;
  switch (def.stat) {
    case 'attack':
      return `공격력 +${Math.round(amount * 100)}%`;
    case 'maxHp':
      return `최대 HP +${Math.round(amount * 100)}%`;
    case 'gold':
      return `처치 골드 +${Math.round(amount * 100)}%`;
    case 'offlineHours':
      return `오프라인 보상 +${amount}시간`;
  }
}

export function RebirthSheet() {
  const { session, store, config, sfx } = useGameContext();
  const open = useGame((s) => s.sheet === 'rebirth');
  const prestige = useGame((s) => s.progress.prestige);
  const highest = useGame((s) => s.progress.stage.highestCleared);
  const score = useGame((s) => rankScore(s.progress));
  const gain = useGame((s) => essenceForRebirth(s.progress, config));
  const look = useSlimeLook();
  const [confirming, setConfirming] = useState(false);
  const unlock = config.balance.prestige.unlockStage;

  const close = () => {
    setConfirming(false);
    openSheet(store, 'none');
  };

  return (
    <Sheet open={open} title="환생" icon={<IconRebirth size={24} className="rebirth-title-icon" />} onClose={close}>
      <div className="hero-card rebirth-hero">
        <img className="hero-portrait" src={slimeImage(look.color, look.preset)} alt="" />
        <div className="hero-body">
          <span className="hero-level">
            환생 <b>{prestige.count}</b>회
          </span>
          <span className="essence-pill">
            <IconEssence size={18} />
            정수 {formatNumber(prestige.essence)}
          </span>
          <span className="muted small">
            최고 기록 · 스테이지 {Math.max(prestige.bestStage, highest)} · 랭킹 점수 {score}
          </span>
        </div>
      </div>

      <div className={`rebirth-box ${gain > 0 ? 'ready' : ''}`}>
        {gain > 0 ? (
          <>
            <p>
              지금 환생하면 <b className="gain">정수 +{gain}</b>
              <br />
              <span className="muted small">스테이지를 더 깊이 깰수록 정수를 더 받습니다</span>
            </p>
            {confirming ? (
              <div className="confirm">
                <p className="warn-text">골드 · 강화 · 흡수 · 스테이지가 처음으로 돌아갑니다. 진화한 형태와 정수 강화는 남습니다.</p>
                <div className="confirm-actions">
                  <button className="btn-cancel" onClick={() => setConfirming(false)}>
                    취소
                  </button>
                  <button
                    className="btn-rebirth"
                    onClick={() => {
                      if (session.rebirth().ok) close();
                    }}
                  >
                    <IconRebirth size={20} />
                    환생하기
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-rebirth" onClick={() => setConfirming(true)}>
                <IconRebirth size={20} />
                환생하기
              </button>
            )}
          </>
        ) : (
          <>
            <p>
              스테이지 {unlock}을 깨면 환생할 수 있어요
              <br />
              <span className="muted small">처음부터 다시 하는 대신 영원히 남는 정수 강화를 얻습니다</span>
            </p>
            <span className="bar xp-dark">
              <span style={{ width: `${Math.min(100, (highest / unlock) * 100)}%` }} />
            </span>
            <span className="muted small">
              지금 최고 스테이지 {highest} / {unlock}
            </span>
          </>
        )}
      </div>

      <h3 className="section-title">
        <IconEssence size={18} />
        정수 강화 <span className="muted small">— 환생해도 남습니다</span>
      </h3>
      <div className="card-list">
        {config.legacy.map((def) => {
          const level = prestige.legacy[def.id] ?? 0;
          const maxed = isLegacyMaxed(def, level);
          const cost = legacyCost(def, level);
          return (
            <div className={`card legacy-card legacy-${def.stat}`} key={def.id}>
              <span className="card-icon">{ICONS[def.stat]}</span>
              <div className="card-body">
                <span className="card-title">
                  {def.name} <span className="lv">Lv {level}</span>
                </span>
                <span className="stat-change">
                  {level > 0 ? effectAt(def, level) : '없음'}
                  {!maxed && (
                    <>
                      <IconArrow size={13} />
                      <b>{effectAt(def, level + 1)}</b>
                    </>
                  )}
                </span>
              </div>
              <HoldButton
                className="buy essence"
                disabled={maxed || prestige.essence < cost}
                onFire={() => {
                  const ok = session.purchaseLegacy(def.id).ok;
                  if (ok) sfx.play('buy');
                  return ok;
                }}
              >
                {maxed ? (
                  '최대'
                ) : (
                  <>
                    <IconEssence size={18} />
                    {formatNumber(cost)}
                  </>
                )}
              </HoldButton>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
