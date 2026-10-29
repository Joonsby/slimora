import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔에 등록한 앱 이름과 같아야 업로드된다. 등록 전이라 임시 이름
  appName: 'slimora',
  brand: {
    primaryColor: '#0f9f75',
  },
  webView: {},
  permissions: [],
  webBundleDir: 'dist',
});
