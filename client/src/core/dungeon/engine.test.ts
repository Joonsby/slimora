import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../model/config';
import type { DungeonEvent, DungeonInit, DungeonState, SkillId } from '../model/dungeon';
import { cloneConfig, stats } from '../../testing/fixtures';
import { chooseDungeonSkill, createDungeon, isDungeonOver, rerollDungeonOffer, setDungeonFocus, stepDungeon, summarizeDungeon, useDungeonUltimate } from './engine';

const ofType = <T extends DungeonEvent['type']>(events: readonly DungeonEvent[], type: T) => events.filter((e): e is Extract<DungeonEvent, { type: T }> => e.type === type);

function start(cfg: GameConfig = cloneConfig(), init: Partial<DungeonInit> = {}) {
  return createDungeon({ level: 1, slime: stats({ maxHp: 1_000_000, attack: 40 }), form: null, allies: [], seed: 7, goldMul: 1, rerolls: 1, offerSize: 3, chargeMul: 1, ...init }, cfg);
}

/** 원하는 스킬을 그 자리에 제시하고 고른다 (테스트용) */
function give(state: DungeonState, cfg: GameConfig, skill: SkillId): DungeonEvent[] {
  state.phase = 'choosing';
  state.offer = [skill];
  return chooseDungeonSkill(state, skill, cfg)!;
}

/** stepMs 씩 진행하며 이벤트를 모은다. 선택 화면이면 pick 으로 고른다 */
function play(state: DungeonState, cfg: GameConfig, ms: number, pick: (offer: readonly SkillId[]) => SkillId = (o) => o[0]!, stepMs = 100): DungeonEvent[] {
  const events: DungeonEvent[] = [];
  for (let t = 0; t < ms && !isDungeonOver(state); t += stepMs) {
    if (state.phase === 'choosing') events.push(...chooseDungeonSkill(state, pick(state.offer!), cfg)!);
    events.push(...stepDungeon(state, stepMs, cfg));
  }
  return events;
}

describe('도전 던전 — 시작 · 스킬 선택', () => {
  it('서로 다른 스킬 3개를 제시하고, 고르는 동안은 시간이 흐르지 않는다', () => {
    const { state, events } = start();
    expect(state.phase).toBe('choosing');
    expect(new Set(state.offer).size).toBe(3);
    expect(events).toEqual([{ type: 'dOffer', at: 0, skills: state.offer, rerolls: 1 }]);
    expect(stepDungeon(state, 5000, cloneConfig())).toEqual([]);
    expect(state.now).toBe(0);
  });

  it('고르면 그 스킬 1단계를 얻고 1 웨이브가 열린다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg);
    const skill = state.offer![0]!;
    const events = chooseDungeonSkill(state, skill, cfg)!;
    expect(events).toEqual([
      { type: 'dSkill', at: 0, skill, level: 1 },
      { type: 'dWave', at: 0, wave: 1, boss: null },
    ]);
    expect(state.skills[skill]).toBe(1);
    expect(state.queue).toHaveLength(cfg.dungeon.waves.monsters[0]!);
    expect(chooseDungeonSkill(state, skill, cfg)).toBeNull();
  });

  it('다시 뽑기는 횟수만큼 — 되도록 다른 스킬로 바꿔 준다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg);
    const before = state.offer!;
    const rerolled = rerollDungeonOffer(state, cfg)!;
    expect(rerolled[0]).toMatchObject({ type: 'dOffer', rerolls: 0 });
    expect(state.offer!.filter((s) => before.includes(s))).toHaveLength(0);
    expect(rerollDungeonOffer(state, cfg)).toBeNull();
  });

  it('같은 스킬을 다시 고르면 단계가 오르고, 최대 단계면 더 제시되지 않는다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg);
    for (let i = 0; i < 3; i++) give(state, cfg, 'split');
    expect(state.skills.split).toBe(3);
    state.phase = 'waveClear';
    state.phaseUntil = state.now;
    state.wave = 2;
    stepDungeon(state, 1, cfg);
    expect(state.phase).toBe('choosing');
    expect(state.offer).not.toContain('split');
  });

  it('같은 시드 · 같은 선택이면 같은 전투, dt 를 어떻게 나눠도 같다', () => {
    const cfg = cloneConfig();
    const a = start(cfg).state;
    const b = start(cfg).state;
    const c = start(cfg).state;
    const ea = play(a, cfg, 60_000, (o) => o[0]!, 100);
    const eb = play(b, cfg, 60_000, (o) => o[0]!, 100);
    const ec = play(c, cfg, 60_000, (o) => o[0]!, 37);
    expect(ea).toEqual(eb);
    expect(ofType(ec, 'dKilled').map((e) => [e.at, e.seq])).toEqual(ofType(ea, 'dKilled').map((e) => [e.at, e.seq]));
  });
});

