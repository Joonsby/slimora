import { describe, expect, it } from 'vitest';
import type { DungeonRecord, DungeonSummary } from '../model/dungeon';
import { cloneConfig } from '../../testing/fixtures';
import { dungeonAdvice } from './advice';

const cfg = cloneConfig();
const summary = (s: Partial<DungeonSummary> = {}): DungeonSummary => ({ runId: 'r', level: 1, waves: 4, cleared: false, bossKills: 0, rewards: { gold: 0, kills: {}, absorb: {} }, synergies: [], ...s });
const record = (r: Partial<DungeonRecord> = {}): DungeonRecord => ({ damage: {}, ultimates: 0, blocked: 0, bossKills: 0, taken: {}, casts: {}, countered: {}, missed: 0, killedBy: 'hit', ...r });

describe('패배 원인 · 다음에 해 볼 것', () => {
  it('깼거나 포기했으면 아무 말도 하지 않는다', () => {
    expect(dungeonAdvice(summary({ waves: 10, cleared: true }), record(), {}, 1, 1, false, cfg)).toEqual({ cause: null, tips: [] });
    expect(dungeonAdvice(summary(), record(), {}, 1, 1, true, cfg)).toEqual({ cause: null, tips: [] });
  });

  it('보스의 내려찍기를 필살기가 찬 채로 맞고 쓰러졌다 — 그 이유부터', () => {
    const advice = dungeonAdvice(summary({ waves: 4 }), record({ killedBy: 'smash', casts: { smash: 2 }, taken: { smash: 900 }, missed: 1 }), { poison: 1, split: 1 }, 1, 1.1, false, cfg);
    expect(advice.cause).toEqual({ wave: 5, boss: 'golemChief', by: 'smash' });
    expect(advice.tips.slice(0, 2)).toEqual(['ultUnused', 'blockSmash']);
  });

  it('필살기가 비어 있을 때 큰 공격을 맞았으면 보스 전에 아껴 두라고 한다', () => {
    const advice = dungeonAdvice(summary({ waves: 9 }), record({ killedBy: 'breath', casts: { breath: 2 }, countered: { breath: 1 }, taken: { breath: 500 } }), { poison: 2, frenzy: 1 }, 1, 1.1, false, cfg);
    expect(advice.tips).toEqual(['weakenBreath', 'saveForBoss']);
  });

  it('일반 웨이브에서 여러 적을 칠 스킬 없이 쓰러졌다 · 시너지가 없었다', () => {
    const advice = dungeonAdvice(summary({ waves: 7 }), record({ killedBy: 'hit' }), { shield: 2, poison: 1 }, 0, 1, false, cfg);
    expect(advice.cause).toMatchObject({ wave: 8, boss: null });
    expect(advice.tips).toEqual(['aoe', 'synergy']);
  });

  it('보스에게 강한 스킬이 없었다 · 경화를 깨지 않았다', () => {
    const advice = dungeonAdvice(summary({ waves: 9 }), record({ killedBy: 'hit', casts: { guard: 2 } }), { fireburst: 2, split: 1 }, 1, 1, false, cfg);
    expect(advice.tips).toEqual(['breakGuard', 'bossSkills']);
  });

  it('지금 힘에 벅찬 단계면 그것부터 — 최대 셋', () => {
    const advice = dungeonAdvice(summary({ waves: 4 }), record({ killedBy: 'smash', casts: { smash: 3, guard: 1 }, taken: { smash: 900 }, missed: 2 }), { shield: 1 }, 0, 0.7, false, cfg);
    expect(advice.tips).toEqual(['grow', 'ultUnused', 'blockSmash']);
  });
});
