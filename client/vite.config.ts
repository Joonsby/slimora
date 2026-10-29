import aitDevtools from '@apps-in-toss/devtools/unplugin';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // aitDevtools: 개발 서버에서만 SDK mock 과 패널을 붙인다 (운영 빌드에서는 꺼진다)
  plugins: [aitDevtools.vite(), react()],
  build: {
    // Phaser 단독 청크가 1MB 를 넘는다. 경고 기준만 올린다
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
