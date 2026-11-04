import { describe, expect, it } from 'vitest';
import { gameConfig as cfg } from '../../data';
import { dungeonRefStage } from '../dungeon/rules';
import type { DungeonSummary } from '../model/dungeon';
import type { ProgressState } from '../model/progress';
import { applyCommand } from './applyCommand';
import { difficultyOf, dungeonGains, dungeonInit, dungeonOpen, dungeonPower, highestUnlockedLevel, isLevelUnlocked, purchaseResearch, recommendedLevel, researchCost } from './dungeon';
import { createInitialProgress } from './initial';
import { rebirth } from './prestige';

const at = (highestCleared: number, patch: Partial<ProgressState> = {}): ProgressState => {
  const p = createInitialProgress(cfg);
  return { ...p, stage: { ...p.stage, highestCleared, current: highestCleared + 1 }, ...patch };
};

const summary = (s: Partial<DungeonSummary> = {}): DungeonSummary => ({
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
    expect(dungeonPower(strong, level, cfg)).toBeGreaterThanOrEqual(0.9);
    if (level < highestUnlockedLevel(strong, cfg)) expect(dungeonPower(strong, level + 1, cfg)).toBeLessThan(0.9);
    // 단계가 오를수록 세기는 줄고, 구간마다 이름이 붙는다
    expect(dungeonPower(strong, 2, cfg)).toBeLessThan(dungeonPower(strong, 1, cfg));
    expect([difficultyOf(1.5), difficultyOf(1), difficultyOf(0.7), difficultyOf(0.3)]).toEqual(['easy', 'fair', 'hard', 'brutal']);
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
    expect(v.slime.absorption).toMatchObject({ bat: 12, golem: 6 });
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
