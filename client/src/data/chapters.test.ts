import { describe, expect, it } from 'vitest';
import { gameConfig } from '.';
import { expandChapters, type ChapterSource } from './chapters';

describe('장 → 스테이지', () => {
  it('20장 × 10 스테이지, 장마다 마지막 스테이지에만 보스가 있다', () => {
    expect(gameConfig.chapters).toHaveLength(20);
    expect(gameConfig.stages).toHaveLength(200);
    for (const ch of gameConfig.chapters) {
      const stages = gameConfig.stages.filter((s) => s.chapter === ch.id);
      expect(stages.map((s) => Boolean(s.boss))).toEqual([...Array(9).fill(false), true]);
    }
  });

  it('앞 6개는 한 계열씩 번갈아, 그 뒤는 섞여서 나온다. 처치 목표는 3스테이지마다 늘어난다', () => {
    const source: ChapterSource = {
      id: 2,
      name: '시험',
      pool: ['a', 'b', 'c'],
      boss: { monster: 'king', timeLimitMs: 60_000 },
      stages: Array.from({ length: 10 }, (_, i) => ({ name: `s${i}`, scene: 'duskCave' })),
    };
    const { chapters, stages } = expandChapters([{ ...source, id: 1 }, source]);
    expect(chapters).toEqual([
      { id: 1, name: '시험' },
      { id: 2, name: '시험' },
    ]);
    const ch2 = stages.slice(10);
    expect(ch2[0]!.id).toBe(11);
    expect(ch2.slice(0, 6).map((s) => s.spawns.map((sp) => sp.monster).join())).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    expect(ch2[6]!.spawns).toHaveLength(3);
    expect(ch2.map((s) => s.killsToClear)).toEqual([15, 15, 15, 20, 20, 20, 25, 25, 25, 15]);
    expect(stages.slice(0, 3).map((s) => s.killsToClear)).toEqual([10, 10, 10]);
    expect(ch2[9]!.boss).toEqual({ monster: 'king', timeLimitMs: 60_000 });
  });
});
