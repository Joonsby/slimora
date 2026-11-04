import { describe, expect, it } from 'vitest';
import { gameConfig as cfg } from '../../data';
import { dungeonRefStage } from '../dungeon/rules';
import type { DungeonSummary } from '../model/dungeon';
import type { ProgressState } from '../model/progress';
import { applyCommand } from './applyCommand';
import { assistActive, crystalRate, difficultyOf, dungeonGains, dungeonInit, dungeonOpen, dungeonPower, easyRate, finishDungeon, firstClearGems, highestUnlockedLevel, isLevelUnlocked, purchaseResearch, recommendedLevel, researchCost } from './dungeon';
import { createInitialProgress } from './initial';
import { rebirth } from './prestige';

const at = (highestCleared: number, patch: Partial<ProgressState> = {}): ProgressState => {
  const p = createInitialProgress(cfg);
  return { ...p, stage: { ...p.stage, highestCleared, current: highestCleared + 1 }, ...patch };
};

let runs = 0;
const summary = (s: Partial<DungeonSummary> = {}): DungeonSummary => ({
  runId: `t${++runs}`,
  level: 1,
  waves: 10,
  cleared: true,
  bossKills: 2,
  rewards: { gold: 500, kills: { bat: 10, golem: 5 }, absorb: { bat: 12, golem: 6 } },
  synergies: [],
  ...s,
});

describe('던전 열림 · 단계', () => {
  it(`스테이지 ${cfg.dungeon.unlockStage} 를 깨면 1 단계가 열린다`, () => {
    expect(dungeonOpen(at(cfg.dungeon.unlockStage - 1), cfg)).toBe(false);
    expect(isLevelUnlocked(at(cfg.dungeon.unlockStage - 1), 1, cfg)).toBe(false);
    expect(isLevelUnlocked(at(cfg.dungeon.unlockStage), 1, cfg)).toBe(true);
    expect(isLevelUnlocked(at(cfg.dungeon.unlockStage), 2, cfg)).toBe(false);
  });

  it('앞 단계를 깼거나 기준 스테이지까지 왔으면 다음 단계가 열린다', () => {
    const p = at(cfg.dungeon.unlockStage);
    expect(isLevelUnlocked({ ...p, dungeon: { ...p.dungeon, cleared: 1 } }, 2, cfg)).toBe(true);
    expect(isLevelUnlocked(at(dungeonRefStage(3, cfg)), 3, cfg)).toBe(true);
    expect(highestUnlockedLevel(at(dungeonRefStage(3, cfg)), cfg)).toBe(3);
  });

  it('환생해도 지금까지 연 단계와 기록은 남는다', () => {
    // 환생할 수 있을 만큼 진행하고, 그 높이의 단계를 깼다
    const p = at(cfg.balance.prestige.unlockStage + 1);
    const level = highestUnlockedLevel(p, cfg);
    const afterRun = applyCommand(p, { type: 'finishDungeon', summary: summary({ level }) }, cfg);
    expect(afterRun.ok).toBe(true);
    if (!afterRun.ok) return;
    const reborn = rebirth(afterRun.value, cfg);
    expect(reborn.ok).toBe(true);
    if (!reborn.ok) return;
    expect(reborn.value.dungeon).toEqual(afterRun.value.dungeon);
    expect(highestUnlockedLevel(reborn.value, cfg)).toBe(level + 1);
  });

  it('추천 단계는 지금 힘에 맞춘다 — 약하면 1단계, 강하면 열린 단계 중 적정 이상인 가장 높은 단계', () => {
    const weak = at(dungeonRefStage(4, cfg));
    expect(highestUnlockedLevel(weak, cfg)).toBe(4);
    expect(recommendedLevel(weak, cfg)).toBe(1);
    const strong = { ...weak, slime: { ...weak.slime, upgrades: { attack: 60, maxHp: 60, critChance: 0 } } };
    const level = recommendedLevel(strong, cfg);
    expect(level).toBeGreaterThan(1);
    expect(dungeonPower(strong, level, cfg)).toBeGreaterThanOrEqual(cfg.dungeon.levels.recommend);
    if (level < highestUnlockedLevel(strong, cfg)) expect(dungeonPower(strong, level + 1, cfg)).toBeLessThan(cfg.dungeon.levels.recommend);
    // 단계가 오를수록 세기는 줄고, 구간마다 이름이 붙는다
    expect(dungeonPower(strong, 2, cfg)).toBeLessThan(dungeonPower(strong, 1, cfg));
    expect([difficultyOf(1.5, cfg), difficultyOf(1, cfg), difficultyOf(0.8, cfg), difficultyOf(0.3, cfg)]).toEqual(['easy', 'fair', 'hard', 'brutal']);
  });
});

