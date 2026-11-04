import { useState } from 'react';
import { dungeonRefStage } from '../core/dungeon/rules';
import { SKILL_IDS, SYNERGY_IDS } from '../core/model/dungeon';
import { dungeonOpen, highestUnlockedLevel, recommendedLevel, researchCost } from '../core/progression/dungeon';
import { findForm } from '../core/progression/forms';
import { findMercenary } from '../core/progression/mercenary';
import { openSheet } from '../store/gameStore';
import { SKILL_ICON, linkEffectText } from './dungeonText';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { IconCrystal, IconGem, IconLock, IconPortal } from './icons';
import { mercenaryImage, slimeImage } from './portraits';
import { Sheet } from './Sheet';

const RESEARCH_TEXT = {
  hp: (v: number) => `던전 최대 HP +${Math.round(v * 100)}%`,
  charge: (v: number) => `필살기 충전 +${Math.round(v * 100)}%`,
  reroll: (v: number) => `스킬 다시 뽑기 +${v}회`,
  choice: (v: number) => `스킬 선택지 +${v}개`,
} as const;

export function DungeonSheet() {
  const { store } = useGameContext();
  const open = useGame((s) => s.sheet === 'dungeon');
  return (
    <Sheet open={open} title="도전 던전" icon={<IconPortal size={26} />} onClose={() => openSheet(store, 'none')}>
      <DungeonLobby />
    </Sheet>
  );
}

/** 시트를 열 때마다 새로 그린다 — 단계는 추천 단계부터 */
function DungeonLobby() {
  const { session, config, sfx } = useGameContext();
  const progress = useGame((s) => s.progress);
  const [level, setLevel] = useState(() => recommendedLevel(progress, config));
  const d = config.dungeon;

  if (!dungeonOpen(progress, config)) {
    return (
      <section className="dungeon-hero locked">
        <IconLock size={28} />
        <strong>스테이지 {d.unlockStage}를 깨면 열려요</strong>
        <p>10 웨이브를 돌파하는 로그라이크 던전. 2 웨이브마다 스킬을 골라 조합하고, 보스의 공격은 필살기로 끊습니다.</p>
      </section>
    );
  }

  const top = highestUnlockedLevel(progress, config);
  const recommended = recommendedLevel(progress, config);
  const waves = d.waves.monsters.length;
  const best = progress.dungeon.best[level] ?? 0;
  const firstClear = level > progress.dungeon.cleared;
  const gems = d.rewards.firstClearGems.base + d.rewards.firstClearGems.perLevel * (level - 1);

  return (
    <>
      <section className="dungeon-hero">
        <p>
          <b>10 웨이브</b>를 돌파하세요. 시작과 2 웨이브마다 스킬을 하나 골라 조합하고, <b>5 · 10 웨이브 보스</b>의 큰 공격은 필살기로 끊습니다. 스킬은 던전이 끝나면 사라져요.
        </p>
        <span className="crystal-balance" aria-label={`던전 결정 ${progress.dungeon.crystals}`}>
          <IconCrystal size={20} />
          {formatNumber(progress.dungeon.crystals)}
        </span>
      </section>

      <section className="level-picker">
        <button className="level-step" disabled={level <= 1} onClick={() => setLevel(level - 1)} aria-label="낮은 단계">
          ‹
        </button>
        <div className="level-info">
          <strong>
            {level}단계 {level === recommended && <span className="tag">추천</span>}
          </strong>
          <small>몬스터 세기 · 스테이지 {dungeonRefStage(level, config)} 기준</small>
          <span className="level-record">
            최고 기록 {best}/{waves} 웨이브
          </span>
          {firstClear ? (
            <span className="level-reward">
              첫 클리어 <IconGem size={14} />+{gems}
            </span>
          ) : (
            <span className="level-reward done">클리어함</span>
          )}
        </div>
        <button className="level-step" disabled={level >= top} onClick={() => setLevel(level + 1)} aria-label="높은 단계">
          ›
        </button>
      </section>
      <button
        className="btn-start"
        onClick={() => {
          sfx.play('tap');
          session.startDungeon(level);
        }}
      >
        도전 시작
      </button>

      <FormStyle />
      <Links />
      <Research />
      <Codex />
    </>
  );
}

/** 지금 형태의 던전 전투 방식 */
function FormStyle() {
  const { config } = useGameContext();
  const formId = useGame((s) => s.progress.slime.form);
  const form = formId ? findForm(config, formId) : undefined;
  const style = formId ? config.dungeon.forms[formId] : undefined;
  return (
    <>
      <h3 className="section-title">
        전투 방식 <span className="muted small">— 진화 형태마다 다르게 싸운다</span>
      </h3>
      {form && style ? (
        <div className="style-card">
          <img src={slimeImage(form.visual.tint, form.visual.preset as never)} alt="" />
          <span>
            <strong>
              {form.name} · {style.name}
            </strong>
            <small>{style.desc}</small>
            <small className="muted">어울리는 스킬: {config.dungeon.skills[style.affinity].name} (더 자주 나온다)</small>
          </span>
        </div>
      ) : (
        <ul className="style-list">
          {config.forms.map((f) => {
            const s = config.dungeon.forms[f.id];
            return s ? (
              <li key={f.id}>
                <img src={slimeImage(f.visual.tint, f.visual.preset as never)} alt="" />
                <span>
                  <strong>{f.name}</strong> — {s.name}
                </span>
              </li>
            ) : null;
          })}
          <li className="muted small">진화하면 그 형태의 방식으로 싸웁니다</li>
        </ul>
      )}
    </>
  );
}

