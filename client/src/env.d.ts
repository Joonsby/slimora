interface ImportMetaEnv {
  /** 서버 저장 API 주소. 없으면 운영 서버 */
  readonly VITE_SAVE_API_URL?: string;
  /** 개발 서버 전용. 토스 없이 이 키로 서버 저장을 시험한다 (서버가 DEV_AUTH=true 여야 한다) */
  readonly VITE_SAVE_DEV_USER?: string;
  /** 앱인토스 콘솔에서 만든 보상형 광고 그룹 ID. 없으면 광고 버튼이 나오지 않는다 */
  readonly VITE_AIT_REWARD_AD_ID?: string;
  /** on 이면 안드로이드 앱에 원스토어 결제 상점을 연다. 없으면 상점이 나오지 않는다 */
  readonly VITE_ONESTORE_IAP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
