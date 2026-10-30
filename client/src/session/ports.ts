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

/** 랭킹 (토스 게임센터 리더보드). 점수 제출 · 랭킹 화면 열기 */
export interface Leaderboard {
  /** 'ok' 외에는 제출되지 않았다 (프로필 없음 · 리더보드 없음 · 지원 안 함 등) */
  submit(score: number): Promise<'ok' | 'noProfile' | 'notFound' | 'failed'>;
  open(): Promise<boolean>;
}

/** 결제가 끝난 주문을 게임에 지급하고 저장까지 마쳤으면 true. 같은 주문을 다시 받아도 true */
export type GrantOrder = (sku: string, orderId: string) => Promise<boolean>;

/** pending = 결제 승인 대기 (나중에 restore 로 지급된다) */
export type PurchaseOutcome = 'ok' | 'cancelled' | 'pending' | 'failed';

/** 인앱 결제 (앱인토스 IAP · 원스토어). 지급은 grant 를 통해서만 한다 */
export interface ShopStore {
  /** 스토어에 등록된 표시 가격 (sku → '1,100원'). 못 받은 상품은 빠진다 */
  prices(skus: readonly string[]): Promise<Record<string, string>>;
  purchase(sku: string, grant: GrantOrder): Promise<PurchaseOutcome>;
  /** 결제는 됐는데 지급이 안 된 주문을 마저 지급한다 (앱 시작 때) */
  restore(grant: GrantOrder): Promise<void>;
}

/** 보상형 광고. 끝까지 보면 true, 못 불러오거나 중간에 닫으면 false */
export interface RewardedAds {
  show(): Promise<boolean>;
}

export interface PlatformAdapter {
  now(): number;
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
}
