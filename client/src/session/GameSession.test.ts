import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../core/model/config';
import { createInitialProgress } from '../core/progression/initial';
import { MemorySaveRepository } from '../persistence/MemorySaveRepository';
import { createGameStore } from '../store/gameStore';
import { arena, cloneConfig } from '../testing/fixtures';
import { GameSession, type SessionEvent } from './GameSession';
import { newSaveData, toEnvelope } from './saveData';
import type { SaveRepository } from './ports';

function setup(cfg: GameConfig = cloneConfig(), repo: SaveRepository = new MemorySaveRepository()) {
  const clock = { now: 0 };
  let visibility: ((visible: boolean) => void) | null = null;
  const store = createGameStore(createInitialProgress(cfg));
  const session = new GameSession({
    config: cfg,
    store,
    repo,
    platform: {
      now: () => clock.now,
      onVisibilityChange: (l) => {
        visibility = l;
        return () => (visibility = null);
      },
    },
    seed: 1,
  });
  const events: SessionEvent[] = [];
  session.onEvents((e) => events.push(...e));
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      clock.now += 100;
      session.tick(100);
    }
  };
  return { session, store, repo, clock, events, advance, hide: () => visibility?.(false), show: () => visibility?.(true) };
}

describe('GameSession', () => {
  it('새 게임을 시작하면 바로 저장하고 1 스테이지 도전을 연다', async () => {
    const { session, store, repo } = setup();
    expect(await session.start()).toBe('new');
    expect((repo as MemorySaveRepository).saveCount).toBe(1);
    expect(store.getState().ready).toBe(true);
    expect(session.view()).toMatchObject({ stageId: 1, mode: 'challenge' });
  });

  it('처치하면 스토어의 골드 · 처치 수 · HUD 가 갱신된다', async () => {
    const { session, store, advance } = setup();
    await session.start();
    advance(10_000);
    const s = store.getState();
    expect(s.progress.gold).toBeGreaterThan(0);
    expect(s.progress.lifetime.kills.bat).toBeGreaterThan(0);
    expect(s.hud.kills).toBe(s.progress.lifetime.kills.bat);
  });

  it('강화하면 진행 중인 전투의 공격력이 즉시 바뀐다', async () => {
    const { session } = setup();
    await session.start();
    expect(session.purchaseUpgrade('attack')).toMatchObject({ ok: false, error: { code: 'NOT_ENOUGH_GOLD' } });
    session.dispatch({ type: 'grantBattleReward', gold: 100, kills: {} });
    expect(session.purchaseUpgrade('attack').ok).toBe(true);
    expect(session.view()?.slime.stats.attack).toBe(14); // round(12 + 1.5)
  });

  it('최대 HP 를 강화하면 전투 중 HP 비율을 유지한 채 늘어난다', async () => {
    const { session } = setup();
    await session.start();
    session.dispatch({ type: 'grantBattleReward', gold: 100, kills: {} });
    const view = session.view()!;
    (view.slime as { hp: number }).hp = 60; // 120 중 절반
    expect(session.purchaseUpgrade('maxHp').ok).toBe(true);
    expect(session.view()?.slime).toMatchObject({ hp: 68, stats: { maxHp: 135 } });
  });

  it('처치하면 흡수가 쌓이고, 특성 단계가 오르면 진행 중인 전투에 바로 적용된다', async () => {
    const { session, store, events, advance } = setup();
    await session.start();
    advance(10_000);
    expect(store.getState().progress.slime.absorption.bat).toBeGreaterThan(0);
    expect(session.view()?.slime.stats.lifesteal).toBe(0);

    session.dispatch({ type: 'grantBattleReward', gold: 0, kills: {}, absorb: { bat: 60 } });
    expect(session.view()?.slime.stats.lifesteal).toBe(0.01);
    expect(events).toContainEqual({ type: 'traitTierUp', family: 'bat', tier: 1 });
    expect(events.some((e) => e.type === 'levelUp')).toBe(true);
  });

  it('클리어하면 다음 스테이지 전투를 새로 연다', async () => {
    const next = { id: 2, chapter: 1, name: '다음', scene: 'duskCave', spawns: [{ monster: 'dummy', weight: 1 }], killsToClear: 3, overrides: { hp: 10, atk: 1, goldPerKill: 1 } };
    const { session, store, events, advance } = setup(arena({ killsToClear: 3, hp: 10, atk: 1, extraStages: [next] }));
    await session.start();
    advance(10_000);
    expect(store.getState().progress.stage.highestCleared).toBeGreaterThanOrEqual(1);
    expect(events.find((e) => e.type === 'battleStarted')).toMatchObject({ stageId: 2, mode: 'challenge' });
  });

  it('도전에 실패하면 최고 클리어 스테이지 사냥으로 후퇴한다', async () => {
    const deadly = { id: 2, chapter: 1, name: '함정', scene: 'duskCave', spawns: [{ monster: 'dummy', weight: 1 }], killsToClear: 1, overrides: { hp: 99_999, atk: 99_999, goldPerKill: 1 } };
    const { session, store, events, advance } = setup(arena({ killsToClear: 1, hp: 10, atk: 1, extraStages: [deadly] }));
    await session.start();
    advance(10_000);
    expect(store.getState().progress.stage).toEqual({ highestCleared: 1, current: 1, mode: 'farm', autoAdvance: false });
    expect(store.getState().hud.mode).toBe('farm');
    expect(events.filter((e) => e.type === 'challengeFailed')).toHaveLength(1);
  });

  it('저장은 10초 간격으로 모으고, 화면이 가려지면 즉시 저장한다', async () => {
    const { session, repo, advance, hide } = setup();
    const memory = repo as MemorySaveRepository;
    await session.start();
    advance(5000);
    expect(memory.saveCount).toBe(1);
    advance(5000);
    expect(memory.saveCount).toBe(2);
    hide();
    await Promise.resolve();
    expect(memory.saveCount).toBe(3);
  });

  it('저장한 진행을 다음 세션에서 이어간다', async () => {
    const repo = new MemorySaveRepository();
    const first = setup(cloneConfig(), repo);
    await first.session.start();
    first.advance(20_000);
    await first.session.saveNow();
    const saved = first.store.getState().progress;

    const second = setup(cloneConfig(), repo);
    expect(await second.session.start()).toBe('restored');
    expect(second.store.getState().progress).toEqual(saved);
    expect(second.session.view()).toMatchObject({ stageId: saved.stage.current, mode: saved.stage.mode });
  });

  it('진화하면 형태가 바뀌어 전투에 반영되고, 연출 2초 동안 전투가 멈춘다', async () => {
    const { session, store, events, advance } = setup();
    await session.start();
    const p = store.getState().progress;
    store.setState({ progress: { ...p, slime: { ...p.slime, absorption: { bat: 200, golem: 0, fire: 0 } }, stage: { ...p.stage, highestCleared: 3 } } });

    expect(session.evolve('vampire').ok).toBe(true);
    expect(store.getState().progress.slime).toMatchObject({ form: 'vampire', unlockedForms: ['vampire'] });
    expect(session.view()!.slime.stats.lifesteal).toBeGreaterThanOrEqual(0.12);
    expect(events.some((e) => e.type === 'evolved' && e.form === 'vampire')).toBe(true);

    const frozenAt = session.view()!.now;
    advance(1900);
    expect(session.view()!.now).toBe(frozenAt);
    advance(300);
    expect(session.view()!.now).toBeGreaterThan(frozenAt);
    expect(session.evolve('vampire')).toEqual({ ok: false, error: { code: 'ALREADY_CURRENT' } });
  });
});

