import { useState } from 'react';
import { findStage } from '../core/lookup';
import { legacyBonus } from '../core/progression/prestige';
import { hasAdPass } from '../core/progression/shop';
import { formatDuration, formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { useSlimeLook } from './Hud';
import { IconCoin, IconPlay } from './icons';
import { familyImage, slimeImage } from './portraits';

/** 돌아왔을 때 — 기본 보상은 이미 받았고, 광고를 보면 한 번 더 */
export function OfflineRewardModal() {
  const { session, config, ads } = useGameContext();
  const notice = useGame((s) => s.offline);
  const prestige = useGame((s) => s.progress.prestige);
  const pass = useGame((s) => hasAdPass(s.progress, config));
  const look = useSlimeLook();
  const [watching, setWatching] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!notice) return null;

  const { reward, bonus } = notice;
  const multiplier = config.balance.offline.adMultiplier;
  const shown = bonus === 'claimed' ? multiplier : 1;
  const stage = findStage(config, reward.stageId);

  const watch = async () => {
    // 광고 패스가 있으면 광고 없이 바로
    if (pass) {
      session.claimOfflineBonus();
      return;
    }
    if (!ads) return;
    setWatching(true);
    setFailed(false);
    const earned = await ads.show();
    setWatching(false);
    if (earned) session.claimOfflineBonus();
    else setFailed(true);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal offline-modal" role="dialog" aria-label="오프라인 보상">
        <div className="offline-hero">
          <img src={slimeImage(look.color, look.preset)} alt="" />
          <span className="zzz" aria-hidden="true">
            z<small>z</small>
          </span>
        </div>
        <h2>돌아오셨네요!</h2>
        <p className="muted">
          {formatDuration(reward.awayMs)} 동안 {stage.name}에서 사냥했어요
          {reward.capped && <small> (최대 {formatDuration(config.balance.offline.capMs + legacyBonus(prestige, config).offlineMs)})</small>}
        </p>
        <div className="reward-list">
          <span className="reward gold">
            <IconCoin size={26} />+{formatNumber(reward.gold * shown)}
          </span>
          {Object.entries(reward.absorb).map(([family, amount]) => {
            const fam = config.families.find((f) => f.id === family);
            return (
              <span key={family} className="reward absorb" style={{ ['--family' as string]: fam?.color }}>
                <img src={familyImage(config, family)} alt="" />
                {fam?.name} 흡수 +{formatNumber((amount ?? 0) * shown)}
              </span>
            );
          })}
        </div>
        {bonus === 'claimed' && <p className="bonus-done">{pass ? '광고 패스' : '광고 보너스'}로 {multiplier}배를 받았어요!</p>}
        {failed && <p className="hint warn">광고를 불러오지 못했어요. 잠시 후 다시 해 주세요.</p>}
        <div className="modal-actions">
          {(ads || pass) && bonus === 'available' && (
            <button className="btn-ad" disabled={watching} onClick={() => void watch()}>
              <IconPlay size={22} />
              {watching ? '광고 불러오는 중…' : pass ? `광고 없이 ${multiplier}배 받기` : `광고 보고 ${multiplier}배 받기`}
            </button>
          )}
          <button className="btn-ok" disabled={watching} onClick={() => session.dismissOffline()}>
            {bonus === 'claimed' ? '좋아요' : '받기'}
          </button>
        </div>
      </div>
    </div>
  );
}
