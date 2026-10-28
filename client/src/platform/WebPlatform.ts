import type { PlatformAdapter } from '../session/ports';

/** 일반 브라우저용. 앱인토스 SDK 단계에서 TossPlatform 으로 교체한다 */
export class WebPlatform implements PlatformAdapter {
  now(): number {
    return Date.now();
  }

  onVisibilityChange(listener: (visible: boolean) => void): () => void {
    const onVisibility = () => listener(document.visibilityState === 'visible');
    const onPageHide = () => listener(false);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }
}

/** 사생활 보호 모드 등에서 localStorage 접근이 막히면 null */
export function safeLocalStorage(): Storage | null {
  try {
    const key = '__slime_merc_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    return null;
  }
}
