import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * 안드로이드 앱의 뒤로가기. handleInApp 이 처리하지 않으면(false) 종료 대신 백그라운드로 보낸다.
 * 웹 · 앱인토스에서는 아무것도 하지 않는다
 */
export function installAndroidBackButton(handleInApp: () => boolean): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  void App.addListener('backButton', () => {
    if (!handleInApp()) void App.minimizeApp();
  });
}