describe('던전 결과 반영', () => {
  it('골드 · 처치 · 흡수 · 결정을 받고, 첫 클리어 보석은 한 번만', () => {
    const p = at(cfg.dungeon.unlockStage);
    const r = cfg.dungeon.rewards;
    const first = applyCommand(p, { type: 'finishDungeon', summary: summary() }, cfg);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const v = first.value;
    expect(v.gold).toBe(500);
    // 흡수는 absorbMul 을 곱해 반영한다 (던전이 본편 특성 성장을 앞지르지 않게)
    expect(v.slime.absorption).toMatchObject({ bat: Math.floor(12 * r.absorbMul), golem: Math.floor(6 * r.absorbMul) });
    expect(v.lifetime.kills).toMatchObject({ bat: 10, golem: 5 });
    expect(v.dungeon).toMatchObject({ cleared: 1, best: { 1: 10 }, crystals: r.crystalsPerWave * 10 + r.crystalsPerBoss * 2 + r.crystalsClear, runs: 1 });
    expect(v.gems).toBe(p.gems + r.firstClearGems.base);

    const again = applyCommand(v, { type: 'finishDungeon', summary: summary() }, cfg);
    expect(again.ok && again.value.gems).toBe(v.gems);
  });

  it('실패해도 깬 웨이브만큼 결정 · 처치 보상은 받는다. 최고 기록은 넘을 때만 바뀐다', () => {
    const p = at(cfg.dungeon.unlockStage);
    const r = applyCommand(p, { type: 'finishDungeon', summary: summary({ waves: 4, cleared: false, bossKills: 0 }) }, cfg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dungeon).toMatchObject({ cleared: 0, best: { 1: 4 }, crystals: cfg.dungeon.rewards.crystalsPerWave * 4 });
    const worse = applyCommand(r.value, { type: 'finishDungeon', summary: summary({ waves: 2, cleared: false, bossKills: 0 }) }, cfg);
    expect(worse.ok && worse.value.dungeon.best).toEqual({ 1: 4 });
  });

  it('처음 발견한 시너지는 보석과 함께 도감에 남는다', () => {
    const p = at(cfg.dungeon.unlockStage);
    const g = dungeonGains(p, summary({ synergies: ['toxicBlast', 'stormChain'] }), cfg);
    expect(g).toMatchObject({ newSynergies: ['toxicBlast', 'stormChain'], synergyGems: cfg.dungeon.rewards.synergyGems * 2 });
    const r = applyCommand(p, { type: 'finishDungeon', summary: summary({ synergies: ['toxicBlast'] }) }, cfg);
    expect(r.ok && r.value.dungeon.synergies).toEqual(['toxicBlast']);
    if (!r.ok) return;
    expect(dungeonGains(r.value, summary({ synergies: ['toxicBlast'] }), cfg).synergyGems).toBe(0);
  });

  it('열리지 않은 단계 · 앞뒤가 맞지 않는 결과는 받지 않는다', () => {
    const p = at(cfg.dungeon.unlockStage);
    const bad: DungeonSummary[] = [
      summary({ level: 2 }),
      summary({ waves: 11 }),
      summary({ waves: 9, cleared: true }),
      summary({ bossKills: 3 }),
      summary({ rewards: { gold: -1, kills: {}, absorb: {} } }),
      summary({ synergies: ['nope' as never] }),
    ];
    for (const s of bad) expect(applyCommand(p, { type: 'finishDungeon', summary: s }, cfg)).toMatchObject({ ok: false, error: { code: 'INVALID_REWARD' } });
  });
});

describe('던전 연구', () => {
  it('결정으로 연구를 올리고, 최대 단계 · 결정 부족은 막는다', () => {
    const def = cfg.dungeon.research.find((r) => r.stat === 'hp')!;
    const p = at(cfg.dungeon.unlockStage);
    expect(purchaseResearch(p, def.id, cfg)).toMatchObject({ ok: false, error: { code: 'NOT_ENOUGH_CRYSTALS' } });
    let rich: ProgressState = { ...p, dungeon: { ...p.dungeon, crystals: 10_000 } };
    for (let lv = 0; lv < def.maxLevel; lv++) {
      const r = purchaseResearch(rich, def.id, cfg);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.dungeon.crystals).toBe(rich.dungeon.crystals - researchCost(def, lv));
      rich = r.value;
    }
    expect(purchaseResearch(rich, def.id, cfg)).toMatchObject({ ok: false, error: { code: 'MAX_LEVEL' } });
    expect(purchaseResearch(rich, 'nope', cfg)).toMatchObject({ ok: false, error: { code: 'UNKNOWN_RESEARCH' } });
  });

  it('연구는 던전 시작 HP · 필살기 충전 · 다시 뽑기 · 선택지에 들어간다', () => {
    const p = at(cfg.dungeon.unlockStage);
    const base = dungeonInit(p, 1, 1, cfg);
    const research = Object.fromEntries(cfg.dungeon.research.map((r) => [r.id, r.maxLevel]));
    const full = dungeonInit({ ...p, dungeon: { ...p.dungeon, research } }, 1, 1, cfg);
    const sum = (stat: string) => cfg.dungeon.research.filter((r) => r.stat === stat).reduce((s, r) => s + r.perLevel * r.maxLevel, 0);
    expect(full.slime.maxHp).toBe(Math.round(base.slime.maxHp * (1 + sum('hp'))));
    expect(full.chargeMul).toBeCloseTo(1 + sum('charge'));
    expect(full.rerolls).toBe(base.rerolls + sum('reroll'));
    expect(full.offerSize).toBe(base.offerSize + sum('choice'));
  });

  it('편성한 용병은 외형과 함께 던전에 들어간다 (연계 판정용)', () => {
    const p = at(cfg.dungeon.unlockStage, { mercenaries: { owned: { pip: 1, goldy: 1 }, party: ['pip', 'goldy'] } });
    expect(dungeonInit(p, 1, 1, cfg).allies.map((a) => [a.id, a.preset])).toEqual([
      ['pip', 'bat'],
      ['goldy', 'slime'],
    ]);
  });
});

