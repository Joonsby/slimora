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

/** 서버에 보관된 저장. version 은 서버가 저장할 때마다 올린다 */
export interface CloudSave {
  envelope: SaveEnvelope;
  version: number;
}

export type CloudPutResult =
  | { status: 'ok'; version: number }
  /** 다른 기기가 먼저 저장했다. current 는 지금 서버에 있는 저장 */
  | { status: 'conflict'; current: CloudSave | null }
  /** 서버에 이 빌드보다 새 형식의 저장이 있다 */
  | { status: 'outdated' };

/** 같은 사용자의 기기끼리 진행을 맞추는 서버 저장. 네트워크 · 인증 실패는 throw */
export interface CloudSaveStore {
  load(): Promise<CloudSave | null>;
  save(envelope: SaveEnvelope, baseVersion: number, urgent: boolean): Promise<CloudPutResult>;
}

export interface PlatformAdapter {
  now(): number;
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
}