describe('다수 몬스터 전투', () => {
  it('여러 몬스터가 동시에 나와 싸우고, 기본은 맨 앞 적을 노린다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    give(state, cfg, 'shield');
    const events = play(state, cfg, 3000);
    expect(state.monsters.length).toBeGreaterThanOrEqual(2);
    const front = state.monsters.find((m) => m.slot === 0)!;
    expect(ofType(events, 'dAttack').every((a) => a.target === front.seq)).toBe(true);
    expect(new Set(ofType(events, 'dMonsterAttack').map((a) => a.seq)).size).toBeGreaterThanOrEqual(2);
  });

  it('대상을 고르면 그 적을 먼저 친다. 없는 적은 고를 수 없다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    give(state, cfg, 'shield');
    play(state, cfg, 2000);
    const back = state.monsters.find((m) => m.slot !== 0)!;
    expect(setDungeonFocus(state, back.seq)).toBe(true);
    expect(setDungeonFocus(state, 9999)).toBe(false);
    const attacks = ofType(play(state, cfg, 3000), 'dAttack');
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.target === back.seq)).toBe(true);
  });

  it('한 번에 최대 5마리 — 나머지는 자리가 나면 들어온다', () => {
    const cfg = cloneConfig();
    cfg.dungeon.waves.monsters[0] = 8;
    cfg.dungeon.waves.gapMs = 100;
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    give(state, cfg, 'shield');
    play(state, cfg, 5000);
    expect(state.monsters).toHaveLength(5);
    expect(state.queue).toHaveLength(3);
    expect(new Set(state.monsters.map((m) => m.slot))).toEqual(new Set([0, 1, 2, 3, 4]));
  });
});

