import type { LoadResult, SaveEnvelope, SaveRepository } from '../session/ports';

/** 테스트 · 시뮬레이터 · localStorage 를 쓸 수 없는 환경용 */
export class MemorySaveRepository implements SaveRepository {
  saved: SaveEnvelope | null = null;
  saveCount = 0;

  async load(): Promise<LoadResult> {
    return this.saved ? { status: 'ok', envelope: structuredClone(this.saved), fromBackup: false } : { status: 'empty' };
  }

  async save(envelope: SaveEnvelope): Promise<void> {
    this.saved = structuredClone(envelope);
    this.saveCount += 1;
  }

  async clear(): Promise<void> {
    this.saved = null;
  }
}

/** localStorage 대신 쓰는 메모리 저장소 (키-값) */
export function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}
