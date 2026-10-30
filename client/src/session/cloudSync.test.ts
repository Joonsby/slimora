import { describe, expect, it } from 'vitest';
import { MemorySaveRepository } from '../persistence/MemorySaveRepository';
import { createInitialProgress } from '../core/progression/initial';
import { createGameStore } from '../store/gameStore';
import { cloneConfig } from '../testing/fixtures';
import { CLOUD_INTERVAL_MS, CloudSync } from './cloudSync';
import { GameSession } from './GameSession';
import type { CloudPutResult, CloudSave, CloudSaveStore, SaveEnvelope } from './ports';
import { newSaveData, toEnvelope, type SaveData } from './saveData';

const cfg = cloneConfig();

/** slimora-api 와 같은 규칙의 서버 저장: version 이 맞아야 저장되고, 낮은 형식으로는 덮어쓸 수 없다 */
class FakeCloud implements CloudSaveStore {
  stored: CloudSave | null = null;
  offline = false;
  saves: { urgent: boolean }[] = [];

  async load(): Promise<CloudSave | null> {
    if (this.offline) throw new Error('offline');
    return structuredClone(this.stored);
  }

  async save(envelope: SaveEnvelope, baseVersion: number, urgent: boolean): Promise<CloudPutResult> {
    if (this.offline) throw new Error('offline');
    this.saves.push({ urgent });
    const current = this.stored;
    if (current && current.envelope.schemaVersion > envelope.schemaVersion) return { status: 'outdated' };
    if ((current?.version ?? 0) !== baseVersion) return { status: 'conflict', current: structuredClone(current) };
    this.stored = { envelope: structuredClone(envelope), version: baseVersion + 1 };
    return { status: 'ok', version: this.stored.version };
  }

  /** 다른 기기가 저장한 것처럼 바꾼다 */
  putFromOtherDevice(goldEarned: number, schemaVersion?: number): void {
    const env = otherDevice(goldEarned);
    this.stored = { envelope: schemaVersion ? { ...env, schemaVersion } : env, version: (this.stored?.version ?? 0) + 1 };
  }
}

function otherDevice(goldEarned: number): SaveEnvelope {
  const data: SaveData = newSaveData(cfg, 0, 'other-device');
  data.progress.gold = goldEarned;
  data.progress.lifetime.goldEarned = goldEarned;
  data.progress.stage = { highestCleared: 3, current: 3, mode: 'farm', autoAdvance: true };
  return toEnvelope(data, cfg, 0);
}

function setup(cloud = new FakeCloud()) {
  const clock = { now: 0 };
  const visibility = new Set<(visible: boolean) => void>();
  const platform = {
    now: () => clock.now,
    onVisibilityChange: (l: (visible: boolean) => void) => {
      visibility.add(l);
      return () => visibility.delete(l);
    },
  };
  const store = createGameStore(createInitialProgress(cfg));
  const repo = new MemorySaveRepository();
  const session = new GameSession({ config: cfg, store, repo, platform, seed: 1 });
  let adopted = 0;
  const sync = new CloudSync({ cloud, session, platform, onAdopted: () => (adopted += 1) });
  const advance = async (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      clock.now += 100;
      session.tick(100);
    }
    await settle();
  };
  const hide = async () => {
    for (const l of visibility) l(false);
    await settle();
  };
  return { cloud, session, store, repo, sync, advance, hide, adopted: () => adopted };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const goldEarned = (env: SaveEnvelope | undefined) => (env?.data as SaveData).progress.lifetime.goldEarned;

