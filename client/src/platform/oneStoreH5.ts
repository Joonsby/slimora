import { Capacitor } from '@capacitor/core';
import { inTossApp } from './tossUser';

/** 원스토어 H5 Game SDK — 원스토어 앱이 게임을 iframe 으로 띄울 때만 쓴다 (onestore-dev.gitbook.io/dev/tools/web-sdk) */
const SDK_URL = 'https://h5sdk.onestore.net/lib/v1.1.0/onestore-h5-sdk.min.js';

interface H5Sdk {
  on(event: 'pause', handler: (e: { reason: 'background' | 'ad' | 'payment' }) => void): void;
  on(event: 'resume', handler: (e: { ringerSilent?: boolean }) => void): void;
  on(event: 'exit', handler: () => void): void;
  /** 동기로 답한다. true = 게임이 처리함 */
  onBackPressed(handler: () => boolean): void;
  initializeAsync(): Promise<{ err?: string }>;
  setLoadingProgress(progress: number): void;
  startGameAsync(): Promise<void>;
}

export interface OneStoreH5Hooks {
  pause(): void;
  resume(): void;
  /** 0.5초 안에 동기로 저장한다 */
  exit(): void;
  back(): boolean;
}

export interface OneStoreH5 {
  /** 로딩 진행률 0~100 */
  progress(n: number): void;
  /** 로딩을 끝내고 게임 화면을 보여 달라고 알린다 — 게임 화면이 실제로 그려진 뒤에 부른다 */
  start(): Promise<void>;
}

/** 원스토어 앱 안(iframe)이 아니면 null — 브라우저 · 토스 앱 · 안드로이드 앱은 SDK 없이 돈다 */
export async function bootOneStoreH5(hooks: OneStoreH5Hooks): Promise<OneStoreH5 | null> {
  if (window.self === window.top || inTossApp() || Capacitor.isNativePlatform()) return null;
  try {
    const { createSDK } = (await import(/* @vite-ignore */ SDK_URL)) as { createSDK: () => H5Sdk };
    const sdk = createSDK();
    // 초기화 직후 이벤트가 올 수 있어 먼저 등록한다 (SDK 가이드)
    sdk.on('pause', () => hooks.pause());
    sdk.on('resume', () => hooks.resume());
    sdk.on('exit', () => hooks.exit());
    sdk.onBackPressed(() => hooks.back());
    const info = await sdk.initializeAsync();
    if (info.err) {
      console.warn('원스토어 H5 SDK 를 쓸 수 없는 환경', info.err);
      return null;
    }
    return {
      progress: (n) => sdk.setLoadingProgress(Math.max(0, Math.min(100, Math.round(n)))),
      start: () => sdk.startGameAsync(),
    };
  } catch (e) {
    console.warn('원스토어 H5 SDK 초기화 실패', e);
    return null;
  }
}
