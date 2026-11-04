import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../model/config';
import type { DungeonEvent, DungeonInit, DungeonState } from '../model/dungeon';
import { nextFloat } from '../rng';
import { cloneConfig, stats } from '../../testing/fixtures';
import { restoreDungeon, snapshotDungeon } from './checkpoint';
import { chooseDungeonSkill, createDungeon, dungeonUltReady, isDungeonOver, stepDungeon, useDungeonUltimate } from './engine';

const cfg: GameConfig = cloneConfig();

function init(patch: Partial<DungeonInit> = {}): DungeonInit {
  return {
    runId: 'run-1',
    level: 1,
    rewardStage: 2,
    assist: false,
    slime: stats({ maxHp: 2400, attack: 30, critChance: 0.2, critMultiplier: 1.8 }),
    form: 'flame',
    allies: [{ id: 'goldy', power: 0.3, intervalMs: 1300, preset: 'slime' }],
    seed: 42,
    goldMul: 1.2,
    rerolls: 2,
    offerSize: 4,
    chargeMul: 1.3,
    ...patch,
  };
}

/** 정해진 규칙으로 한 걸음 — 고를 때는 첫 번째, 보스가 내려찍기를 예고하면 필살기 */
function act(state: DungeonState): DungeonEvent[] {
  if (state.phase === 'choosing') return chooseDungeonSkill(state, state.offer![0]!, cfg)!;
  const events: DungeonEvent[] = [];
  if (dungeonUltReady(state, cfg) && state.monsters.some((m) => m.boss?.casting?.pattern.kind === 'smash')) events.push(...useDungeonUltimate(state, cfg)!);
  events.push(...stepDungeon(state, 100, cfg));
  return events;
}

/** JSON 저장 · 읽기를 거친 사본 */
const viaJson = (s: DungeonState) => restoreDungeon(JSON.parse(JSON.stringify(snapshotDungeon(s))), cfg);

