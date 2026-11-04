import { synergiesUnlockedBy } from '../core/dungeon/rules';
import { SKILL_ICON, SKILL_ROLE, skillLevelText } from './dungeonText';
import { useGame, useGameContext } from './GameContext';

/**
 * 스킬 선택 — 전투가 멈춘 채 셋 중 하나를 고른다. 같은 스킬은 단계가 오르고, 짝이 맞으면 시너지.
 * 정답을 골라 주지 않는다 — 카드마다 쓰임(역할)과 다음 웨이브가 어떤지만 보여 준다
 */
export function SkillPickModal() {
  const { session, config, sfx } = useGameContext();
  const hud = useGame((s) => s.dungeon);
  const formId = useGame((s) => s.progress.slime.form);
  const found = useGame((s) => s.progress.dungeon.synergies);
  const firstRun = useGame((s) => s.progress.dungeon.runs === 0);
  if (!hud || hud.phase !== 'choosing' || !hud.offer) return null;
  const d = config.dungeon;
  const affinity = formId ? d.forms[formId]?.affinity : undefined;
  const next = hud.wave + 1;
  const boss = d.waves.bosses[String(next)];
  const count = d.waves.monsters[next - 1] ?? 0;
  return (
    <div className="modal-backdrop skill-pick">
      <div className="skill-pick-panel" role="dialog" aria-label="스킬 선택">
        <h2>{hud.wave === 0 ? '첫 스킬을 고르세요' : '스킬을 고르세요'}</h2>
        {firstRun && hud.wave === 0 && <p className="pick-explain">스킬은 이번 던전에서만 써요. 같은 스킬을 또 고르면 강해지고, ◆ 짝이 맞는 두 스킬을 모으면 시너지가 켜져요.</p>}
        <p className={`next-wave ${boss ? 'boss' : ''}`}>
          다음 웨이브 {next}
          {boss ? ` — 보스 「${d.bosses[boss]!.name}」` : ` — 몬스터 ${count}마리`}
          <small>{boss ? '한 적에게 강한 스킬 · 버티는 스킬이 힘이 돼요' : '여러 적을 한꺼번에 치는 스킬이 빛나요'}</small>
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
                  <span className="skill-role">{SKILL_ROLE[id]}</span>
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
