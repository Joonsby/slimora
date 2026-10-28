import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../data';
import type { BattleEvent } from '../model/battle';
import { arena, ofType, run, stats } from '../../testing/fixtures';
import { nextFloat } from '../rng';
import { deriveSlimeStats } from '../stats';
import { applySlimeStats, continueAsFarm, createBattle, stepBattle } from './engine';

const farm = (cfg = arena(), slime = stats({ maxHp: 1000 })) => createBattle({ stageId: 1, mode: 'farm', slime, seed: 7 }, cfg);
const challenge = (cfg = arena(), slime = stats({ maxHp: 1000 })) => createBattle({ stageId: 1, mode: 'challenge', slime, seed: 7 }, cfg);

describe('등장 · 공격 타이밍', () => {
  it('등장 대기 600ms 후 몬스터가 나오고, 각자 공격 간격 뒤 첫 공격. 같은 시각이면 슬라임이 먼저', () => {
    const cfg = arena({ hp: 100 });
    const b = farm(cfg, stats({ attack: 1, maxHp: 1000 }));
    expect(ofType(stepBattle(b, 599, cfg), 'monsterSpawned')).toHaveLength(0);
    expect(ofType(stepBattle(b, 1, cfg), 'monsterSpawned')[0]).toMatchObject({ at: 600, maxHp: 100 });

    const attacks = ofType(stepBattle(b, 1000, cfg), 'attack');
    expect(attacks.map((a) => [a.at, a.by])).toEqual([
      [1600, 'slime'],
      [1600, 'monster'],
    ]);
  });

  it('HP 100 몬스터를 공격력 25 로 4대 만에 잡고 골드를 준다', () => {
    const cfg = arena({ hp: 100, gold: 5 });
    const b = farm(cfg, stats({ attack: 25, maxHp: 1000 }));
    const killed = ofType(run(b, cfg, 5000), 'monsterKilled');
    expect(killed[0]).toMatchObject({ at: 4600, gold: 5, family: 'bat' });
  });
});

describe('몬스터 효과', () => {
  it('골렘형 피해감소 — 직격 피해가 줄고 깎인 양이 이벤트에 실린다', () => {
    const cfg = arena({ monster: { effects: [{ kind: 'damageReduction', ratio: 0.3 }] } });
    const b = farm(cfg, stats({ attack: 10, maxHp: 1000 }));
    const hit = ofType(run(b, cfg, 1600), 'damage').find((d) => d.to === 'monster');
    expect(hit).toMatchObject({ amount: 7, reducedBy: 3, source: 'hit' });
  });

  it('피해감소는 상한(70%)을 넘지 않는다', () => {
    const cfg = arena({ monster: { effects: [{ kind: 'damageReduction', ratio: 0.95 }] } });
    const b = farm(cfg, stats({ attack: 100, maxHp: 1000 }));
    expect(ofType(run(b, cfg, 1600), 'damage').find((d) => d.to === 'monster')?.amount).toBe(30);
  });

  it('박쥐형 흡혈 — 다친 상태에서 공격하면 준 피해의 20% 를 회복한다', () => {
    const cfg = arena({ atk: 10, monster: { attackIntervalMs: 600, effects: [{ kind: 'lifesteal', ratio: 0.2 }] } });
    const b = farm(cfg, stats({ attack: 20, maxHp: 1000 }));
    const heals = ofType(run(b, cfg, 1800), 'heal').filter((h) => h.to === 'monster');
    // 1200ms 첫 공격은 체력이 가득이라 회복 없음 → 1600ms 슬라임에게 맞음 → 1800ms 공격에서 회복
    expect(heals).toEqual([{ type: 'heal', at: 1800, to: 'monster', amount: 2, source: 'lifesteal' }]);
  });

  it('화염형 화상 — 중첩되고, 피해감소를 무시한다', () => {
    const cfg = arena({
      atk: 10,
      monster: { attackIntervalMs: 400, effects: [{ kind: 'burnOnHit', chance: 1, dpsRatio: 0.5, durationMs: 1000, maxStacks: 2 }] },
    });
    const b = farm(cfg, stats({ attack: 1, maxHp: 10_000, damageReduction: 0.5 }));
    // 공격 1000 · 1400 · 1800ms, 첫 화상 틱 1500ms
    const events = run(b, cfg, 1800);

    expect(ofType(events, 'burnApplied').map((e) => e.stacks)).toEqual([1, 2, 2]);
    const toSlime = ofType(events, 'damage').filter((d) => d.to === 'slime');
    expect(toSlime.find((d) => d.source === 'hit')?.amount).toBe(5);
    // 2중첩 × 초당 5 × 0.5초 = 5. 피해감소가 적용됐다면 2 였을 것
    expect(toSlime.find((d) => d.source === 'burn')).toMatchObject({ at: 1500, amount: 5 });
  });

  it('화상은 지속시간이 끝나면 꺼진다', () => {
    const cfg = arena({ monster: { attackIntervalMs: 5000, effects: [{ kind: 'burnOnHit', chance: 1, dpsRatio: 0.5, durationMs: 1000, maxStacks: 3 }] } });
    const b = farm(cfg, stats({ attack: 1, maxHp: 10_000 }));
    const burns = ofType(run(b, cfg, 10_500), 'damage').filter((d) => d.source === 'burn');
    expect(burns.map((d) => d.at)).toEqual([6100, 6600]);
    expect(b.slime.burn).toBeNull();
  });

  it('몬스터가 쓰러지면 그 몬스터가 붙인 화상도 꺼진다', () => {
    const cfg = arena({ monster: { attackIntervalMs: 500, effects: [{ kind: 'burnOnHit', chance: 1, dpsRatio: 0.5, durationMs: 3000, maxStacks: 3 }] } });
    const b = farm(cfg, stats({ attack: 100, maxHp: 10_000 }));
    const events = run(b, cfg, 2100);
    const killedAt = ofType(events, 'monsterKilled')[0]!.at;
    expect(killedAt).toBe(1600);
    expect(ofType(events, 'damage').filter((d) => d.source === 'burn' && d.at > killedAt)).toHaveLength(0);
  });
});

