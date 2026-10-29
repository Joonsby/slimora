/**
 * 안드로이드 런처 아이콘 · 스플래시 원판 생성 — 원본은 ../store-assets/src/android-icon.html
 *   npm run android-icons
 * 헤드리스 Chrome 이 필요하다. 결과는 android/app/src/main/res 의 mipmap-* · drawable-*
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Cdp, sleep, withChrome } from './cdp';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RES = resolve(CLIENT, 'android/app/src/main/res');
const PAGE = pathToFileURL(resolve(CLIENT, '../store-assets/src/android-icon.html')).href;
const DEBUG_PORT = 9335;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** [폴더 접두어, 파일, layer, 크기(dp)] */
const OUTPUTS: [string, string, string, number][] = [
  ['mipmap', 'ic_launcher_background.png', 'background', 108],
  ['mipmap', 'ic_launcher_foreground.png', 'foreground', 108],
  ['mipmap', 'ic_launcher.png', 'square', 48],
  ['mipmap', 'ic_launcher_round.png', 'round', 48],
  ['drawable', 'splash_logo.png', 'splash', 160],
];

async function render(cdp: Cdp, layer: string, px: number, path: string): Promise<void> {
  await cdp.open(`${PAGE}?layer=${layer}`, px, px, 1);
  // 전경 · 구형 아이콘의 모서리는 투명해야 한다
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp.waitFor('!!document.body && !!document.body.dataset.ready');
  await sleep(100);
  await cdp.shot(path, { width: px, height: px });
}

await withChrome(resolve(CLIENT, '.chrome-profile-icons'), DEBUG_PORT, async (cdp) => {
  for (const [density, scale] of Object.entries(DENSITIES)) {
    for (const [prefix, file, layer, dp] of OUTPUTS) {
      const dir = resolve(RES, `${prefix}-${density}`);
      mkdirSync(dir, { recursive: true });
      await render(cdp, layer, dp * scale, resolve(dir, file));
    }
    console.log(`  ${density} (×${scale})`);
  }
});
console.log(`완료 → ${RES}`);
