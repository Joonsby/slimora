import { useState } from 'react';
import type { MercenaryDef, Rarity } from '../core/model/config';
import { adGemsLeft, findMercenary, mercenaryPower, mercenaryRate, type SummonPull } from '../core/progression/mercenary';
import { hasAdPass } from '../core/progression/shop';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { IconGem, IconParty, IconPlay } from './icons';
import { mercenaryImage } from './portraits';
import { Sheet } from './Sheet';

export const RARITY_NAME: Record<Rarity, string> = { common: '일반', rare: '희귀', legendary: '전설' };

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

function passiveText(def: MercenaryDef, value: number): string {
  switch (def.passive.stat) {
    case 'attack':
      return `공격력 +${pct(value)}`;
    case 'maxHp':
      return `최대 HP +${pct(value)}`;
    case 'gold':
      return `처치 골드 +${pct(value)}`;
    case 'critChance':
      return `치명타 확률 +${pct(value)}`;
    case 'damageReduction':
      return `받는 피해 -${pct(value)}`;
  }
}

export function MercenarySheet() {
  const { session, store, config, ads, sfx, shop } = useGameContext();
  const open = useGame((s) => s.sheet === 'mercenary');
  const gems = useGame((s) => s.progress.gems);
  const mercs = useGame((s) => s.progress.mercenaries);
  const progress = useGame((s) => s.progress);
  const [showRates, setShowRates] = useState(false);
  const [pulls, setPulls] = useState<SummonPull[] | null>(null);
  const [watching, setWatching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { single, ten } = config.balance.gacha;
  const slots = config.balance.party.slots;
  const adLeft = adGemsLeft(progress, session.today(), config);
  const pass = hasAdPass(progress, config);

  const pull = (count: 1 | 10) => {
    const result = session.summon(count);
    if (!result) return;
    sfx.play(result.some((p) => findMercenary(config, p.id)?.rarity === 'legendary') ? 'legendary' : 'summon');
    setPulls(result);
  };

  const watchAd = async () => {
    // 광고 패스가 있으면 광고 없이 바로 (하루 횟수는 같다)
    if (pass) {
      session.claimAdGems();
      return;
    }
    if (!ads) return;
    setWatching(true);
    setNotice(null);
    const earned = await ads.show();
    setWatching(false);
    if (!(earned && session.claimAdGems())) setNotice('광고를 불러오지 못했어요. 잠시 후 다시 해 주세요.');
  };

  const toggleParty = (id: string) => {
    const party = mercs.party.includes(id) ? mercs.party.filter((x) => x !== id) : mercs.party.length < slots ? [...mercs.party, id] : [...mercs.party.slice(0, slots - 1), id];
    if (session.setParty(party).ok) sfx.play('tap');
  };

  return (
    <Sheet open={open} title="용병" icon={<IconParty size={26} />} onClose={() => openSheet(store, 'none')}>
      <div className="gem-bar">
        <span className="gem-balance">
          <IconGem size={22} />
          {formatNumber(gems)}
          {shop && (
            <button className="btn-charge" onClick={() => openSheet(store, 'shop')}>
              충전
            </button>
          )}
        </span>
        {(ads || pass) && (
          <button className="btn-ad-gems" disabled={watching || adLeft <= 0} onClick={() => void watchAd()}>
            <IconPlay size={18} />
            {watching ? '불러오는 중…' : adLeft <= 0 ? '오늘은 끝' : pass ? `바로 받기 +${config.balance.gems.adReward}` : `광고 보고 +${config.balance.gems.adReward}`}
            <small>
              {config.balance.gems.adDailyLimit - adLeft}/{config.balance.gems.adDailyLimit}
            </small>
          </button>
        )}
      </div>
      {notice && <p className="hint warn">{notice}</p>}

      <section className="summon-card">
        <div className="summon-banner">
          <img src={mercenaryImage(config, config.mercenaries.find((m) => m.rarity === 'legendary')?.id ?? '')} alt="" />
          <div>
            <strong>용병 영입</strong>
            <span>
              전설 <b>{config.mercenaries.filter((m) => m.rarity === 'legendary').map((m) => m.name).join(' · ')}</b> {pct(config.balance.gacha.rates.legendary)}
            </span>
          </div>
        </div>
        <div className="summon-actions">
          <button className="btn-summon" disabled={gems < single} onClick={() => pull(1)}>
            1회
            <span>
              <IconGem size={16} />
              {single}
            </span>
          </button>
          <button className="btn-summon ten" disabled={gems < ten} onClick={() => pull(10)}>
            10회
            <span>
              <IconGem size={16} />
              {ten}
            </span>
            <small>희귀 이상 1명 보장</small>
          </button>
        </div>
        <button className="rates-toggle" onClick={() => setShowRates((v) => !v)}>
          {showRates ? '확률 닫기' : '확률 보기'}
        </button>
        {showRates && (
          <table className="rates-table">
            <tbody>
              {config.mercenaries.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className={`rarity-tag ${m.rarity}`}>{RARITY_NAME[m.rarity]}</span> {m.name}
                  </td>
                  <td>{pct(mercenaryRate(m, config))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <h3 className="section-title">
        편성 <span className="muted small">— {mercs.party.length}/{slots} · 함께 싸우며 지원 공격과 능력을 줍니다</span>
      </h3>
      <div className="party-slots">
        {Array.from({ length: slots }, (_, i) => {
          const id = mercs.party[i];
          const def = id ? findMercenary(config, id) : undefined;
          return def ? (
            <button key={i} className={`party-slot filled ${def.rarity}`} onClick={() => toggleParty(def.id)}>
              <img src={mercenaryImage(config, def.id)} alt="" />
              <span>{def.name}</span>
              <small>Lv {mercs.owned[def.id]} · 누르면 빼기</small>
            </button>
          ) : (
            <div key={i} className="party-slot empty">
              빈 자리
            </div>
          );
        })}
      </div>

      <h3 className="section-title">
        보유 용병 <span className="muted small">— {Object.keys(mercs.owned).length}/{config.mercenaries.length} · 같은 용병을 또 얻으면 레벨이 오릅니다</span>
      </h3>
      <ul className="merc-grid">
        {config.mercenaries.map((def) => {
          const level = mercs.owned[def.id] ?? 0;
          const owned = level > 0;
          const inParty = mercs.party.includes(def.id);
          const power = mercenaryPower(def, Math.max(1, level), config);
          return (
            <li key={def.id}>
              <button className={`merc-card ${def.rarity} ${owned ? '' : 'locked'} ${inParty ? 'in-party' : ''}`} disabled={!owned} onClick={() => toggleParty(def.id)}>
                <span className={`rarity-tag ${def.rarity}`}>{RARITY_NAME[def.rarity]}</span>
                <img src={mercenaryImage(config, def.id)} alt="" />
                <strong>{def.name}</strong>
                <span className="lv">{owned ? `Lv ${level}` : '미보유'}</span>
                <span className="merc-stat">{passiveText(def, power.passive)}</span>
                <span className="merc-stat muted">
                  지원 공격 {pct(power.power)} · {(def.support.intervalMs / 1000).toFixed(1)}초
                </span>
                {inParty && <span className="party-badge">편성 중</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {pulls && <SummonResult pulls={pulls} onClose={() => setPulls(null)} />}
    </Sheet>
  );
}

/** 뽑기 결과 — 카드가 하나씩 뒤집히며 나온다 */
function SummonResult({ pulls, onClose }: { pulls: SummonPull[]; onClose: () => void }) {
  const { config } = useGameContext();
  return (
    <div className="modal-backdrop summon-result" onClick={onClose}>
      <div className="summon-grid" onClick={(e) => e.stopPropagation()}>
        <h2>영입 결과</h2>
        <ul className={pulls.length > 1 ? 'many' : 'one'}>
          {pulls.map((p, i) => {
            const def = findMercenary(config, p.id);
            if (!def) return null;
            return (
              <li key={i} className={`pull ${def.rarity}`} style={{ animationDelay: `${i * 90}ms` }}>
                <img src={mercenaryImage(config, p.id)} alt="" />
                <span className="pull-name">{def.name}</span>
                <span className="pull-tag">{p.isNew ? 'NEW' : p.refund > 0 ? `보석 +${p.refund}` : `Lv ${p.level}`}</span>
              </li>
            );
          })}
        </ul>
        <button className="btn-ok" onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  );
}