describe('서버 저장 — 시작할 때 맞추기', () => {
  it('서버에 저장이 없으면 기기 저장을 올린다', async () => {
    const { session, sync, cloud } = setup();
    await session.start();
    expect(await sync.start()).toBe('uploaded');
    expect(cloud.stored?.version).toBe(1);
    expect((cloud.stored?.envelope.data as SaveData).installId).toBe((session.snapshot().data as SaveData).installId);
  });

  it('서버가 더 진행했으면 받아와 바꾸고 그 스테이지를 연다 (새 기기 · 재설치)', async () => {
    const { session, sync, cloud, store, repo, adopted } = setup();
    cloud.putFromOtherDevice(500);
    await session.start();
    expect(await sync.start()).toBe('adopted');
    await settle();
    expect(store.getState().progress.lifetime.goldEarned).toBe(500);
    expect(session.view()).toMatchObject({ stageId: 3, mode: 'farm' });
    expect(goldEarned(repo.saved ?? undefined)).toBe(500);
    expect(adopted()).toBe(1);
    expect(cloud.saves).toHaveLength(0);
  });

  it('기기가 더 진행했으면 서버 version 위에 덮어쓴다', async () => {
    const { session, sync, cloud, advance, store } = setup();
    await session.start();
    await advance(5000);
    cloud.putFromOtherDevice(1);
    cloud.stored!.version = 4;
    expect(await sync.start()).toBe('uploaded');
    expect(cloud.stored?.version).toBe(5);
    expect(goldEarned(cloud.stored?.envelope)).toBe(store.getState().progress.lifetime.goldEarned);
  });

  it('진행이 같으면 아무것도 하지 않는다', async () => {
    const { session, sync, cloud } = setup();
    cloud.putFromOtherDevice(0);
    await session.start();
    expect(await sync.start()).toBe('same');
    expect(cloud.saves).toHaveLength(0);
  });

  it('서버에 이 빌드보다 새 형식의 저장이 있으면 받지도 덮어쓰지도 않는다', async () => {
    const { session, sync, cloud, hide } = setup();
    cloud.putFromOtherDevice(500, 99);
    await session.start();
    expect(await sync.start()).toBe('outdated');
    await hide();
    expect(cloud.saves).toHaveLength(0);
    expect(cloud.stored?.envelope.schemaVersion).toBe(99);
  });
});

describe('서버 저장 — 플레이 중', () => {
  it(`최대 ${CLOUD_INTERVAL_MS / 1000}초 간격으로 올리고, 화면이 가려지면 바로 keepalive 로 올린다`, async () => {
    const { session, sync, cloud, advance, hide } = setup();
    await session.start();
    await sync.start();
    expect(cloud.saves).toHaveLength(1);
    await advance(20_000); // 기기 저장은 10초마다 — 서버는 아직
    expect(cloud.saves).toHaveLength(1);
    await advance(15_000);
    expect(cloud.saves).toHaveLength(2);
    await hide();
    expect(cloud.saves).toHaveLength(3);
    expect(cloud.saves.at(-1)).toEqual({ urgent: true });
  });

  it('다른 기기가 먼저 저장했으면 더 진행한 쪽을 남긴다', async () => {
    const { session, sync, cloud, advance, hide, store } = setup();
    await session.start();
    await sync.start();
    await advance(5000);

    // 덜 진행한 기기가 끼어들었다 → 이 기기 진행으로 덮어쓴다
    cloud.putFromOtherDevice(1);
    await hide();
    expect(goldEarned(cloud.stored?.envelope)).toBe(store.getState().progress.lifetime.goldEarned);

    // 더 진행한 기기가 끼어들었다 → 그 진행으로 바꾼다
    cloud.putFromOtherDevice(1_000_000);
    await hide();
    expect(store.getState().progress.lifetime.goldEarned).toBe(1_000_000);
    expect(session.view()).toMatchObject({ stageId: 3 });
  });

  it('서버에 닿지 않으면 기기에만 저장하고, 다음 저장 때 다시 맞춘다', async () => {
    const { session, sync, cloud, advance } = setup();
    cloud.offline = true;
    await session.start();
    expect(await sync.start()).toBe('failed');
    cloud.offline = false;
    await advance(CLOUD_INTERVAL_MS + 1000);
    expect(cloud.stored?.version).toBe(1);
  });
});
