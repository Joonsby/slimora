import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../data';
import { arena, ofType, run, stats } from '../../testing/fixtures';
import type { MonsterDef } from '../model/config';
import { deriveSlimeStats } from '../stats';
import { createBattle, isBossFight, isFinished, stepBattle } from './engine';

/** 처치 목표 2 → 보스 1 인 시험장. 보스는 HP · 공격력 배율 1 */
function bossArena(boss: Partial<MonsterDef>, timeLimitMs = 30_000) {
  const cfg = arena({ killsToClear: 2, hp: 10, atk: 1 });
  cfg.monsters.push({ ...cfg.monsters[0]!, id: 'boss', name: '보스', ...boss });
  cfg.stages[0]!.boss = { monster: 'boss', timeLimitMs };
  return cfg;
}

describe('보스 등장 · 제한시간', () => {
  it('처치 목표를 채우면 다음 등장이 보스, 보스를 잡아야 클리어', () => {
    const cfg = bossArena({ hpMul: 3 });
    const b = createBattle({ stageId: 1, mode: 'challenge', slime: stats({ attack: 10, maxHp: 1000 }), seed: 1 }, cfg);
    const events = run(b, cfg, 20_000);
    const spawned = ofType(events, 'monsterSpawned');
    expect(spawned.map((s) => s.boss)).toEqual([false, false, true]);
    expect(ofType(events, 'stageCleared')).toHaveLength(1);
    expect(ofType(events, 'stageCleared')[0]!.at).toBeGreaterThan(spawned[2]!.at);
  });

  it('제한시간이 지나면 시간 초과로 실패한다. 같은 시각이면 공격이 먼저', () => {
    const cfg = bossArena({ hpMul: 1000 }, 5_000);
    const b = createBattle({ stageId: 1, mode: 'challenge', slime: stats({ attack: 10, maxHp: 100_000 }), seed: 1 }, cfg);
    const events = run(b, cfg, 30_000);
    const boss = ofType(events, 'monsterSpawned').find((s) => s.boss)!;
    const failed = ofType(events, 'challengeFailed');
    expect(failed).toEqual([{ type: 'challengeFailed', at: boss.at + 5_000, stageId: 1, reason: 'timeout' }]);
    const lastHit = ofType(events, 'damage').filter((d) => d.to === 'monster').at(-1)!;
    expect(lastHit.at).toBe(boss.at + 5_000);
    expect(b.phase).toBe('failed');
  });

  it('보스전 동안만 isBossFight. 사냥 모드에서는 보스가 나오지 않는다', () => {
    const cfg = bossArena({ hpMul: 3 });
    const b = createBattle({ stageId: 1, mode: 'challenge', slime: stats({ attack: 10, maxHp: 1000 }), seed: 1 }, cfg);
    expect(isBossFight(b)).toBe(false);
    let sawBoss = false;
    while (!isFinished(b)) {
      stepBattle(b, 100, cfg);
      if (b.monster?.isBoss) sawBoss ||= isBossFight(b);
    }
    expect(sawBoss).toBe(true);
    expect(isBossFight(b)).toBe(false);

    const farm = createBattle({ stageId: 1, mode: 'farm', slime: stats({ attack: 10, maxHp: 1000 }), seed: 1 }, cfg);
    expect(ofType(run(farm, cfg, 30_000), 'monsterSpawned').some((s) => s.boss)).toBe(false);
  });
});

describe('보스 효과', () => {
  it('강타 — 4번째 공격마다 ×2.5, 3번째 공격 때 예고', () => {
    const cfg = arena({ hp: 100_000, atk: 10, monster: { effects: [{ kind: 'heavyAttack', every: 4, multiplier: 2.5 }] } });
    const b = createBattle({ stageId: 1, mode: 'farm', slime: stats({ attack: 1, maxHp: 100_000 }), seed: 1 }, cfg);
    const events = run(b, cfg, 9_000);
    const hits = ofType(events, 'damage').filter((d) => d.to === 'slime');
    expect(hits.slice(0, 8).map((h) => h.amount)).toEqual([10, 10, 10, 25, 10, 10, 10, 25]);
    expect(hits[3]!.heavy).toBe(true);
    const warnings = ofType(events, 'heavyWarning').map((w) => w.at);
    expect(warnings.slice(0, 2)).toEqual([hits[2]!.at, hits[6]!.at]);
  });

  it('격노 — HP 50% 아래로 처음 떨어질 때 한 번만 공격 간격 ×0.7', () => {
    const cfg = arena({ hp: 100, atk: 1, monster: { attackIntervalMs: 1000, effects: [{ kind: 'enrage', hpBelowRatio: 0.5, attackIntervalMul: 0.7 }] } });
    const b = createBattle({ stageId: 1, mode: 'farm', slime: stats({ attack: 20, maxHp: 100_000 }), seed: 1 }, cfg);
    const events = run(b, cfg, 4_700);
    expect(ofType(events, 'enraged')).toHaveLength(1);
    expect(b.monster?.stats.attackIntervalMs).toBe(700);
  });
});

/** 밸런스 불변식 — 장 보스는 강화 돌파(25 레벨마다)가 관문이다. 돌파하면 어느 형태든 깬다 */
describe('보스 밸런스', () => {
  const clears = (stageId: number, level: number, absorb: number, form: string | null) =>
    [1, 2, 3].every((seed) => {
      const slime = deriveSlimeStats(
        { upgrades: { attack: level, maxHp: level, critChance: Math.min(50, Math.floor(level / 2)) }, absorption: { bat: absorb, golem: absorb, fire: absorb }, form },
        gameConfig,
      );
      const b = createBattle({ stageId, mode: 'challenge', slime, seed }, gameConfig);
      while (!isFinished(b) && b.now < 900_000) stepBattle(b, 1000, gameConfig);
      return b.phase === 'cleared';
    });

  it('거대 골렘(10) — 첫 돌파(25 레벨) 전에는 못 깨고, 돌파하면 기본 슬라임 · 세 형태 모두 깬다', () => {
    expect(clears(10, 24, 300, null)).toBe(false);
    for (const form of [null, 'vampire', 'iron', 'flame']) expect(clears(10, 25, 300, form)).toBe(true);
  });

  it('고대 화염룡(20) — 두 번째 돌파(50 레벨)면 세 형태 모두 깬다', () => {
    expect(clears(20, 49, 1500, 'iron')).toBe(false);
    for (const form of ['vampire', 'iron', 'flame']) expect(clears(20, 50, 1500, form)).toBe(true);
  });
});