/** 편성한 용병과 형태 · 스킬의 연계 */
function Links() {
  const { config } = useGameContext();
  const party = useGame((s) => s.progress.mercenaries.party);
  const formId = useGame((s) => s.progress.slime.form);
  const presets = party.map((id) => findMercenary(config, id)?.look.preset);
  return (
    <>
      <h3 className="section-title">
        용병 연계 <span className="muted small">— 편성한 용병이 형태 · 스킬과 맞으면</span>
      </h3>
      <ul className="link-list">
        {config.dungeon.links.map((l) => {
          const member = party.find((id) => findMercenary(config, id)?.look.preset === l.preset);
          const byForm = l.requires.some((r) => r.form !== undefined && r.form === formId);
          const skills = l.requires.flatMap((r) => (r.skill ? [config.dungeon.skills[r.skill].name] : []));
          const forms = l.requires.flatMap((r) => (r.form ? [findForm(config, r.form)?.name ?? r.form] : []));
          const state = !presets.includes(l.preset) ? 'need' : byForm ? 'on' : 'maybe';
          return (
            <li key={l.id} className={`link-card ${state}`}>
              {member ? <img src={mercenaryImage(config, member)} alt="" /> : <span className="link-empty" />}
              <span>
                <strong>{l.name}</strong>
                <small>
                  {l.desc} — {linkEffectText(l.effect)}
                </small>
                <small className="muted">
                  {state === 'need'
                    ? `${{ bat: '박쥐', golem: '골렘', dragon: '드래곤', slime: '슬라임' }[l.preset] ?? l.preset} 용병을 편성하면`
                    : state === 'on'
                      ? '켜짐'
                      : `${[...forms, ...skills.map((s) => `${s} 스킬`)].join(' 또는 ')}${skills.length > 0 ? '을 얻으면 켜짐' : '이면 켜짐'}`}
                </small>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 결정으로 사는 영구 강화 — 던전에서만 */
function Research() {
  const { session, config, sfx } = useGameContext();
  const dungeon = useGame((s) => s.progress.dungeon);
  return (
    <>
      <h3 className="section-title">
        던전 연구 <span className="muted small">— 결정은 웨이브 · 보스 · 클리어로 모은다</span>
      </h3>
      <ul className="card-list">
        {config.dungeon.research.map((r) => {
          const level = dungeon.research[r.id] ?? 0;
          const maxed = level >= r.maxLevel;
          const cost = researchCost(r, level);
          return (
            <li key={r.id} className="card research-card">
              <span className="card-body">
                <span className="card-title">
                  {r.name} <span className="muted small">Lv {level}/{r.maxLevel}</span>
                </span>
                <small>{RESEARCH_TEXT[r.stat](r.perLevel * Math.max(1, level))}</small>
              </span>
              <button
                className="buy"
                disabled={maxed || dungeon.crystals < cost}
                onClick={() => {
                  if (session.dispatch({ type: 'purchaseResearch', research: r.id }).ok) sfx.play('buy');
                }}
              >
                {maxed ? (
                  '최대'
                ) : (
                  <>
                    <IconCrystal size={15} />
                    {cost}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 스킬 6종과 시너지 — 발견하지 못한 시너지는 이름을 가린다 */
function Codex() {
  const { config } = useGameContext();
  const found = useGame((s) => s.progress.dungeon.synergies);
  const d = config.dungeon;
  return (
    <>
      <h3 className="section-title">
        스킬 · 시너지 도감 <span className="muted small">— 발견 {found.length}/{SYNERGY_IDS.length}</span>
      </h3>
      <ul className="skill-codex">
        {SKILL_IDS.map((id) => {
          const Icon = SKILL_ICON[id];
          return (
            <li key={id} style={{ ['--skill' as string]: d.skills[id].color }}>
              <span className="skill-icon">
                <Icon size={22} />
              </span>
              <span>
                <strong>{d.skills[id].name}</strong>
                <small>{d.skills[id].desc}</small>
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="synergy-codex">
        {SYNERGY_IDS.map((id) => {
          const s = d.synergies[id];
          const known = found.includes(id);
          return (
            <li key={id} className={known ? 'known' : ''}>
              <span className="pair">
                {s.skills.map((k) => {
                  const Icon = SKILL_ICON[k];
                  return (
                    <span key={k} className="skill-icon small" style={{ ['--skill' as string]: d.skills[k].color }}>
                      <Icon size={16} />
                    </span>
                  );
                })}
              </span>
              <span>
                <strong>{known ? s.name : '???'}</strong>
                <small>{known ? s.desc : `${d.skills[s.skills[0]].name} + ${d.skills[s.skills[1]].name}을 함께 얻어 보세요 (처음 발견하면 보석 +${d.rewards.synergyGems})`}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