describe('스킬이 공격 방식을 바꾼다', () => {
  const crowd = () => {
    const cfg = cloneConfig();
    cfg.dungeon.waves.monsters[0] = 5;
    cfg.dungeon.waves.burst = 5;
    return cfg;
  };

  it('화염 폭발 — 3번째 공격마다 대상 둘레의 여러 적이 한꺼번에 맞는다', () => {
    const cfg = crowd();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 2 }) });
    give(state, cfg, 'fireburst');
    const events = play(state, cfg, 6000);
    const blasts = ofType(events, 'dExplosion');
    expect(blasts.length).toBeGreaterThan(0);
    const attacks = ofType(events, 'dAttack');
    expect(blasts.length).toBe(Math.floor(attacks.length / 3));
    const first = blasts[0]!;
    const hit = new Set(events.filter((e) => e.type === 'dHit' && e.at === first.at && e.source === 'explosion').map((e) => (e as { seq: number }).seq));
    expect(hit.size).toBeGreaterThanOrEqual(2);
  });

  it('연쇄 번개 — 서로 다른 적들로 튀며 점점 약해진다', () => {
    const cfg = crowd();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 50 }) });
    give(state, cfg, 'chain');
    const events = play(state, cfg, 4000);
    const bolt = ofType(events, 'dLightning')[0]!;
    expect(bolt.path.length).toBe(3);
    expect(new Set(bolt.path).size).toBe(3);
    const hits = events.filter((e): e is Extract<DungeonEvent, { type: 'dHit' }> => e.type === 'dHit' && e.at === bolt.at && e.source === 'lightning');
    expect(hits.map((h) => h.seq)).toEqual(bolt.path);
  });

  it('분열 공격 — 한 번 공격에 여러 적을 맞힌다. 적이 하나면 남는 탄은 그 적에게 절반 위력으로', () => {
    const cfg = crowd();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    give(state, cfg, 'split');
    give(state, cfg, 'split');
    const attack = ofType(play(state, cfg, 4000), 'dAttack').find((a) => !a.split.includes(a.target))!;
    expect(attack.split).toHaveLength(2);
    expect(new Set([attack.target, ...attack.split]).size).toBe(3);

    const solo = cloneConfig();
    solo.dungeon.waves.monsters[0] = 1;
    solo.monsters = solo.monsters.map((m) => ({ ...m, hpMul: 50 }));
    const one = start(solo, { slime: stats({ maxHp: 1_000_000, attack: 10 }) }).state;
    give(one, solo, 'split');
    const events = play(one, solo, 3000);
    const first = ofType(events, 'dAttack')[0]!;
    expect(first.split).toEqual([first.target]);
    const [main, extra] = events.filter((e): e is Extract<DungeonEvent, { type: 'dHit' }> => e.type === 'dHit' && e.at === first.at);
    expect(extra!.source).toBe('split');
    expect(extra!.amount).toBeLessThan(main!.amount * 0.5);
  });

  it('독성 공격 — 맞힐 때마다 쌓이고, 피해감소와 상관없이 계속 깎는다', () => {
    const cfg = cloneConfig();
    cfg.dungeon.waves.monsters[0] = 1;
    cfg.monsters = cfg.monsters.map((m) => ({ ...m, hpMul: 50, effects: [{ kind: 'damageReduction', ratio: 0.7 }] }));
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 30 }) });
    give(state, cfg, 'poison');
    const events = play(state, cfg, 6000);
    const ticks = events.filter((e): e is Extract<DungeonEvent, { type: 'dHit' }> => e.type === 'dHit' && e.source === 'poison');
    expect(ticks.length).toBeGreaterThan(4);
    expect(ticks.at(-1)!.amount).toBeGreaterThan(ticks[0]!.amount);
    expect(state.monsters[0]!.poison!.stacks).toBeGreaterThan(1);
    // 직격은 피해감소로 70% 깎이지만 독은 그대로 — 중첩 × 공격력 × 0.12 × 0.5초
    expect(ticks.at(-1)!.amount).toBe(Math.floor((state.monsters[0]!.poison!.stacks * 30 * 0.12 * 500) / 1000));
  });

  it('보호막 — 피해를 먼저 막는다. 3단계는 깨질 때 모든 적에게 충격파', () => {
    const cfg = crowd();
    cfg.dungeon.waves.atkMul = 100;
    const { state } = start(cfg, { slime: stats({ maxHp: 10_000, attack: 1 }) });
    give(state, cfg, 'shield');
    give(state, cfg, 'shield');
    give(state, cfg, 'shield');
    const events = play(state, cfg, 15_000);
    // HP 가 기준 아래로 떨어진 순간 한 번 펼친다
    const spec = cfg.dungeon.skills.shield.levels[2]!;
    expect(ofType(events, 'dShield')[0]!.amount).toBe(Math.round(10_000 * spec.ratio));
    expect(ofType(events, 'dShield').length).toBeLessThanOrEqual(1 + Math.floor(15_000 / spec.cooldownMs));
    expect(ofType(events, 'dHurt').some((h) => h.absorbed > 0)).toBe(true);
    const broke = ofType(events, 'dShieldBreak')[0]!;
    expect(broke.shockwave).toBe(true);
    const waves = events.filter((e) => e.type === 'dHit' && e.at === broke.at && e.source === 'shockwave');
    expect(waves.length).toBeGreaterThanOrEqual(2);
  });

  it('광폭화 — 처치할수록 공격이 빨라진다', () => {
    const cfg = crowd();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 120 }) });
    give(state, cfg, 'frenzy');
    const events = play(state, cfg, 8000);
    expect(ofType(events, 'dFrenzy').some((f) => f.stacks >= 2)).toBe(true);
    const at = ofType(events, 'dAttack').map((a) => a.at);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    expect(Math.min(...gaps)).toBeLessThan(1000);
  });

  it('시너지 — 화염 폭발과 독성을 갖추면 독화 폭발이 켜지고, 폭발이 독을 퍼뜨린다', () => {
    const cfg = crowd();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 2 }) });
    give(state, cfg, 'poison');
    const events = give(state, cfg, 'fireburst');
    expect(ofType(events, 'dSynergy')).toEqual([{ type: 'dSynergy', at: state.now, synergy: 'toxicBlast' }]);
    const fight = play(state, cfg, 6000);
    const blast = ofType(fight, 'dExplosion')[0]!;
    expect(blast.toxic).toBe(true);
    const hitSeqs = fight.filter((e) => e.type === 'dHit' && e.at === blast.at && e.source === 'explosion').map((e) => (e as { seq: number }).seq);
    const poisoned = state.monsters.filter((m) => hitSeqs.includes(m.seq) && m.poison);
    expect(poisoned.length).toBeGreaterThanOrEqual(2);
  });
});

