import type { GameConfig } from '../model/config';
import type { DungeonRecord, DungeonSummary, HurtSource, SkillId } from '../model/dungeon';

/** 다음 도전에서 해 볼 것 — 화면 문구는 ui/dungeonText */
export type AdviceId = 'ultUnused' | 'blockSmash' | 'weakenBreath' | 'saveForBoss' | 'breakGuard' | 'aoe' | 'bossSkills' | 'synergy' | 'grow';

export interface DungeonAdvice {
  /** 쓰러진 곳과 원인. 깼거나 포기했으면 null */
  cause: { wave: number; boss: string | null; by: HurtSource | null } | null;
  /** 중요한 것부터 최대 3개 */
  tips: AdviceId[];
}

const AOE: readonly SkillId[] = ['fireburst', 'chain', 'split'];
const SINGLE: readonly SkillId[] = ['poison', 'frenzy'];

/**
 * 진 판을 돌아본다 — 큰 공격을 몇 번 끊지 못했는지, 필살기가 찬 채로 맞았는지, 어디서 쓰러졌는지, 스킬 구성은 어땠는지.
 * power = 그 단계의 세기 (1 이면 적정)
 */
export function dungeonAdvice(s: DungeonSummary, r: DungeonRecord, skills: Partial<Record<SkillId, number>>, synergies: number, power: number, abandoned: boolean, cfg: GameConfig): DungeonAdvice {
  if (s.cleared || abandoned) return { cause: null, tips: [] };
  const wave = Math.min(s.waves + 1, cfg.dungeon.waves.monsters.length);
  const boss = cfg.dungeon.waves.bosses[String(wave)] ?? null;
  const has = (ids: readonly SkillId[]) => ids.some((id) => (skills[id] ?? 0) > 0);
  const landed = (k: 'smash' | 'breath') => (r.casts[k] ?? 0) - (r.countered[k] ?? 0) > 0 && (r.taken[k] ?? 0) > 0;
  const tips: AdviceId[] = [];
  if (r.missed > 0) tips.push('ultUnused');
  if (landed('smash')) tips.push('blockSmash');
  if (landed('breath')) tips.push('weakenBreath');
  // 큰 공격을 맞았는데 그때 필살기가 차 있지 않았다 — 보스 전에 아껴 둘 것
  if (boss && r.missed === 0 && (landed('smash') || landed('breath'))) tips.push('saveForBoss');
  if (boss && (r.casts.guard ?? 0) > (r.countered.guard ?? 0)) tips.push('breakGuard');
  if (!boss && !has(AOE)) tips.push('aoe');
  if (boss && !has(SINGLE)) tips.push('bossSkills');
  if (synergies === 0) tips.push('synergy');
  if (power < 0.95) tips.unshift('grow');
  return { cause: { wave, boss, by: r.killedBy }, tips: [...new Set(tips)].slice(0, 3) };
}
