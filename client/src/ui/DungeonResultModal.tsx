import { SKILL_IDS, SYNERGY_IDS, type DamageSource } from '../core/model/dungeon';
import { ADVICE_TEXT, HURT_NAME, SKILL_ICON, SOURCE_COLOR, SOURCE_NAME } from './dungeonText';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { IconCoin, IconCrystal, IconGem } from './icons';
import { familyImage } from './portraits';

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** 던전이 끝나면 — 기록 · 피해 출처 · 보상. 다시 도전을 크게 */
export function DungeonResultModal() {
  const { session, config, sfx } = useGameContext();
  const result = useGame((s) => s.dungeonResult);
  const found = useGame((s) => s.progress.dungeon.synergies.length);
  if (!result) return null;
  const { summary, gains, record, advice } = result;
  const d = config.dungeon;
  const waves = d.waves.monsters.length;
  const damage = (Object.entries(record.damage) as [DamageSource, number][]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const top = damage[0]?.[1] ?? 1;
  const title = summary.cleared ? '던전 클리어!' : result.abandoned ? '던전 포기' : '쓰러졌다…';
  const gems = gains.firstClearGems + gains.synergyGems;
  const owned = SKILL_IDS.filter((id) => (result.skills[id] ?? 0) > 0);

  return (
    <div className="modal-backdrop">
      <div className={`modal dungeon-result ${summary.cleared ? 'win' : 'lose'}`} role="dialog" aria-label="던전 결과">
        <h2>{title}</h2>
        <p className="muted">
          {summary.level}단계 · 웨이브 <b>{summary.waves}</b>/{waves}
          {gains.newBest && <span className="tag best">최고 기록!</span>}
        </p>
        <div className="result-stats">
          <span>처치 {result.kills}</span>
          <span>{mmss(result.durationMs)}</span>
          <span>필살기 {record.ultimates}회</span>
          {record.blocked > 0 && <span>차단 {record.blocked}회</span>}
        </div>
        {advice.cause && (
          <section className="defeat" aria-label="쓰러진 이유">
            <p className="defeat-cause">
              웨이브 <b>{advice.cause.wave}</b>
              {advice.cause.boss ? ` 「${d.bosses[advice.cause.boss]?.name ?? ''}」` : ''}에서 <b>{advice.cause.by ? HURT_NAME[advice.cause.by] : '공격'}</b>에 쓰러졌어요
            </p>
            {advice.tips.length > 0 && (
              <ul className="defeat-tips">
                {advice.tips.map((id) => (
                  <li key={id}>{ADVICE_TEXT[id]}</li>
                ))}
              </ul>
            )}
        {owned.length > 0 && (
          <div className="result-skills">
            {owned.map((id) => {
              const Icon = SKILL_ICON[id];
              return (
                <span key={id} className="skill-slot" style={{ ['--skill' as string]: d.skills[id].color }}>
                  <Icon size={22} />
                  <b className="skill-lv">{result.skills[id]}</b>
                </span>
              );
            })}
          </div>
        )}
        {damage.length > 0 && (
          <ul className="damage-bars" aria-label="피해 출처">
            {damage.map(([source, amount]) => (
              <li key={source}>
                <span className="damage-name">{SOURCE_NAME[source]}</span>
                <span className="damage-bar">
                  <span style={{ width: `${(amount / top) * 100}%`, background: SOURCE_COLOR[source] }} />
                </span>
                <b>{formatNumber(amount)}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="reward-list">
          <span className="reward gold">
            <IconCoin size={22} />+{formatNumber(summary.rewards.gold)}
          </span>
          <span className="reward crystal">
            <IconCrystal size={20} />+{gains.crystals}
          </span>
          {gems > 0 && (
            <span className="reward gem">
              <IconGem size={20} />+{gems}
            </span>
          )}
          {Object.entries(gains.absorb).map(([family, amount]) => {
            const fam = config.families.find((f) => f.id === family);
            return (
              <span key={family} className="reward absorb" style={{ ['--family' as string]: fam?.color }}>
                <img src={familyImage(config, family)} alt="" />
                {fam?.name} +{formatNumber(amount ?? 0)}
              </span>
            );
          })}
        </div>
        {!result.claimed && <p className="hint warn">이 판의 보상은 이미 받았어요 (다른 기기나 이전 실행에서).</p>}
        {gains.newSynergies.length > 0 && <p className="bonus-done">새 시너지 발견 — {gains.newSynergies.map((id) => d.synergies[id as keyof typeof d.synergies]?.name).join(' · ')}</p>}
          </section>
        )}
        {!summary.cleared && advice.tips.length === 0 && found < SYNERGY_IDS.length && <p className="hint">아직 발견하지 못한 시너지가 {SYNERGY_IDS.length - found}개 있어요. 다른 조합으로 다시 도전해 보세요!</p>}
        <div className="modal-actions">
          <button
            className="btn-ad"
            onClick={() => {
              sfx.play('tap');
              session.closeDungeon(true);
            }}
          >
            다시 도전
          </button>
          <button className="btn-ok" onClick={() => session.closeDungeon()}>
            나가기
          </button>
        </div>
      </div>
    </div>
  );
}