describe('오프라인 보상', () => {
  const HOUR = 3_600_000;

  /** 1시간 전에 2 스테이지를 사냥하다 떠난 저장 */
  function savedAway() {
    const cfg = cloneConfig();
    const repo = new MemorySaveRepository();
    const data = newSaveData(cfg, 0, 'away');
    data.progress.stage = { highestCleared: 2, current: 2, mode: 'farm', autoAdvance: true };
    data.progress.slime.upgrades = { attack: 10, maxHp: 10, critChance: 0 };
    repo.saved = toEnvelope(data, cfg, 0);
    const ctx = setup(cfg, repo);
    ctx.clock.now = HOUR;
    return ctx;
  }

  it('저장 후 1시간 지나 시작하면 기본 보상을 바로 받고, 광고 보너스는 한 번만', async () => {
    const { session, store, events } = savedAway();
    await session.start();
    const notice = store.getState().offline!;
    expect(notice.reward.awayMs).toBe(HOUR);
    expect(store.getState().progress.gold).toBe(notice.reward.gold);
    expect(store.getState().progress.slime.absorption.golem).toBe(notice.reward.absorb.golem);
    expect(events.some((e) => e.type === 'offlineReward' && !e.bonus)).toBe(true);

    expect(session.claimOfflineBonus()).toBe(true);
    expect(store.getState().progress.gold).toBe(notice.reward.gold * 2);
    expect(store.getState().offline?.bonus).toBe('claimed');
    expect(session.claimOfflineBonus()).toBe(false);
    session.dismissOffline();
    expect(store.getState().offline).toBeNull();
  });

  it('화면이 가려졌다 2분 뒤 돌아오면 그 사이 보상을 준다. 1분 미만이면 없다', async () => {
    const { session, store, clock, hide, show } = setup();
    await session.start();
    hide();
    clock.now += 30_000;
    show();
    expect(store.getState().offline).toBeNull();
    hide();
    clock.now += 120_000;
    show();
    expect(store.getState().offline?.reward.awayMs).toBe(120_000);
  });
});

