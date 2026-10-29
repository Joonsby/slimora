import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // 임시 ID. 출시 후에는 바꿀 수 없으니 원스토어 첫 업로드 전에 확정한다
  appId: 'com.slimora.game',
  appName: '슬라임 용병단',
  webDir: 'dist',
};

export default config;
