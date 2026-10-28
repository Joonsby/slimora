/** 저장소가 주고받는 단위. data 는 버전마다 모양이 달라 unknown 으로 둔다 */
export interface SaveEnvelope {
  schemaVersion: number;
  configVersion: string;
  savedAt: number;
  data: unknown;
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; envelope: SaveEnvelope; fromBackup: boolean }
  | { status: 'corrupt' };

export interface SaveRepository {
  load(): Promise<LoadResult>;
  save(envelope: SaveEnvelope): Promise<void>;
  clear(): Promise<void>;
}

export interface PlatformAdapter {
  now(): number;
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
}