describe('보스 패턴 · 필살기', () => {
  function bossFight(cfg = cloneConfig()) {
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    state.wave = 4;
    give(state, cfg, 'shield');
    play(state, cfg, 1000);
    return { cfg, state };
  }

  it('5 웨이브에 보스가 나오고, 내려찍기를 예고한 뒤 큰 피해를 준다', () => {
    const { cfg, state } = bossFight();
    expect(state.monsters[0]!.boss?.id).toBe('golemChief');
    const events = play(state, cfg, 8000);
    const cast = ofType(events, 'dBossCast')[0]!;
    expect(cast).toMatchObject({ pattern: 'smash', counter: 'block' });
    const smash = ofType(events, 'dHurt').find((h) => h.source === 'smash')!;
    expect(smash.at).toBe(cast.impactAt);
    expect(smash.amount + smash.absorbed).toBeGreaterThan(ofType(events, 'dHurt').find((h) => h.source === 'hit')!.amount * 2);
  });

  it('예고 중에 필살기를 쓰면 내려찍기가 끊기고 보스가 경직된다', () => {
    const { cfg, state } = bossFight();
    const before = play(state, cfg, 4000);
    expect(ofType(before, 'dBossCast')).toHaveLength(1);
    state.ult.charge = cfg.dungeon.ultimate.max;
    const used = useDungeonUltimate(state, cfg)!;
    expect(ofType(used, 'dUltimate')[0]).toMatchObject({ blocked: true });
    expect(state.monsters[0]!.boss!.staggerUntil).toBeGreaterThan(state.now);
    const after = play(state, cfg, 3000);
    expect(ofType(after, 'dHurt').filter((h) => h.source === 'smash')).toHaveLength(0);
    expect(state.record.blocked).toBe(1);
  });

  it('경화 중에는 받는 피해가 크게 줄고, 필살기로 깬다', () => {
    const { cfg, state } = bossFight();
    const boss = state.monsters.find((m) => m.boss)!;
    const open: DungeonEvent[] = [];
    for (let t = 0; t < 30_000 && !ofType(open, 'dGuard').some((g) => g.on); t += 100) open.push(...stepDungeon(state, 100, cfg));
    expect(boss.boss!.guardUntil).toBeGreaterThan(state.now);
    const plain = ofType(open, 'dHit').find((h) => h.source === 'hit' && h.seq === boss.seq)!;
    const guarded = ofType(play(state, cfg, 1500), 'dHit').find((h) => h.source === 'hit' && h.seq === boss.seq)!;
    expect(guarded.amount).toBeLessThanOrEqual(plain.amount);
    state.ult.charge = cfg.dungeon.ultimate.max;
    const used = useDungeonUltimate(state, cfg)!;
    expect(ofType(used, 'dUltimate')[0]).toMatchObject({ broke: true });
    expect(ofType(used, 'dGuard')).toEqual([{ type: 'dGuard', at: state.now, seq: boss.seq, on: false }]);
  });

  it('필살기 게이지는 싸우는 동안에만 차고, 덜 차면 쓸 수 없다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    expect(state.ult.charge).toBe(cfg.dungeon.ultimate.start);
    give(state, cfg, 'shield');
    expect(useDungeonUltimate(state, cfg)).toBeNull();
    const events = play(state, cfg, 20_000);
    expect(ofType(events, 'dUltReady')).toHaveLength(1);
    const alive = state.monsters.map((m) => m.seq);
    const hits = ofType(useDungeonUltimate(state, cfg)!, 'dHit').filter((h) => h.source === 'ultimate');
    expect(hits.map((h) => h.seq).sort()).toEqual([...alive].sort());
    expect(state.ult.charge).toBe(0);
  });
});

describe('한 판의 흐름', () => {
  it('강한 슬라임은 10 웨이브를 모두 깬다 — 1 · 3 · 5 · 7 · 9 웨이브 전에 스킬을 고른다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 5000 }) });
    const events = play(state, cfg, 600_000);
    expect(state.phase).toBe('cleared');
    expect(ofType(events, 'dSkill')).toHaveLength(5);
    expect(ofType(events, 'dWave').map((w) => w.boss)).toEqual([null, null, null, null, 'golemChief', null, null, null, null, 'flameLord']);
    const summary = summarizeDungeon(state);
    expect(summary).toMatchObject({ level: 1, waves: 10, cleared: true, bossKills: 2 });
    expect(summary.rewards.gold).toBeGreaterThan(0);
    expect(Object.values(summary.rewards.absorb).reduce<number>((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0);
  });

  it('약한 슬라임은 쓰러진다 — 그때까지 깬 웨이브와 보상은 남는다', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg, { slime: stats({ maxHp: 60, attack: 30 }) });
    const events = play(state, cfg, 600_000);
    expect(state.phase).toBe('failed');
    expect(ofType(events, 'dFailed')).toHaveLength(1);
    const summary = summarizeDungeon(state);
    expect(summary.cleared).toBe(false);
    expect(summary.waves).toBe(state.wavesCleared);
    expect(summary.rewards.gold).toBe(ofType(events, 'dKilled').reduce((sum, k) => sum + k.gold, 0));
  });
});

