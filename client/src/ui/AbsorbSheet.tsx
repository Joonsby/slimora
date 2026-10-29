import { absorptionForLevel, getSlimeLevel, totalAbsorption, traitTier } from '../core/progression/absorption';
import { anyFormAvailable, findForm } from '../core/progression/forms';
import { openSheet } from '../store/gameStore';
import { describeEffects } from './effectText';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { Sheet } from './Sheet';

export function AbsorbSheet() {
  const { store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'absorb');
  const absorption = useGame((s) => s.progress.slime.absorption);
  const form = useGame((s) => s.progress.slime.form);
  const canEvolve = useGame((s) => anyFormAvailable(s.progress, config));

  const level = getSlimeLevel(absorption, config);
  const total = totalAbsorption(absorption);
  const nextLevelAt = absorptionForLevel(level + 1, config);
  const bonus = Math.round((level - 1) * config.balance.level.statBonusPerLevel * 100);

  return (
    <Sheet open={open} title="흡수" onClose={() => openSheet(store, 'none')}>
      <div className="level-card">
        <strong>슬라임 Lv {level}</strong>
        <span className="muted">
          기본 HP · 공격력 +{bonus}% · 다음 레벨까지 {formatNumber(nextLevelAt - total)}
        </span>
      </div>
      <p className="hint">몬스터를 쓰러뜨리면 그 계열을 흡수합니다. 흡수량이 쌓이면 특성이 생기고, 모든 계열의 흡수 합계로 레벨이 오릅니다.</p>
      <ul className="absorb-list">
        {config.traits.map((trait) => {
          const family = config.families.find((f) => f.id === trait.family);
          const amount = absorption[trait.family] ?? 0;
          const tier = traitTier(trait, amount);
          const current = tier > 0 ? trait.tiers[tier - 1]! : null;
          const next = trait.tiers[tier] ?? null;
          const from = current?.minAbsorb ?? 0;
          const progress = next ? (amount - from) / (next.minAbsorb - from) : 1;
          return (
            <li key={trait.family} className="absorb-item">
              <div className="absorb-head">
                <span className="family-name" style={{ color: family?.color }}>
                  ● {family?.name ?? trait.family}
                </span>
                <span className="absorb-amount">{formatNumber(amount)}</span>
              </div>
              <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${Math.min(100, progress * 100)}%`, background: family?.color }} />
              </div>
              <div className="absorb-tier">
                <span>{current ? `특성 ${tier}단계 · ${describeEffects(current.effects)}` : '특성 없음'}</span>
                <span className="muted">{next ? `다음 ${formatNumber(next.minAbsorb)} · ${describeEffects(next.effects)}` : '최고 단계'}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="evolve-cta">
        <span>
          {form
            ? `현재 형태 · ${findForm(config, form)?.name ?? form}`
            : canEvolve
              ? '진화할 수 있는 형태가 있습니다'
              : '진화 요건 · 한 계열 흡수 200 + 3 스테이지 클리어'}
        </span>
        <button onClick={() => openSheet(store, 'evolve')}>진화하러 가기</button>
      </div>
    </Sheet>
  );
}
