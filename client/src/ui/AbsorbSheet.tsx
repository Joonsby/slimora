import { absorptionForLevel, getSlimeLevel, totalAbsorption, traitTier } from '../core/progression/absorption';
import { anyFormAvailable, findForm } from '../core/progression/forms';
import { openSheet } from '../store/gameStore';
import { describeEffects } from './effectText';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { useSlimeLook } from './Hud';
import { IconAbsorb, IconEvolve } from './icons';
import { familyImage, slimeImage } from './portraits';
import { Sheet } from './Sheet';

export function AbsorbSheet() {
  const { store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'absorb');
  const absorption = useGame((s) => s.progress.slime.absorption);
  const form = useGame((s) => s.progress.slime.form);
  const canEvolve = useGame((s) => anyFormAvailable(s.progress, config));
  const look = useSlimeLook();

  const level = getSlimeLevel(absorption, config);
  const total = totalAbsorption(absorption);
  const from = absorptionForLevel(level, config);
  const nextLevelAt = absorptionForLevel(level + 1, config);
  const levelProgress = nextLevelAt > from ? (total - from) / (nextLevelAt - from) : 1;
  const bonus = Math.round((level - 1) * config.balance.level.statBonusPerLevel * 100);

  return (
    <Sheet open={open} title="흡수" icon={<IconAbsorb size={24} />} onClose={() => openSheet(store, 'none')}>
      <div className="hero-card">
        <img className="hero-portrait" src={slimeImage(look.color, look.preset)} alt="" />
        <div className="hero-body">
          <span className="hero-level">
            Lv <b>{level}</b>
          </span>
          <span className="muted">기본 HP · 공격력 +{bonus}%</span>
          <span className="bar xp">
            <span style={{ width: `${Math.min(100, levelProgress * 100)}%` }} />
          </span>
          <span className="muted small">다음 레벨까지 흡수 {formatNumber(Math.max(0, nextLevelAt - total))}</span>
        </div>
      </div>
      <p className="hint">몬스터를 쓰러뜨리면 그 계열을 흡수합니다. 흡수량이 쌓이면 특성이 생기고, 모든 계열의 흡수 합계로 레벨이 오릅니다.</p>
      <ul className="card-list">
        {config.traits.map((trait) => {
          const family = config.families.find((f) => f.id === trait.family);
          const amount = absorption[trait.family] ?? 0;
          const tier = traitTier(trait, amount);
          const current = tier > 0 ? trait.tiers[tier - 1]! : null;
          const next = trait.tiers[tier] ?? null;
          const start = current?.minAbsorb ?? 0;
          const progress = next ? (amount - start) / (next.minAbsorb - start) : 1;
          return (
            <li key={trait.family} className="card absorb-card" style={{ ['--family' as string]: family?.color }}>
              <span className="card-icon family-icon">
                <img src={familyImage(config, trait.family)} alt="" />
              </span>
              <div className="card-body">
                <span className="card-title">
                  {family?.name ?? trait.family}
                  <span className="pips" aria-label={`특성 ${tier}단계`}>
                    {trait.tiers.map((_, i) => (
                      <i key={i} className={i < tier ? 'on' : ''} />
                    ))}
                  </span>
                  <span className="amount">{formatNumber(amount)}</span>
                </span>
                <span className="bar family" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
                </span>
                <span className="small">{current ? describeEffects(current.effects) : '특성 없음'}</span>
                <span className="muted small">{next ? `다음 ${formatNumber(next.minAbsorb)} · ${describeEffects(next.effects)}` : '최고 단계'}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className={`evolve-cta ${canEvolve ? 'ready' : ''}`}>
        <IconEvolve size={26} />
        <span>
          {form
            ? `현재 형태 · ${findForm(config, form)?.name ?? form}`
            : canEvolve
              ? '진화할 수 있는 형태가 있습니다!'
              : '진화 요건 · 한 계열 흡수 200 + 3 스테이지 클리어'}
        </span>
        <button onClick={() => openSheet(store, 'evolve')}>진화 보기</button>
      </div>
    </Sheet>
  );
}
