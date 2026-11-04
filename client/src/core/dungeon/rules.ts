import { lastStageId } from '../lookup';
import type { GameConfig } from '../model/config';
import { SKILL_IDS, SYNERGY_IDS, type MercLinkDef, type SkillDefs, type SkillId, type SynergyId } from '../model/dungeon';
import type { FormId, StageId } from '../model/ids';

export type SkillLevels = Partial<Record<SkillId, number>>;

/** 단계 L 의 몬스터 세기 기준 스테이지 */
export function dungeonRefStage(level: number, cfg: GameConfig): StageId {
  const l = cfg.dungeon.levels;
  return Math.min(lastStageId(cfg), l.refStageBase + l.refStageStep * (level - 1));
}

export function maxSkillLevel(id: SkillId, cfg: GameConfig): number {
  return cfg.dungeon.skills[id].levels.length;
}

/** 지금 단계의 스킬 수치. 없으면 null */
export function skillSpec<K extends SkillId>(skills: SkillLevels, id: K, cfg: GameConfig): SkillDefs[K]['levels'][number] | null {
  const level = skills[id] ?? 0;
  return level > 0 ? (cfg.dungeon.skills[id].levels[level - 1] ?? null) : null;
}

/** 두 스킬을 모두 가져 켜진 시너지 */
export function activeSynergies(skills: SkillLevels, cfg: GameConfig): SynergyId[] {
  return SYNERGY_IDS.filter((id) => cfg.dungeon.synergies[id].skills.every((s) => (skills[s] ?? 0) > 0));
}

/** 이 스킬을 더 얻으면 새로 켜지는 시너지 (선택 카드 안내용) */
export function synergiesUnlockedBy(skill: SkillId, skills: SkillLevels, cfg: GameConfig): SynergyId[] {
  if ((skills[skill] ?? 0) > 0) return [];
  const before = new Set(activeSynergies(skills, cfg));
  return activeSynergies({ ...skills, [skill]: 1 }, cfg).filter((id) => !before.has(id));
}

/** 더 올릴 수 있는 스킬 */
export function upgradableSkills(skills: SkillLevels, cfg: GameConfig): SkillId[] {
  return SKILL_IDS.filter((id) => (skills[id] ?? 0) < maxSkillLevel(id, cfg));
}

/** 용병 연계가 켜졌는가 — 외형이 맞고, 형태 · 스킬 요건 중 하나를 갖췄으면 */
export function linkActive(link: MercLinkDef, preset: string, form: FormId | null, skills: SkillLevels): boolean {
  return link.preset === preset && link.requires.some((r) => (r.form !== undefined && r.form === form) || (r.skill !== undefined && (skills[r.skill] ?? 0) > 0));
}
