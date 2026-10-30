import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../data';
import { createBattle, stepBattle } from '../battle/engine';
import type { ProgressState } from '../model/progress';
import { deriveSlimeStats } from '../stats';
import { applyCommand } from './applyCommand';
import { createInitialProgress } from './initial';
import { adGemsLeft, findMercenary, firstClearGems, mercenaryRate, partyAllies, rollSummon } from './mercenary';

const cfg = gameConfig;

function withGems(gems: number, patch: Partial<ProgressState> = {}): ProgressState {
  return { ...createInitialProgress(cfg), gems, ...patch };
}

function run(p: ProgressState, c: Parameters<typeof applyCommand>[1]): ProgressState {
  const r = applyCommand(p, c, cfg);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe('용병 뽑기', () => {
  it('같은 seed 면 같은 결과, 등급 비율은 70 · 25 · 5 에 가깝다', () => {
    expect(rollSummon(10, 42, cfg)).toEqual(rollSummon(10, 42, cfg));
    const counts = { common: 0, rare: 0, legendary: 0 };
    for (let seed = 1; seed <= 4000; seed++) counts[findMercenary(cfg, rollSummon(1, seed, cfg)[0]!)!.rarity] += 1;
    expect(counts.common / 4000).toBeCloseTo(0.7, 1);
    expect(counts.rare / 4000).toBeCloseTo(0.25, 1);
    expect(counts.legendary / 4000).toBeCloseTo(0.05, 1);
  });

  it('공개 확률 — 용병별 확률의 합이 1', () => {
    expect(cfg.mercenaries.reduce((sum, m) => sum + mercenaryRate(m, cfg), 0)).toBeCloseTo(1, 10);
  });

  it('10회 뽑기는 희귀 이상 하나를 보장한다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(rollSummon(10, seed, cfg).some((id) => findMercenary(cfg, id)!.rarity !== 'common')).toBe(true);
    }
  });

  it('보석을 쓰고, 처음 얻은 용병은 빈 자리에 편성, 겹치면 레벨업', () => {
    const p = run(withGems(1000), { type: 'summon', count: 10, seed: 7 });
    expect(p.gems).toBe(100);
    const ids = rollSummon(10, 7, cfg);
    const unique = [...new Set(ids)];
    expect(Object.keys(p.mercenaries.owned).sort()).toEqual([...unique].sort());
    for (const id of unique) expect(p.mercenaries.owned[id]).toBe(Math.min(cfg.balance.gacha.maxLevel, ids.filter((x) => x === id).length));
    expect(p.mercenaries.party).toEqual(unique.slice(0, cfg.balance.party.slots));
    expect(applyCommand(withGems(99), { type: 'summon', count: 1, seed: 1 }, cfg)).toEqual({ ok: false, error: { code: 'NOT_ENOUGH_GEMS', need: 100, have: 99 } });
  });

  it('최대 레벨 용병이 또 나오면 보석으로 돌려준다', () => {
    const id = rollSummon(1, 3, cfg)[0]!;
    const p = run(withGems(100, { mercenaries: { owned: { [id]: cfg.balance.gacha.maxLevel }, party: [] } }), { type: 'summon', count: 1, seed: 3 });
    expect(p.gems).toBe(cfg.balance.gacha.maxedRefund);
    expect(p.mercenaries.owned[id]).toBe(cfg.balance.gacha.maxLevel);
  });

  it('편성 — 가진 용병만, 겹치지 않게, 자리 수까지', () => {
    const p = withGems(0, { mercenaries: { owned: { pip: 1, moss: 2, goldy: 1 }, party: [] } });
    expect(run(p, { type: 'setParty', party: ['goldy', 'moss'] }).mercenaries.party).toEqual(['goldy', 'moss']);
    for (const party of [['pip', 'pip'], ['wyvern'], ['pip', 'moss', 'goldy']]) {
      expect(applyCommand(p, { type: 'setParty', party }, cfg)).toEqual({ ok: false, error: { code: 'INVALID_PARTY' } });
    }
  });
});

describe('보석 얻기', () => {
  it('광고 보석은 하루 5번, 날이 바뀌면 다시', () => {
    let p = withGems(0);
    for (let i = 0; i < 5; i++) p = run(p, { type: 'claimAdGems', day: '2026-10-30' });
    expect(p.gems).toBe(250);
    expect(adGemsLeft(p, '2026-10-30', cfg)).toBe(0);
    expect(applyCommand(p, { type: 'claimAdGems', day: '2026-10-30' }, cfg)).toEqual({ ok: false, error: { code: 'AD_LIMIT' } });
    expect(run(p, { type: 'claimAdGems', day: '2026-10-31' }).daily).toEqual({ day: '2026-10-31', adGems: 1 });
  });

  it('처음 깬 스테이지만 보석 — 환생 뒤 다시 깨면 없다', () => {
    let p = withGems(0);
    p = run(p, { type: 'stageCleared', stage: 1 });
    expect(p.gems).toBe(firstClearGems(1, cfg));
    const again = run(p, { type: 'stageCleared', stage: 1 });
    expect(again.gems).toBe(p.gems);
    const reborn = { ...p, gems: 0, stage: { ...p.stage, highestCleared: 0, current: 1 }, prestige: { ...p.prestige, bestStage: 7 } };
    expect(run(reborn, { type: 'stageCleared', stage: 5 }).gems).toBe(0);
    expect(run(reborn, { type: 'stageCleared', stage: 8 }).gems).toBe(firstClearGems(8, cfg));
  });
});

describe('지원 공격', () => {
  it('편성한 용병이 슬라임과 함께 몬스터를 때려 더 빨리 잡는다', () => {
    const slime = deriveSlimeStats({ upgrades: { attack: 5 } }, cfg);
    const kills = (allies: ReturnType<typeof partyAllies>) => {
      const b = createBattle({ stageId: 3, mode: 'farm', slime, seed: 1, allies }, cfg);
      return stepBattle(b, 60_000, cfg).filter((e) => e.type === 'monsterKilled').length;
    };
    const allies = partyAllies({ owned: { goldy: 3, wyvern: 1 }, party: ['goldy', 'wyvern'] }, cfg);
    expect(allies.map((a) => a.id)).toEqual(['goldy', 'wyvern']);
    expect(allies[0]!.power).toBeCloseTo(0.8 * (1 + 0.15 * 2));
    expect(kills(allies)).toBeGreaterThan(kills([]));
  });
});