describe('조정한 규칙', () => {
  it('보호막은 HP 가 기준 아래로 떨어질 때만 펼치고, 대기시간 동안은 다시 펴지 않는다', () => {
    const cfg = cloneConfig();
    cfg.dungeon.waves.monsters[0] = 5;
    cfg.dungeon.waves.burst = 5;
    cfg.dungeon.waves.atkMul = 30;
    const { state } = start(cfg, { slime: stats({ maxHp: 5000, attack: 1 }) });
    give(state, cfg, 'shield');
    const spec = cfg.dungeon.skills.shield.levels[0]!;
    const events = play(state, cfg, 20_000);
    const shields = ofType(events, 'dShield');
    expect(shields.length).toBeGreaterThan(0);
    const first = shields[0]!;
    // 펼치기 직전 HP 는 기준 아래였다
    const hpBefore = 5000 - ofType(events, 'dHurt').filter((h) => h.at <= first.at).reduce((sum, h) => sum + h.amount, 0) + ofType(events, 'dHeal').filter((h) => h.at <= first.at).reduce((s, h) => s + h.amount, 0);
    expect(hpBefore).toBeLessThanOrEqual(5000 * spec.hpBelow);
    for (let i = 1; i < shields.length; i++) expect(shields[i]!.at - shields[i - 1]!.at).toBeGreaterThanOrEqual(spec.cooldownMs);
  });

  it('광폭화 — 보스의 큰 공격을 맞으면 곧바로 최대 중첩', () => {
    const cfg = cloneConfig();
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    state.wave = 4;
    give(state, cfg, 'frenzy');
    const events = play(state, cfg, 12_000);
    const smash = ofType(events, 'dHurt').find((h) => h.source === 'smash')!;
    expect(smash).toBeDefined();
    const max = cfg.dungeon.skills.frenzy.levels[0]!.maxStacks;
    expect(ofType(events, 'dFrenzy').find((f) => f.at === smash.at)).toMatchObject({ stacks: max });
  });

  it('보스의 큰 공격은 슬라임 최대 HP 에 비례하는 몫이 있다 — 강해져도 무시할 수 없다', () => {
    const cfg = cloneConfig();
    const smashOf = (maxHp: number) => {
      const { state } = start(cfg, { slime: stats({ maxHp, attack: 1 }) });
      state.wave = 4;
      give(state, cfg, 'split');
      const hit = ofType(play(state, cfg, 12_000), 'dHurt').find((h) => h.source === 'smash')!;
      return hit.amount + hit.absorbed;
    };
    const ratio = (cfg.dungeon.bosses.golemChief!.cycle[0] as { hpRatio: number }).hpRatio;
    expect(smashOf(100_000) - smashOf(10_000)).toBeCloseTo(90_000 * ratio, -1);
  });

  it('1 보다 작은 피해 · 화상은 버리지 않고 모아서 준다 — 초반 작은 수치가 부풀지 않는다', () => {
    const cfg = cloneConfig();
    cfg.dungeon.waves.monsters[0] = 1;
    cfg.dungeon.waves.atkMul = 0.05;
    // 화상 · 흡혈 없는 몬스터로 (나머지는 화상과 함께 모인다)
    cfg.monsters = cfg.monsters.map((m) => ({ ...m, hpMul: 1000, effects: [] }));
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    give(state, cfg, 'split');
    const events = play(state, cfg, 60_000);
    const m = state.monsters[0]!;
    const swings = ofType(events, 'dMonsterAttack').length;
    const dealt = ofType(events, 'dHurt').filter((h) => h.source === 'hit').reduce((sum, h) => sum + h.amount, 0);
    expect(m.stats.attack).toBeLessThan(1);
    expect(dealt).toBeLessThan(swings);
    expect(Math.abs(dealt - swings * m.stats.attack)).toBeLessThanOrEqual(1);
  });

  it('맞을 때마다 필살기가 조금씩 찬다 (화상 제외)', () => {
    const cfg = cloneConfig();
    cfg.dungeon.ultimate.perSecond = 0;
    cfg.dungeon.ultimate.perKill = 0;
    cfg.dungeon.ultimate.start = 0;
    const { state } = start(cfg, { slime: stats({ maxHp: 1_000_000, attack: 1 }) });
    give(state, cfg, 'split');
    const events = play(state, cfg, 6000);
    const hits = ofType(events, 'dHurt').filter((h) => h.source !== 'burn' && h.amount + h.absorbed > 0).length;
    expect(hits).toBeGreaterThan(0);
    expect(state.ult.charge).toBeCloseTo(Math.min(cfg.dungeon.ultimate.max, hits * cfg.dungeon.ultimate.perHurt!));
  });
});