describe('환생', () => {
  it('환생하면 1 스테이지 도전부터 다시 열고, 정수 강화는 진행 중인 전투에 바로 반영된다', async () => {
    const { session, store, events } = setup();
    await session.start();
    const p = store.getState().progress;
    store.setState({ progress: { ...p, gold: 999, stage: { highestCleared: 10, current: 10, mode: 'farm', autoAdvance: true } } });
    expect(session.rebirth().ok).toBe(true);
    const after = store.getState().progress;
    expect(after).toMatchObject({ gold: 0, stage: { highestCleared: 0, current: 1, mode: 'challenge' }, prestige: { count: 1, bestStage: 10 } });
    expect(session.view()).toMatchObject({ stageId: 1, mode: 'challenge' });
    expect(events.some((e) => e.type === 'rebirth' && e.count === 1 && e.essence === after.prestige.essence)).toBe(true);

    const attack = session.view()!.slime.stats.attack;
    expect(session.purchaseLegacy('might').ok).toBe(true);
    expect(session.view()!.slime.stats.attack).toBe(Math.round(attack * 1.1));
    expect(session.view()!.goldMul).toBe(1);
  });
});

describe('결제 지급', () => {
  it('결제한 주문을 지급하고 저장한다. 같은 주문이 다시 와도 한 번만', async () => {
    const { session, store, repo, events } = setup();
    await session.start();
    const before = store.getState().progress.gems;
    expect(await session.grantOrder('gems_1100', 'order-1')).toBe(true);
    expect(store.getState().progress.gems).toBe(before + 1100);
    expect((repo as MemorySaveRepository).saved?.data).toMatchObject({ progress: { gems: before + 1100 } });
    expect(await session.grantOrder('gems_1100', 'order-1')).toBe(true);
    expect(store.getState().progress.gems).toBe(before + 1100);
    expect(events.filter((e) => e.type === 'purchased')).toHaveLength(1);
  });

  it('저장하지 못하면 false — 스토어가 미지급으로 남겨 다음에 다시 준다', async () => {
    const repo = new MemorySaveRepository();
    const { session } = setup(cloneConfig(), repo);
    await session.start();
    repo.save = () => Promise.reject(new Error('disk full'));
    expect(await session.grantOrder('gems_300', 'order-2')).toBe(false);
  });

  it('다른 기기의 저장으로 바꿔도 이 기기에서 결제한 보석은 남는다', async () => {
    const cfg = cloneConfig();
    const { session, store } = setup(cfg);
    await session.start();
    await session.grantOrder('gems_3800', 'here');
    const remote = newSaveData(cfg, 0, 'other-device');
    remote.progress = { ...remote.progress, gems: 7, lifetime: { ...remote.progress.lifetime, goldEarned: 1e9 } };
    expect(session.adopt(toEnvelope(remote, cfg, 0))).toBe(true);
    expect(store.getState().progress.gems).toBe(7 + 3800);
    expect(store.getState().progress.lifetime.goldEarned).toBe(1e9);
  });
});