describe('도전 던전 체크포인트', () => {
  it('저장했다 읽어 이어서 돌리면 끊기지 않은 판과 이벤트 · 결과가 같다 (웨이브 경계 · 싸우는 중 모두)', () => {
    const plain = createDungeon(init(), cfg).state;
    const plainEvents: DungeonEvent[] = [];
    for (let i = 0; i < 20_000 && !isDungeonOver(plain); i++) plainEvents.push(...act(plain));

    let resumed = createDungeon(init(), cfg).state;
    const resumedEvents: DungeonEvent[] = [];
    let restores = 0;
    for (let i = 0; i < 20_000 && !isDungeonOver(resumed); i++) {
      const events = act(resumed);
      resumedEvents.push(...events);
      // 웨이브가 열리거나 고를 차례가 되면, 그리고 싸우는 중에도 가끔 — 앱을 껐다 켠 셈
      if (!isDungeonOver(resumed) && (events.some((e) => e.type === 'dWave' || e.type === 'dOffer' || e.type === 'dWaveClear') || i % 377 === 0)) {
        resumed = viaJson(resumed)!;
        expect(resumed).not.toBeNull();
        restores += 1;
      }
    }
    expect(restores).toBeGreaterThan(15);
    expect(isDungeonOver(plain)).toBe(true);
    expect(resumedEvents).toEqual(plainEvents);
    expect(resumed).toEqual(plain);
  });

  it('HP · 웨이브 · 스킬 단계 · 시너지 · 연구 효과 · 필살기 · 난수 상태를 그대로 되살린다', () => {
    const s = createDungeon(init(), cfg).state;
    for (let i = 0; i < 2000 && s.wave < 4; i++) act(s);
    s.slime.hp = 777;
    const back = viaJson(s)!;
    expect(back).toEqual(s);
    expect(back).toMatchObject({ wave: s.wave, skills: s.skills, synergies: s.synergies, rerolls: 2, offerSize: 4, ult: { charge: s.ult.charge, mul: 1.3 }, rng: s.rng, id: 'run-1' });
    expect(back.slime.hp).toBe(777);
    expect(back.slime.stats.maxHp).toBe(2400);
  });

  it('끝난 판 · 엉뚱한 값 · 깨진 구조는 버리고 던지지 않는다', () => {
    const s = createDungeon(init(), cfg).state;
    // 적이 둘 이상 선 싸움 한가운데
    for (let i = 0; i < 5000 && !(s.phase === 'fighting' && s.monsters.length >= 2); i++) act(s);
    expect(s.phase).toBe('fighting');
    const base = JSON.parse(JSON.stringify(s));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 깨진 값을 마음대로 넣는다
    const broken: [string, (x: Record<string, any>) => void][] = [
      ['끝난 판', (x) => (x.phase = 'cleared')],
      ['모르는 단계', (x) => (x.phase = 'boss')],
      ['HP 가 숫자가 아님', (x) => (x.slime.hp = 'full')],
      ['HP 0', (x) => (x.slime.hp = 0)],
      ['최대 HP 보다 큰 HP', (x) => (x.slime.hp = x.slime.stats.maxHp + 1)],
      ['공격 간격 0 (엔진이 멈춘다)', (x) => (x.slime.stats.attackIntervalMs = 0)],
      ['없는 몬스터', (x) => (x.monsters[0].defId = 'nope')],
      ['겹친 자리', (x) => (x.monsters[1] = { ...x.monsters[0], seq: 999 })],
      ['없는 스킬', (x) => (x.skills.laser = 1)],
      ['스킬 단계 초과', (x) => (x.skills[Object.keys(x.skills)[0]!] = 9)],
      ['켜지지 않은 시너지', (x) => (x.synergies = ['stormChain'])],
      ['싸우는 중인데 선택지', (x) => (x.offer = ['split'])],
      ['웨이브와 깬 웨이브가 어긋남', (x) => (x.wavesCleared = x.wave + 3)],
      ['단계 범위 밖', (x) => (x.level = 0)],
      ['보상 음수', (x) => (x.rewards.gold = -5)],
      ['없는 계열 보상', (x) => (x.rewards.absorb.dragonlord = 3)],
      ['필살기 초과', (x) => (x.ult.charge = 1e9)],
      ['id 없음', (x) => delete x.id],
      ['난수 상태 없음', (x) => delete x.rng],
    ];
    for (const [name, mutate] of broken) {
      const copy = structuredClone(base);
      mutate(copy);
      expect(restoreDungeon(copy, cfg), name).toBeNull();
    }
    for (const junk of [null, undefined, 0, 'save', [], [base], { now: 1 }]) expect(restoreDungeon(junk, cfg)).toBeNull();
  });

  it('무작위로 값을 망가뜨려도 던지지 않고, 받아들인 판은 끝까지 돌릴 수 있다', () => {
    const s = createDungeon(init(), cfg).state;
    for (let i = 0; i < 400; i++) act(s);
    const base = JSON.parse(JSON.stringify(s));
    const rng = { s: 7 };
    const junk = [null, -1, 0, 1e12, NaN, 'x', [], {}, true, 0.5, 3];
    const paths: string[][] = [];
    const walk = (v: unknown, path: string[]) => {
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
      else paths.push(path);
    };
    walk(base, []);
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const copy = structuredClone(base);
      const path = paths[Math.floor(nextFloat(rng) * paths.length)]!;
      let o = copy;
      for (const k of path.slice(0, -1)) o = o[k];
      o[path.at(-1)!] = junk[Math.floor(nextFloat(rng) * junk.length)];
      const back = restoreDungeon(copy, cfg);
      if (!back) continue;
      accepted += 1;
      for (let t = 0; t < 1200 && !isDungeonOver(back); t++) act(back);
    }
    expect(accepted).toBeGreaterThan(0);
  });

  it('설정이 바뀌어 보스 패턴 순서가 어긋나면 그 예고만 접고 곧 다시 예고한다', () => {
    const s = createDungeon(init({ slime: stats({ maxHp: 1_000_000, attack: 1 }) }), cfg).state;
    s.wave = 4;
    s.wavesCleared = 4;
    s.phase = 'choosing';
    s.offer = ['shield'];
    chooseDungeonSkill(s, 'shield', cfg);
    for (let i = 0; i < 2000 && !s.monsters.some((m) => m.boss?.casting); i++) stepDungeon(s, 100, cfg);
    const saved = JSON.parse(JSON.stringify(s));
    const changed = cloneConfig();
    changed.dungeon.bosses.golemChief!.cycle = [{ kind: 'guard', windupMs: 900, durationMs: 5000, reduction: 0.75 }];
    const back = restoreDungeon(saved, changed)!;
    expect(back.monsters.find((m) => m.boss)!.boss!.casting).toBeNull();
    expect(back.monsters.find((m) => m.boss)!.boss!.nextAt).toBe(back.now + 500);
  });
});
