import { describe, expect, it } from 'vitest';
import { snapshotDungeon } from '../core/dungeon/checkpoint';
import { chooseDungeonSkill, createDungeon, stepDungeon } from '../core/dungeon/engine';
import { dungeonInit } from '../core/progression/dungeon';
import { cloneConfig } from '../testing/fixtures';
import { dungeonRunLost, newSaveData, restoreSaveData, SCHEMA_VERSION, toEnvelope } from './saveData';

const cfg = cloneConfig();

/** 늦은 진행 — 저장이 가장 커지는 모양 (용병 · 결제 기록 · 반영한 판 기록이 가득) */
function heavySave() {
  const data = newSaveData(cfg, 1, 'install-heavy');
  const p = data.progress;
  p.gold = 9.87e15;
  p.stage = { highestCleared: 150, current: 151, mode: 'challenge', autoAdvance: true };
  for (const u of cfg.upgrades) p.slime.upgrades[u.id] = u.maxLevel ?? 2000;
  for (const f of cfg.families) {
    p.slime.absorption[f.id] = 123_456_789;
    p.lifetime.kills[f.id] = 987_654;
  }
  p.mercenaries = { owned: Object.fromEntries(cfg.mercenaries.map((m) => [m.id, cfg.balance.gacha.maxLevel])), party: cfg.mercenaries.slice(0, cfg.balance.party.slots).map((m) => m.id) };
  p.purchases.orders = Array.from({ length: 100 }, (_, i) => ({ id: `GPA.3333-4444-5555-${String(i).padStart(5, '0')}`, sku: cfg.shop[0]!.sku }));
  p.dungeon = { ...p.dungeon, cleared: 140, best: Object.fromEntries(Array.from({ length: 141 }, (_, i) => [i + 1, 10])), crystals: 99_999, synergies: ['toxicBlast', 'stormChain', 'scatterBolt', 'flameShield', 'venomVolley'], runs: 5000, claimed: Array.from({ length: 20 }, () => crypto.randomUUID()) };
  // 보스와 부하가 가득한 판을 싸우는 도중에 저장
  const { state } = createDungeon({ ...dungeonInit(p, 140, 9, cfg, crypto.randomUUID()), slime: { ...dungeonInit(p, 140, 9, cfg).slime, maxHp: 1e300, attack: 1, critChance: 0, lifesteal: 0 } }, cfg);
  for (let i = 0; i < 5 && state.phase !== 'fighting'; i++) chooseDungeonSkill(state, state.offer![0]!, cfg);
  Object.assign(state, { wave: 10, wavesCleared: 9 });
  state.queue = [{ defId: cfg.dungeon.bosses.flameLord!.monster, at: state.now, boss: 'flameLord' }, ...Array.from({ length: 6 }, () => ({ defId: 'bat', at: state.now + 100, boss: null }))];
  for (let t = 0; t < 4000; t += 100) stepDungeon(state, 100, cfg);
  data.dungeonRun = snapshotDungeon(state);
  return data;
}

describe('저장 형식 v8 — 진행 중인 던전', () => {
  it('진행 중인 판을 저장 · 복원한다', () => {
    const data = heavySave();
    expect(data.dungeonRun!.monsters.length).toBeGreaterThan(1);
    const back = restoreSaveData(JSON.parse(JSON.stringify(toEnvelope(data, cfg, 2))), cfg)!;
    expect(back.dungeonRun).toEqual(data.dungeonRun);
    expect(back.progress.dungeon.claimed).toEqual(data.progress.dungeon.claimed);
  });

  it('가장 큰 저장도 서버 한도(32KB)의 절반 아래다', () => {
    const size = JSON.stringify(toEnvelope(heavySave(), cfg, 2)).length;
    expect(size).toBeLessThan(16 * 1024);
  });

  it('v7 저장을 v8 로 — 던전 단계 번호를 스테이지 1 칸 기준으로 바꾸고, 진행 중인 판은 없다', () => {
    const v7 = {
      schemaVersion: 7,
      configVersion: '0.9.0',
      savedAt: 1,
      data: {
        installId: 'v7-install',
        createdAt: 1,
        lastActiveAt: 1,
        progress: { stage: { highestCleared: 20, current: 21 }, dungeon: { cleared: 3, best: { 1: 10, 3: 10, 4: 6 }, crystals: 40, research: { jelly: 2 }, synergies: ['toxicBlast'], runs: 7 } },
        settings: {},
      },
    };
    const data = restoreSaveData(v7, cfg)!;
    // 옛 3 단계(스테이지 6) = 새 5 단계 · 옛 4 단계(스테이지 8) = 새 7 단계
    expect(data.progress.dungeon).toMatchObject({ cleared: 5, best: { 1: 10, 5: 10, 7: 6 }, crystals: 40, research: { jelly: 2 }, synergies: ['toxicBlast'], runs: 7, claimed: [] });
    expect(data.dungeonRun).toBeNull();
    expect(SCHEMA_VERSION).toBe(8);
  });

  it('진행 중인 판이 깨져 있으면 그것만 버린다 — 진행은 그대로 읽는다', () => {
    const data = heavySave();
    const env = JSON.parse(JSON.stringify(toEnvelope(data, cfg, 2)));
    env.data.dungeonRun.monsters[0].defId = 'nope';
    const back = restoreSaveData(env, cfg)!;
    expect(back.dungeonRun).toBeNull();
    expect(back.progress.gold).toBe(data.progress.gold);
    expect(dungeonRunLost(env, back)).toBe(true);
    expect(dungeonRunLost(toEnvelope(newSaveData(cfg, 1, 'x'), cfg, 1), newSaveData(cfg, 1, 'x'))).toBe(false);
  });
});
