import aitDevtools from '@apps-in-toss/devtools/unplugin';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import shop from './src/data/shop.json';

/** 개발 서버의 가짜 결제에 게임 상품을 올린다 — 앱인토스 콘솔에도 같은 sku · 유형으로 등록한다 */
const mockProducts = shop.map((p) => ({
  sku: p.sku,
  type: p.adPass ? ('NON_CONSUMABLE' as const) : ('CONSUMABLE' as const),
  displayName: p.name,
  displayAmount: `${p.priceKrw.toLocaleString('ko-KR')}원`,
  iconUrl: '',
  description: p.desc,
}));

export default defineConfig({
  // aitDevtools: 개발 서버에서만 SDK mock 과 패널을 붙인다 (운영 빌드에서는 꺼진다)
  plugins: [aitDevtools.vite({ initialState: { iap: { products: mockProducts } } }), react()],
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
