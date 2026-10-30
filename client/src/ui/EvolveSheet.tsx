import { useEffect, useRef, useState } from 'react';
import type { SlimePreset } from '../art/slime';
import type { CombatStats } from '../core/model/battle';
import type { FormDef } from '../core/model/config';
import { evolveCost, findForm, formStatus, masteryLevel, type FormStatus } from '../core/progression/forms';
import { legacyBonus } from '../core/progression/prestige';
import { deriveSlimeStats } from '../core/stats';
import { openSheet } from '../store/gameStore';
import { describeEffects } from './effectText';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { useSlimeLook } from './Hud';
import { IconArrow, IconCoin, IconEvolve, IconLock } from './icons';
import { slimeImage } from './portraits';
import { Sheet } from './Sheet';

const STATUS_TEXT: Record<FormStatus, string> = { locked: '잠김', available: '진화 가능', unlocked: '해금됨', current: '현재 형태' };

export function EvolveSheet() {
  const { session, store, config } = useGameContext();
  const open = useGame((s) => s.sheet === 'evolve');
  const slime = useGame((s) => s.progress.slime);
  const gold = useGame((s) => s.progress.gold);
  const highest = useGame((s) => s.progress.stage.highestCleared);
  const boss = useGame((s) => s.hud.boss);
  const look = useSlimeLook();
  const prestige = useGame((s) => s.progress.prestige);
  const [selected, setSelected] = useState<string | null>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  // 고른 형태의 비교표 · 확정 버튼이 시트 아래로 밀려 있으면 보이게 내린다.
  // 최신 Chrome 의 scrollIntoView 는 Promise 를 돌려주므로 그대로 반환하면 React 가 정리 함수로 부른다
  useEffect(() => {
    compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  const close = () => {
    setSelected(null);
    openSheet(store, 'none');
  };
  const pick = selected ? findForm(config, selected) : undefined;
  const pickStatus = pick ? formStatus(pick, slime, highest) : null;
  const cost = pick ? evolveCost(pick, slime, highest, config) : 0;

  return (
    <Sheet open={open} title="진화" icon={<IconEvolve size={24} />} onClose={close}>
      <p className="hint">한 계열을 200 흡수하고 3 스테이지를 클리어하면 그 계열의 형태로 진화합니다. 해금한 형태로 돌아갈 때는 골드가 듭니다.</p>
      <ul className="card-list">
        {config.forms.map((form) => (
          <FormCard key={form.id} form={form} status={formStatus(form, slime, highest)} selected={form.id === selected} onSelect={() => setSelected(form.id)} />
        ))}
      </ul>
      {pick && pickStatus !== 'current' && pickStatus !== 'locked' && (
        <div className="compare" ref={compareRef}>
          <div className="compare-heads">
            <figure>
              <img src={slimeImage(look.color, look.preset)} alt="" />
              <figcaption>{slime.form ? findForm(config, slime.form)?.name : '기본 슬라임'}</figcaption>
            </figure>
            <IconArrow size={22} />
            <figure>
              <img src={slimeImage(pick.visual.tint, pick.visual.preset as SlimePreset)} alt="" />
              <figcaption>{pick.name}</figcaption>
            </figure>
          </div>
          <CompareTable before={deriveSlimeStats(slime, config, legacyBonus(prestige, config))} after={deriveSlimeStats({ ...slime, form: pick.id }, config, legacyBonus(prestige, config))} />
          {boss && <p className="hint warn">보스전 중에는 진화할 수 없습니다.</p>}
          <button
            className="evolve-confirm"
            disabled={boss || gold < cost}
            onClick={() => {
              if (session.evolve(pick.id).ok) close();
            }}
          >
            <IconEvolve size={20} />
            진화 확정
            <span className="cost">
              {cost > 0 ? (
                <>
                  <IconCoin size={16} />
                  {formatNumber(cost)}
                </>
              ) : (
                '무료'
              )}
            </span>
          </button>
        </div>
      )}
    </Sheet>
  );
}

function FormCard({ form, status, selected, onSelect }: { form: FormDef; status: FormStatus; selected: boolean; onSelect: () => void }) {
  const { config } = useGameContext();
  const absorbed = useGame((s) => s.progress.slime.absorption[form.family] ?? 0);
  const highest = useGame((s) => s.progress.stage.highestCleared);
  const family = config.families.find((f) => f.id === form.family);
  const level = masteryLevel(form, { [form.family]: absorbed });
  const mastery = level > 0 ? form.mastery[level - 1]! : form.mastery[0]!;
  const next = form.mastery[level] ?? null;
  const selectable = status === 'available' || status === 'unlocked';

  return (
    <li>
      <button className={`card form-card status-${status} ${selected ? 'selected' : ''}`} disabled={!selectable} onClick={onSelect}>
        <span className="form-portrait">
          <img src={slimeImage(form.visual.tint, form.visual.preset as SlimePreset)} alt="" />
          {status === 'locked' && (
            <span className="lock">
              <IconLock size={18} />
            </span>
          )}
        </span>
        <span className="card-body">
          <span className="card-title">
            {form.name}
            <span className={`status-pill ${status}`}>{STATUS_TEXT[status]}</span>
          </span>
          {status === 'locked' ? (
            <>
              <span className="req">
                <span>
                  <span style={{ color: family?.color }}>{family?.name}</span> 흡수 {formatNumber(absorbed)} / {formatNumber(form.requires.absorb)}
                </span>
                <span className="bar mini">
                  <span style={{ width: `${Math.min(100, (absorbed / form.requires.absorb) * 100)}%`, background: family?.color }} />
                </span>
              </span>
              <span className={`req ${highest >= form.requires.stageCleared ? 'done' : ''}`}>
                {form.requires.stageCleared} 스테이지 클리어 {highest >= form.requires.stageCleared ? '✓' : ''}
              </span>
              <span className="muted small">{describeEffects(form.mastery[0]!.effects)}</span>
            </>
          ) : (
            <>
              <span className="small">
                숙련 Lv {level} · {describeEffects(mastery.effects)}
              </span>
              {next && <span className="muted small">다음 숙련 · 흡수 {formatNumber(next.minAbsorb)}</span>}
            </>
          )}
        </span>
      </button>
    </li>
  );
}

function CompareTable({ before, after }: { before: CombatStats; after: CombatStats }) {
  const rows: [string, (s: CombatStats) => string][] = [
    ['공격력', (s) => formatNumber(s.attack)],
    ['최대 HP', (s) => formatNumber(s.maxHp)],
    ['흡혈', (s) => pct(s.lifesteal)],
    ['받는 피해 감소', (s) => pct(s.damageReduction)],
    ['화상', (s) => (s.burn ? `${pct(s.burn.chance)} · ${pct(s.burn.dpsRatio)}/초 ×${s.burn.maxStacks}` : '없음')],
  ];
  return (
    <table className="compare-table">
      <tbody>
        {rows.map(([label, show]) => {
          const a = show(before);
          const b = show(after);
          return (
            <tr key={label}>
              <th>{label}</th>
              <td>{a}</td>
              <td className={a === b ? 'same' : 'changed'}>{b}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const pct = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;
