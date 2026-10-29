import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // 원스토어 패키지명과 같아야 한다. 등록 후에는 바꿀 수 없다
  appId: 'com.slimora.game',
  appName: '슬라임 용병단',
  webDir: 'dist',
};

export default config;