describe('2차 — 보상 안전 · 초심자 도움 · 쉬운 단계', () => {
  const strong = (stage: number) => {
    const p = at(stage);
    return { ...p, slime: { ...p.slime, upgrades: { attack: 80, maxHp: 80, critChance: 0 } } };
  };

  it('한 번도 깨지 못했으면 1 단계에만 도움이 붙는다', () => {
    const p = at(cfg.dungeon.unlockStage);
    expect(assistActive(p, 1)).toBe(true);
    expect(dungeonInit(p, 1, 1, cfg).assist).toBe(true);
    expect(dungeonInit({ ...p, dungeon: { ...p.dungeon, cleared: 1 } }, 1, 1, cfg).assist).toBe(false);
    expect(assistActive(at(10), 2)).toBe(false);
  });

  it('너무 쉬운 단계는 결정 · 골드가 줄어든다 — 판을 열 때 골드 배율에 들어간다', () => {
    const p = strong(30);
    const easy = cfg.dungeon.rewards.easy;
    const level = [...Array(25).keys()].map((i) => i + 1).find((l) => dungeonPower(p, l, cfg) >= easy.at(-1)!.power)!;
    expect(easyRate(p, level, cfg)).toEqual({ crystals: easy.at(-1)!.crystals, gold: easy.at(-1)!.gold });
    expect(crystalRate(p, level, cfg)).toBe(easy.at(-1)!.crystals);
    const plain = dungeonInit({ ...p, dungeon: { ...p.dungeon } }, level, 1, cfg);
    expect(plain.goldMul).toBeCloseTo(dungeonInit(p, recommendedLevel(p, cfg), 1, cfg).goldMul * easy.at(-1)!.gold);
    const s = summary({ level });
    const rate = crystalRate(p, level, cfg);
    const r = cfg.dungeon.rewards;
    expect(dungeonGains(p, s, cfg).crystals).toBe(Math.round((r.crystalsPerWave * 10 + r.crystalsPerBoss * 2 + r.crystalsClear) * rate));
  });

  it('처치 골드 · 흡수의 기준은 사냥터보다 한 단계 위까지 — 전선을 밀어도 사냥보다 크게 벌지 않는다', () => {
    const p = at(12);
    const far = { ...p, dungeon: { ...p.dungeon, cleared: 30 } };
    expect(dungeonInit(far, 25, 1, cfg).rewardStage).toBe(13);
    expect(dungeonInit(p, 5, 1, cfg).rewardStage).toBe(5 + cfg.dungeon.levels.refStageBase - 1);
  });

  it('첫 클리어 보석은 정수로, 단계가 오를수록 조금씩 많아진다', () => {
    expect(Number.isInteger(firstClearGems(37, cfg))).toBe(true);
    expect(firstClearGems(50, cfg)).toBeGreaterThan(firstClearGems(1, cfg));
  });

  it('같은 판(runId)은 한 번만 반영하고, id 가 없거나 너무 길면 받지 않는다', () => {
    const p = at(cfg.dungeon.unlockStage);
    const s = summary();
    const once = finishDungeon(p, s, cfg);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(once.value.dungeon.claimed).toEqual([s.runId]);
    expect(finishDungeon(once.value, s, cfg)).toEqual({ ok: false, error: { code: 'ALREADY_CLAIMED' } });
    expect(finishDungeon(p, summary({ runId: '' }), cfg)).toEqual({ ok: false, error: { code: 'INVALID_REWARD' } });
    expect(finishDungeon(p, summary({ runId: 'x'.repeat(65) }), cfg)).toEqual({ ok: false, error: { code: 'INVALID_REWARD' } });
    // 기록은 최근 20 판까지
    let q = once.value;
    for (let i = 0; i < 25; i++) {
      const r = finishDungeon(q, summary(), cfg);
      if (r.ok) q = r.value;
    }
    expect(q.dungeon.claimed).toHaveLength(20);
  });

  it('형태의 던전 전투 방식은 세기 보정에 들어간다', () => {
    const p = strong(20);
    const withForm = (form: 'flame' | 'vampire' | 'iron') => dungeonPower({ ...p, slime: { ...p.slime, form, unlockedForms: [form] } }, 10, cfg);
    const base = { ...p, slime: { ...p.slime, form: 'flame' as const, unlockedForms: ['flame' as const] } };
    const ratio = withForm('vampire') / withForm('flame');
    expect(ratio).toBeGreaterThan(0);
    expect(dungeonPower(base, 10, cfg)).toBe(withForm('flame'));
  });
});
