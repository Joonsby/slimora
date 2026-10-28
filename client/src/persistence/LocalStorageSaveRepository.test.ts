import { describe, expect, it } from 'vitest';
import type { SaveEnvelope } from '../session/ports';
import { CORRUPT_KEY, LocalStorageSaveRepository, PREV_KEY, SAVE_KEY } from './LocalStorageSaveRepository';
import { createMemoryStorage } from './MemorySaveRepository';

const envelope = (gold: number): SaveEnvelope => ({ schemaVersion: 1, configVersion: '0.1.0', savedAt: gold, data: { gold } });

describe('LocalStorageSaveRepository', () => {
  it('아무것도 없으면 empty', async () => {
    expect(await new LocalStorageSaveRepository(createMemoryStorage()).load()).toEqual({ status: 'empty' });
  });

  it('저장한 것을 그대로 불러온다', async () => {
    const repo = new LocalStorageSaveRepository(createMemoryStorage());
    await repo.save(envelope(1));
    expect(await repo.load()).toEqual({ status: 'ok', envelope: envelope(1), fromBackup: false });
  });

  it('현재본이 손상되면 직전 성공본으로 복구한다', async () => {
    const storage = createMemoryStorage();
    const repo = new LocalStorageSaveRepository(storage);
    await repo.save(envelope(1));
    await repo.save(envelope(2));
    storage.setItem(SAVE_KEY, storage.getItem(SAVE_KEY)!.replace('"gold":2', '"gold":999999'));
    expect(await repo.load()).toEqual({ status: 'ok', envelope: envelope(1), fromBackup: true });
  });

  it('둘 다 손상되면 corrupt 를 알리고 손상본을 따로 보관한다', async () => {
    const storage = createMemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    storage.setItem(PREV_KEY, '{"checksum":"00000000","envelope":{"schemaVersion":1}}');
    expect(await new LocalStorageSaveRepository(storage).load()).toEqual({ status: 'corrupt' });
    expect(storage.getItem(CORRUPT_KEY)).toBe('{not json');
  });

  it('손상된 현재본은 직전 성공본 칸으로 넘기지 않는다', async () => {
    const storage = createMemoryStorage();
    const repo = new LocalStorageSaveRepository(storage);
    await repo.save(envelope(1));
    await repo.save(envelope(2));
    storage.setItem(SAVE_KEY, 'garbage');
    await repo.save(envelope(3));
    expect(storage.getItem(PREV_KEY)).toContain('"gold":1');
  });
});