describe('처치 · 사망 · 클리어', () => {
  it('처치하면 슬라임이 최대 HP 의 10% 를 회복한다', () => {
    const cfg = arena({ atk: 30, monster: { attackIntervalMs: 500 } });
    const b = farm(cfg, stats({ attack: 100, maxHp: 100 }));
    const events = run(b, cfg, 1600);
    expect(ofType(events, 'heal')).toEqual([{ type: 'heal', at: 1600, to: 'slime', amount: 10, source: 'regen' }]);
    expect(b.slime.hp).toBe(80);
  });

  it('도전 중 처치 목표를 채우면 클리어하고 전투가 멈춘다', () => {
    const cfg = arena({ killsToClear: 3 });
    const b = challenge(cfg, stats({ attack: 1000 }));
    const events = run(b, cfg, 6000);
    expect(ofType(events, 'stageCleared')).toEqual([{ type: 'stageCleared', at: 4800, stageId: 1 }]);
    expect(b.phase).toBe('cleared');
    expect(run(b, cfg, 5000)).toEqual([]);
  });

  it('도전 중 사망하면 2초 뒤 도전 실패로 끝난다', () => {
    const cfg = arena({ atk: 1000 });
    const b = challenge(cfg, stats({ attack: 1, maxHp: 100 }));
    const events = run(b, cfg, 4000);
    expect(ofType(events, 'slimeDied')[0]?.at).toBe(1600);
    expect(ofType(events, 'challengeFailed')[0]?.at).toBe(3600);
    expect(b.phase).toBe('failed');
  });

  it('사냥 중 사망하면 2초 뒤 HP 를 채워 부활하고 다음 몬스터가 나온다', () => {
    const cfg = arena({ atk: 1000 });
    const b = farm(cfg, stats({ attack: 1, maxHp: 100 }));
    const events = run(b, cfg, 4300);
    expect(ofType(events, 'respawned')[0]?.at).toBe(3600);
    expect(ofType(events, 'monsterSpawned').map((e) => [e.at, e.seq])).toEqual([
      [600, 1],
      [4200, 2],
    ]);
    expect(b.slime.hp).toBe(100);
  });

  it('클리어 후 같은 전투를 사냥으로 이어갈 수 있다', () => {
    const cfg = arena({ killsToClear: 1 });
    const b = challenge(cfg, stats({ attack: 1000 }));
    run(b, cfg, 2000);
    continueAsFarm(b, cfg);
    expect(b.mode).toBe('farm');
    expect(ofType(run(b, cfg, 700), 'monsterSpawned')).toHaveLength(1);
  });
});

describe('능력치 변경', () => {
  it('강화로 최대 HP 가 바뀌어도 현재 HP 비율은 유지된다', () => {
    const b = farm(arena(), stats({ maxHp: 100 }));
    b.slime.hp = 50;
    applySlimeStats(b, stats({ maxHp: 200, attack: 30 }));
    expect(b.slime.hp).toBe(100);
    expect(b.slime.stats.attack).toBe(30);
  });
});

describe('엔진 성질', () => {
  const realRun = (split: (i: number) => number) => {
    const slime = deriveSlimeStats({ upgrades: { attack: 8 } }, gameConfig);
    const b = createBattle({ stageId: 6, mode: 'farm', slime, seed: 42 }, gameConfig);
    const events: BattleEvent[] = [];
    let elapsed = 0;
    for (let i = 0; elapsed < 120_000; i++) {
      const dt = Math.min(split(i), 120_000 - elapsed);
      events.push(...stepBattle(b, dt, gameConfig));
      elapsed += dt;
    }
    return { events, state: b };
  };

  it('결정성 — 같은 시드면 같은 결과', () => {
    expect(realRun(() => 100)).toEqual(realRun(() => 100));
  });

  it('분할 불변 — 시간을 어떻게 나눠 진행해도 결과가 같다', () => {
    const rng = { s: 99 };
    const oneShot = realRun(() => 120_000);
    expect(realRun(() => 100)).toEqual(oneShot);
    expect(realRun(() => 1 + Math.floor(nextFloat(rng) * 400))).toEqual(oneShot);
  });

  it('긴 전투 동안 HP 는 0 ~ 최대 HP 를 벗어나지 않는다 (사망·부활 포함)', () => {
    const slime = deriveSlimeStats({ upgrades: { attack: 0 } }, gameConfig);
    const b = createBattle({ stageId: 6, mode: 'farm', slime, seed: 3 }, gameConfig);
    let deaths = 0;
    for (let t = 0; t < 300_000; t += 100) {
      deaths += ofType(stepBattle(b, 100, gameConfig), 'slimeDied').length;
      expect(b.slime.hp).toBeGreaterThanOrEqual(0);
      expect(b.slime.hp).toBeLessThanOrEqual(b.slime.stats.maxHp);
      if (b.monster) {
        expect(b.monster.hp).toBeGreaterThanOrEqual(0);
        expect(b.monster.hp).toBeLessThanOrEqual(b.monster.stats.maxHp);
      }
    }
    expect(deaths).toBeGreaterThan(0);
  });
});
