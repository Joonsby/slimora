interface ImportMetaEnv {
  /** 서버 저장 API 주소. 없으면 운영 서버 */
  readonly VITE_SAVE_API_URL?: string;
  /** 개발 서버 전용. 토스 없이 이 키로 서버 저장을 시험한다 (서버가 DEV_AUTH=true 여야 한다) */
  readonly VITE_SAVE_DEV_USER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
