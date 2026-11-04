import { describe, expect, it } from 'vitest';
import { finishDungeon } from '../core/progression/dungeon';
import type { GameConfig } from '../core/model/config';
import type { DungeonState } from '../core/model/dungeon';
import { createInitialProgress } from '../core/progression/initial';
import { MemorySaveRepository } from '../persistence/MemorySaveRepository';
import { createGameStore } from '../store/gameStore';
import { cloneConfig } from '../testing/fixtures';
import { GameSession, type SessionEvent } from './GameSession';
import type { SaveEnvelope } from './ports';

/** 같은 저장소로 몇 번이고 다시 켤 수 있는 세션 */
function device(cfg: GameConfig = cloneConfig(), repo = new MemorySaveRepository()) {
  const clock = { now: 1_000_000 };
  let visibility: ((visible: boolean) => void) | null = null;
  const store = createGameStore(createInitialProgress(cfg));
  const session = new GameSession({
    config: cfg,
    store,
    repo,
    platform: { now: () => clock.now, onVisibilityChange: (l) => ((visibility = l), () => (visibility = null)) },
    seed: 3,
  });
  const events: SessionEvent[] = [];
  session.onEvents((e) => events.push(...e));
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      clock.now += 100;
      session.tick(100);
    }
  };
  return { cfg, session, store, repo, clock, events, advance, hide: () => visibility?.(false), show: () => visibility?.(true) };
}

/** 던전이 열린 진행으로 시작 */
async function opened(cfg?: GameConfig, repo?: MemorySaveRepository) {
  const d = device(cfg, repo);
  await d.session.start();
  const p = d.store.getState().progress;
  d.store.setState({ progress: { ...p, stage: { ...p.stage, highestCleared: d.cfg.dungeon.unlockStage, current: d.cfg.dungeon.unlockStage + 1 } } });
  return d;
}

/** 앱을 끄고(메모리 버림) 같은 저장소로 다시 켠다 */
async function restart(prev: { repo: MemorySaveRepository; cfg: GameConfig; session: GameSession }) {
  prev.session.dispose();
  const d = device(prev.cfg, prev.repo);
  await d.session.start();
  return d;
}

const view = (s: GameSession) => s.dungeonView() as DungeonState;
const pick = (d: { session: GameSession; store: ReturnType<typeof createGameStore> }) => d.session.chooseSkill(d.store.getState().dungeon!.offer![0]!);
const savedRun = (repo: MemorySaveRepository) => (repo.saved!.data as { dungeonRun: DungeonState | null }).dungeonRun;

describe('던전 체크포인트 — 중단 · 재실행', () => {
  it('싸우는 중에 화면을 떠났다가 앱이 꺼져도, 다시 켜면 그 순간의 웨이브 · HP · 스킬 · 필살기로 이어진다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(12_000);
    const before = structuredClone(view(a.session));
    expect(before.phase).toBe('fighting');
    a.hide();
    expect(a.store.getState().dungeon?.paused).toBe('background');

    const b = await restart(a);
    expect(b.store.getState().dungeonResume).toMatchObject({ level: 1, wave: before.wave, skills: before.skills });
    expect(b.events.some((e) => e.type === 'dungeonRestored')).toBe(true);
    // 고르기 전에는 사냥터도 멈춘다
    const fieldNow = b.session.view()!.now;
    b.advance(2000);
    expect(b.session.view()!.now).toBe(fieldNow);

    expect(b.session.resumeSavedDungeon()).toBe(true);
    expect(view(b.session)).toEqual(before);
    expect(b.store.getState().dungeon).toMatchObject({ wave: before.wave, paused: 'background' });
    // 멈춘 채로 열린다 — 계속하기 전까지 시간이 흐르지 않고 필살기 · 대상 지정도 안 된다
    b.advance(3000);
    expect(view(b.session).now).toBe(before.now);
    expect(b.session.useUltimate()).toBe(false);
    expect(b.session.focusMonster(view(b.session).monsters[0]?.seq ?? null)).toBe(false);
    b.session.continueDungeon();
    b.advance(1000);
    expect(view(b.session).now).toBeGreaterThan(before.now);
  });

  it('화면 전환 없이 꺼져도 마지막 안정된 경계(웨이브 시작)부터 이어진다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    const atWaveStart = structuredClone(view(a.session));
    expect(savedRun(a.repo)).toMatchObject({ wave: 1, phase: 'fighting', monsters: [], now: atWaveStart.now });
    a.advance(8000);
    expect(view(a.session).monsters.length).toBeGreaterThan(0);

    const b = await restart(a);
    b.session.resumeSavedDungeon();
    expect(view(b.session)).toEqual(atWaveStart);
  });

  it('웨이브 돌파 · 다음 선택 · 다시 뽑기마다 저장하고, 고를 차례면 멈추지 않고 그대로 연다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    expect(savedRun(a.repo)).toMatchObject({ phase: 'choosing', wave: 0 });
    a.session.rerollSkills();
    expect(savedRun(a.repo)).toMatchObject({ phase: 'choosing', rerolls: view(a.session).rerolls, offer: view(a.session).offer });

    const b = await restart(a);
    b.session.resumeSavedDungeon();
    expect(b.store.getState().dungeon).toMatchObject({ phase: 'choosing', paused: null, rerolls: 0 });
  });

  it('이어 하지 않고 포기하면 그때까지의 보상을 받고 체크포인트가 지워진다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(25_000);
    a.hide();
    const kills = view(a.session).kills;
    const b = await restart(a);
    const gold = b.store.getState().progress.gold;
    b.session.abandonSavedDungeon();
    const result = b.store.getState().dungeonResult!;
    expect(result).toMatchObject({ abandoned: true, kills, claimed: true });
    expect(b.store.getState().progress.gold).toBe(gold + result.summary.rewards.gold);
    expect(savedRun(b.repo)).toBeNull();
    expect(b.store.getState().dungeonResume).toBeNull();
  });
});

