import { synergiesUnlockedBy } from '../core/dungeon/rules';
import { SKILL_ICON, skillLevelText } from './dungeonText';
import { useGame, useGameContext } from './GameContext';

/** 스킬 선택 — 전투가 멈춘 채 셋 중 하나를 고른다. 같은 스킬은 단계가 오르고, 짝이 맞으면 시너지 */
export function SkillPickModal() {
  const { session, config, sfx } = useGameContext();
  const hud = useGame((s) => s.dungeon);
  const formId = useGame((s) => s.progress.slime.form);
  const found = useGame((s) => s.progress.dungeon.synergies);
  if (!hud || hud.phase !== 'choosing' || !hud.offer) return null;
  const d = config.dungeon;
  const affinity = formId ? d.forms[formId]?.affinity : undefined;
  const next = hud.wave + 1;
  const boss = d.waves.bosses[String(next)];
  return (
    <div className="modal-backdrop skill-pick">
      <div className="skill-pick-panel" role="dialog" aria-label="스킬 선택">
        <h2>{hud.wave === 0 ? '첫 스킬을 고르세요' : '스킬을 고르세요'}</h2>
        <p className={`next-wave ${boss ? 'boss' : ''}`}>
          다음 웨이브 {next}
          {boss ? ` — 보스 「${d.bosses[boss]!.name}」` : ''}
        </p>
        <ul className="skill-cards">
          {hud.offer.map((id, i) => {
            const def = d.skills[id];
            const level = (hud.skills[id] ?? 0) + 1;
            const Icon = SKILL_ICON[id];
            const synergies = synergiesUnlockedBy(id, hud.skills, config);
            return (
              <li key={id} style={{ animationDelay: `${i * 70}ms` }}>
                <button
                  className={`skill-card ${level > 1 ? 'upgrade' : 'new'}`}
                  style={{ ['--skill' as string]: def.color }}
                  onClick={() => {
                    if (session.chooseSkill(id)) sfx.play(synergies.length > 0 ? 'synergy' : 'skill');
                  }}
                >
                  <span className="skill-card-icon">
                    <Icon size={40} />
                  </span>
                  <span className="skill-card-tag">{level === 1 ? 'NEW' : `Lv ${level - 1} → ${level}`}</span>
                  <strong>{def.name}</strong>
                  <small>{skillLevelText(id, level, config)}</small>
                  {synergies.map((s) => (
                    <span key={s} className="syn-hint">
                      ◆ {found.includes(s) ? `시너지 「${d.synergies[s].name}」` : '새 시너지 발견!'}
                    </span>
                  ))}
                  {id === affinity && <span className="aff-hint">형태와 어울림</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          className="btn-reroll"
          disabled={hud.rerolls <= 0}
          onClick={() => {
            if (session.rerollSkills()) sfx.play('tap');
          }}
        >
          다시 뽑기 <b>{hud.rerolls}</b>
        </button>
      </div>
    </div>
  );
}
