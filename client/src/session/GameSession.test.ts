import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../core/model/config';
import { createInitialProgress } from '../core/progression/initial';
import { MemorySaveRepository } from '../persistence/MemorySaveRepository';
import { createGameStore } from '../store/gameStore';
import { arena, cloneConfig } from '../testing/fixtures';
import { GameSession, type SessionEvent } from './GameSession';
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
  return { session, store, repo, clock, events, advance, hide: () => visibility?.(false) };
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
    advance(5000);
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
    expect(session.view()?.slime.stats.attack).toBe(15);
  });

  it('최대 HP 를 강화하면 전투 중 HP 비율을 유지한 채 늘어난다', async () => {
    const { session } = setup();
    await session.start();
    session.dispatch({ type: 'grantBattleReward', gold: 100, kills: {} });
    const view = session.view()!;
    (view.slime as { hp: number }).hp = 60; // 120 중 절반
    expect(session.purchaseUpgrade('maxHp').ok).toBe(true);
    expect(session.view()?.slime).toMatchObject({ hp: 73, stats: { maxHp: 145 } });
  });

  it('처치하면 흡수가 쌓이고, 특성 단계가 오르면 진행 중인 전투에 바로 적용된다', async () => {
    const { session, store, events, advance } = setup();
    await session.start();
    advance(5000);
    expect(store.getState().progress.slime.absorption.bat).toBeGreaterThan(0);
    expect(session.view()?.slime.stats.lifesteal).toBe(0);

    session.dispatch({ type: 'grantBattleReward', gold: 0, kills: {}, absorb: { bat: 60 } });
    expect(session.view()?.slime.stats.lifesteal).toBe(0.01);
    expect(events).toContainEqual({ type: 'traitTierUp', family: 'bat', tier: 1 });
    expect(events.some((e) => e.type === 'levelUp')).toBe(true);
  });

  it('클리어하면 다음 스테이지 전투를 새로 연다', async () => {
    const { session, store, events, advance } = setup();
    await session.start();
    advance(60_000);
    expect(store.getState().progress.stage.highestCleared).toBeGreaterThanOrEqual(1);
    expect(events.find((e) => e.type === 'battleStarted')).toMatchObject({ stageId: 2, mode: 'challenge' });
  });

  it('도전에 실패하면 최고 클리어 스테이지 사냥으로 후퇴한다', async () => {
    const deadly = { id: 2, chapter: 1, name: '함정', spawns: [{ monster: 'dummy', weight: 1 }], killsToClear: 1, overrides: { hp: 99_999, atk: 99_999, goldPerKill: 1 } };
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
});