describe('던전 보상 — 중복 지급 방지', () => {
  it('결과를 반영하면 같은 저장에서 체크포인트가 지워진다 — 다시 켜도 같은 판을 또 받을 수 없다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(20_000);
    a.session.abandonDungeon();
    const after = a.store.getState().progress;
    expect(savedRun(a.repo)).toBeNull();
    expect(after.dungeon.claimed).toEqual([view(a.session).id]);

    const b = await restart(a);
    expect(b.store.getState().dungeonResume).toBeNull();
    expect(b.store.getState().progress.gold).toBe(after.gold);
    expect(b.store.getState().progress.dungeon.runs).toBe(1);
  });

  it('결과 화면에서 버튼을 여러 번 눌러도 — 포기 · 나가기 · 다시 도전 — 보상은 한 번, 새 판도 하나', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(15_000);
    a.session.abandonDungeon();
    a.session.abandonDungeon();
    const gold = a.store.getState().progress.gold;
    expect(a.store.getState().progress.dungeon.runs).toBe(1);
    a.session.closeDungeon(true);
    a.session.closeDungeon(true);
    a.session.closeDungeon();
    expect(a.store.getState().dungeon).toMatchObject({ wave: 0, phase: 'choosing' });
    expect(a.store.getState().progress).toMatchObject({ gold, dungeon: { runs: 1 } });
  });

  it('같은 판(runId)은 두 번 반영하지 않는다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(15_000);
    a.session.abandonDungeon();
    const { summary } = a.store.getState().dungeonResult!;
    const p = a.store.getState().progress;
    expect(finishDungeon(p, summary, a.cfg)).toEqual({ ok: false, error: { code: 'ALREADY_CLAIMED' } });
  });

  it('다른 기기가 이미 끝낸 판이 저장에 남아 있으면 — 이어 해도 보상 없이 결과만 보여 준다', async () => {
    // 기기 A 가 판을 저장해 두고(서버 사본), 기기 B 가 그 사본으로 판을 끝내 보상을 받았다
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(15_000);
    a.hide();
    const withRun = structuredClone(a.repo.saved!) as SaveEnvelope;
    const b = await opened(a.cfg, new MemorySaveRepository());
    expect(b.session.adopt(withRun)).toBe(true);
    b.session.abandonSavedDungeon();
    const claimed = b.store.getState().progress;
    expect(claimed.dungeon.claimed).toHaveLength(1);
    // 엇갈린 동기화로 「B 의 진행 + A 의 체크포인트」가 합쳐진 저장이 왔다
    const mixed = structuredClone(b.repo.saved!) as SaveEnvelope;
    (mixed.data as { dungeonRun: unknown }).dungeonRun = (withRun.data as { dungeonRun: unknown }).dungeonRun;
    const c = await opened(a.cfg, new MemorySaveRepository());
    c.session.adopt(mixed);
    c.session.abandonSavedDungeon();
    expect(c.store.getState().dungeonResult).toMatchObject({ claimed: false, gains: { crystals: 0, firstClearGems: 0 } });
    expect(c.store.getState().progress.gold).toBe(claimed.gold);
    expect(c.store.getState().progress.dungeon.runs).toBe(claimed.dungeon.runs);
  });

  it('서버의 진행으로 바꾸면 이 기기에서 하던 판은 버린다 — 받아 온 진행에 보상이 한 번 더 들어가지 않게', async () => {
    const a = await opened();
    const remote = structuredClone(a.session.snapshot());
    a.session.startDungeon(1);
    pick(a);
    a.advance(15_000);
    expect(a.session.adopt(remote)).toBe(true);
    expect(a.session.dungeonView()).toBeNull();
    expect(a.store.getState()).toMatchObject({ dungeon: null, dungeonResult: null, dungeonResume: null });
    expect(a.events.at(-1)?.type === 'battleStarted' || a.events.some((e) => e.type === 'dungeonClosed')).toBe(true);
    expect(savedRun(a.repo)).toBeNull();
  });
});

