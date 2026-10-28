import type { LoadResult, SaveEnvelope, SaveRepository } from '../session/ports';
import { fnv1a } from './checksum';

export const SAVE_KEY = 'slime-merc:save';
export const PREV_KEY = 'slime-merc:save:prev';
export const CORRUPT_KEY = 'slime-merc:save:corrupt';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface StoredRecord {
  checksum: string;
  envelope: SaveEnvelope;
}

/** 현재본과 직전 성공본 두 칸을 둔다. 현재본이 깨지면 직전본으로 복구한다 */
export class LocalStorageSaveRepository implements SaveRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<LoadResult> {
    const current = this.read(SAVE_KEY);
    if (current.envelope) return { status: 'ok', envelope: current.envelope, fromBackup: false };
    const prev = this.read(PREV_KEY);
    if (prev.envelope) return { status: 'ok', envelope: prev.envelope, fromBackup: true };
    if (current.raw === null && prev.raw === null) return { status: 'empty' };
    this.storage.setItem(CORRUPT_KEY, current.raw ?? prev.raw ?? '');
    return { status: 'corrupt' };
  }

  async save(envelope: SaveEnvelope): Promise<void> {
    const previous = this.read(SAVE_KEY);
    const record: StoredRecord = { checksum: fnv1a(JSON.stringify(envelope)), envelope };
    this.storage.setItem(SAVE_KEY, JSON.stringify(record));
    // 새 저장이 성공한 뒤에만 직전 성공본을 넘긴다
    if (previous.raw !== null && previous.envelope) this.storage.setItem(PREV_KEY, previous.raw);
  }

  async clear(): Promise<void> {
    this.storage.removeItem(SAVE_KEY);
    this.storage.removeItem(PREV_KEY);
  }

  private read(key: string): { raw: string | null; envelope: SaveEnvelope | null } {
    const raw = this.storage.getItem(key);
    if (raw === null) return { raw, envelope: null };
    try {
      const record = JSON.parse(raw) as Partial<StoredRecord>;
      const env = record.envelope;
      const valid =
        typeof record.checksum === 'string' &&
        typeof env === 'object' &&
        env !== null &&
        typeof env.schemaVersion === 'number' &&
        record.checksum === fnv1a(JSON.stringify(env));
      return { raw, envelope: valid ? env : null };
    } catch {
      return { raw, envelope: null };
    }
  }
}