describe('손상된 저장', () => {
  it('체크포인트가 깨져 있어도 게임은 시작하고 진행은 그대로 — 판만 버리고 알린다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(10_000);
    a.hide();
    const env = a.repo.saved!;
    const run = (env.data as { dungeonRun: Record<string, unknown> }).dungeonRun;
    run.slime = { hp: 'lots' };
    const gold = (env.data as { progress: { gold: number } }).progress.gold;
    const b = await restart(a);
    expect(b.store.getState().dungeonResume).toBeNull();
    expect(b.events.some((e) => e.type === 'dungeonRunLost')).toBe(true);
    expect(b.store.getState().progress.gold).toBeGreaterThanOrEqual(gold);
    expect(b.session.startDungeon(1)).toBe(true);
  });

  it('엔진이 더 진행할 수 없는 상태가 되면 그 판을 끝내고 게임은 계속된다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    a.advance(5000);
    // 피해 없이 같은 시각에 끝없이 공격 — 엔진이 행동 수 상한에 걸린다
    view(a.session).monsters.forEach((m) => Object.assign(m.stats, { attackIntervalMs: 0, attack: 0, burn: null }));
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      a.advance(1000);
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
    expect(a.store.getState().dungeonResult).toMatchObject({ abandoned: true });
    a.session.closeDungeon();
    a.advance(1000);
    expect(a.session.view()!.now).toBeGreaterThan(0);
  });
});

describe('일시정지 · 첫 내려찍기 가르침', () => {
  it('멈추면 시간이 흐르지 않고, 계속하면 이어진다. 고르는 중에는 멈출 필요가 없다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    expect(a.session.pauseDungeon()).toBe(false);
    pick(a);
    a.advance(3000);
    expect(a.session.pauseDungeon()).toBe(true);
    const now = view(a.session).now;
    a.advance(5000);
    expect(view(a.session).now).toBe(now);
    a.session.continueDungeon();
    a.advance(500);
    expect(view(a.session).now).toBeGreaterThan(now);
  });

  it('처음 보는 내려찍기 — 필살기가 차 있으면 멈추고 짚어 준다. 쓰면 끊고 다시 진행하며 안내를 마친다', async () => {
    const a = await opened();
    a.session.startDungeon(1);
    pick(a);
    // 4 웨이브를 깬 셈 치고 보스 웨이브로
    const s = view(a.session);
    Object.assign(s, { phase: 'waveClear', wave: 4, wavesCleared: 4, phaseUntil: s.now, monsters: [], queue: [] });
    for (let i = 0; i < 100 && a.store.getState().dungeon?.phase !== 'choosing'; i++) a.advance(100);
    pick(a);
    for (let i = 0; i < 200 && !a.store.getState().dungeon?.paused; i++) a.advance(100);
    expect(a.store.getState().dungeon).toMatchObject({ paused: 'teach', casting: 'smash' });
    const now = view(a.session).now;
    a.advance(3000);
    expect(view(a.session).now).toBe(now);
    expect(a.session.useUltimate()).toBe(true);
    expect(a.store.getState().dungeon?.paused).toBeNull();
    expect(a.store.getState().settings.tutorial).toContain('block');
    expect(a.store.getState().toast?.text).toContain('차단');
    expect(view(a.session).record.countered.smash).toBe(1);
  });
});
