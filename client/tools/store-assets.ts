/**
 * 앱인토스 콘솔용 이미지 생성 — 로고 · 썸네일 · 스크린샷
 *   npm run build && npm run store-assets
 * 헤드리스 Chrome 이 필요하다 (경로는 CHROME_PATH 로 바꿀 수 있다). 결과는 ../store-assets/*.png
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(CLIENT, '../store-assets');
const SRC = resolve(OUT, 'src');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG_PORT = 9334;
const PREVIEW_PORT = 4174;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 세로형은 문서 규격(636) 과 요청 규격(686) 을 모두 만든다 — 콘솔이 받는 쪽을 올린다 */
const PORTRAIT_WIDTHS = [636, 686];
const PORTRAIT_HEIGHT = 1048;

type Json = Record<string, unknown>;

class Cdp {
  private seq = 0;
  private readonly pending = new Map<number, (result: Json) => void>();
  readonly problems: string[] = [];

  private constructor(private readonly ws: WebSocket) {
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { id?: number; result?: Json; method?: string; params?: Json };
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)!(msg.result ?? {});
        this.pending.delete(msg.id);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.problems.push(JSON.stringify(msg.params).slice(0, 300));
      } else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params as { type?: string }).type === 'error') {
        this.problems.push(JSON.stringify(msg.params).slice(0, 300));
      }
    };
  }

  static async connect(port: number): Promise<Cdp> {
    for (let i = 0; i < 50; i++) {
      try {
        const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        const page = targets.find((t) => t.type === 'page');
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((r) => (ws.onopen = r));
          const cdp = new Cdp(ws);
          await cdp.send('Runtime.enable');
          await cdp.send('Page.enable');
          return cdp;
        }
      } catch {
        // Chrome 이 아직 뜨는 중
      }
      await sleep(200);
    }
    throw new Error('Chrome DevTools 에 연결하지 못했다');
  }

  send(method: string, params: Json = {}): Promise<Json> {
    return new Promise((resolveCall) => {
      const id = ++this.seq;
      this.pending.set(id, resolveCall);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const r = (await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as { result?: { value?: T } };
    return r.result?.value as T;
  }

  async open(url: string, width: number, height: number, scale: number): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: scale > 1 });
    await this.send('Page.navigate', { url });
  }

  async waitFor(expression: string, timeoutMs = 15_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await this.evaluate<boolean>(expression)) return;
      await sleep(150);
    }
    throw new Error(`기다리다 시간 초과: ${expression}`);
  }

  async tap(selector: string): Promise<void> {
    const p = await this.evaluate<{ x: number; y: number } | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
    if (!p) throw new Error(`없는 요소: ${selector}`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }

  async shot(file: string, expect: { width: number; height: number }): Promise<void> {
    const { data } = (await this.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    const png = Buffer.from(data, 'base64');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== expect.width || height !== expect.height) throw new Error(`${file}: ${width}×${height} (기대 ${expect.width}×${expect.height})`);
    writeFileSync(resolve(OUT, file), png);
    console.log(`  ${file}  ${width}×${height}`);
  }

  close(): void {
    this.ws.close();
  }
}

/** 게임 저장 형식(session/saveData.ts) 그대로. 체크섬은 저장소(persistence/checksum.ts) 와 같은 FNV-1a */
function saveInjection(progress: Json, battleSpeed = 1): string {
  return `(() => {
    function fnv(t){let h=0x811c9dc5;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');}
    const envelope = { schemaVersion: 2, configVersion: 'store-assets', savedAt: Date.now(), data: { installId: 'store-assets', createdAt: 0, lastActiveAt: 0, progress: ${JSON.stringify(progress)}, settings: { battleSpeed: ${battleSpeed} } } };
    localStorage.clear();
    localStorage.setItem('slime-merc:save', JSON.stringify({ checksum: fnv(JSON.stringify(envelope)), envelope }));
  })()`;
}

const lifetime = { kills: { bat: 412, golem: 236, fire: 518 }, goldEarned: 48200, deaths: 7 };

interface GameShot {
  progress: Json;
  waitMs: number;
  tap?: string;
}

/** 세로형 스크린샷 4장 — 실제 게임 화면 */
const GAME_SHOTS: GameShot[] = [
  {
    // 1. 자동 전투: 화염을 많이 흡수해 주황빛이 된 슬라임 vs 화염 드래곤 (화상 · 피해 숫자)
    //    공격력을 낮게 둬 한 마리와 오래 싸우게 하고, 드래곤이 세 번째로 때린 직후(약 4.3초 — 화상이 붙어 있을 때)를 찍는다
    progress: {
      gold: 12345,
      slime: { upgrades: { attack: 0, maxHp: 8, critChance: 20 }, absorption: { bat: 100, golem: 60, fire: 2000 } },
      stage: { highestCleared: 6, current: 6, mode: 'farm', autoAdvance: true },
      lifetime,
    },
    waitMs: 4300,
  },
  {
    // 2. 흡수 시트: 레벨 · 계열별 특성 단계
    progress: {
      gold: 12345,
      slime: { upgrades: { attack: 6, maxHp: 8, critChance: 10 }, absorption: { bat: 320, golem: 120, fire: 900 } },
      stage: { highestCleared: 6, current: 6, mode: 'farm', autoAdvance: true },
      lifetime,
    },
    waitMs: 2500,
    tap: '.menu button:nth-child(3)',
  },
  {
    // 3. 강화 시트: 공격력 · HP · 치명타
    progress: {
      gold: 23456,
      slime: { upgrades: { attack: 18, maxHp: 12, critChance: 6 }, absorption: { bat: 260, golem: 410, fire: 180 } },
      // 마지막 스테이지까지 깬 상태 — 「도전 ▶」 버튼이 없어야 좁은 화면에서 스테이지 이름이 잘리지 않는다
      stage: { highestCleared: 6, current: 5, mode: 'farm', autoAdvance: true },
      lifetime,
    },
    waitMs: 2500,
    tap: '.menu button:nth-child(1)',
  },
  {
    // 4. 박쥐를 많이 흡수해 보랏빛이 된 슬라임 vs 박쥐 — 1번(주황)과 함께 「사냥한 계열 색으로 물든다」를 보여준다
    progress: {
      gold: 8760,
      slime: { upgrades: { attack: 0, maxHp: 6, critChance: 20 }, absorption: { bat: 2000, golem: 90, fire: 60 } },
      stage: { highestCleared: 6, current: 4, mode: 'farm', autoAdvance: true },
      lifetime,
    },
    waitMs: 2900,
  },
];

async function captureGame(cdp: Cdp, baseUrl: string): Promise<void> {
  for (const width of PORTRAIT_WIDTHS) {
    for (const [i, shot] of GAME_SHOTS.entries()) {
      const { identifier } = (await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: saveInjection(shot.progress) })) as { identifier: string };
      // 2배 해상도로 찍어 글자가 선명하게 나오게 한다
      await cdp.open(baseUrl, width / 2, PORTRAIT_HEIGHT / 2, 2);
      await cdp.waitFor(`!!document.querySelector('.battle canvas')`);
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await sleep(shot.waitMs);
      if (shot.tap) {
        await cdp.tap(shot.tap);
        await sleep(500);
      }
      const overflow = await cdp.evaluate<number>('document.documentElement.scrollWidth - innerWidth');
      if (overflow > 0) throw new Error(`세로 ${width}px: 가로로 ${overflow}px 넘침`);
      await cdp.shot(`screenshot-portrait-${width}x${PORTRAIT_HEIGHT}-${i + 1}.png`, { width, height: PORTRAIT_HEIGHT });
    }
  }
}

async function renderPage(cdp: Cdp, page: string, file: string, width: number, height: number, query = ''): Promise<void> {
  // pathToFileURL 은 ? 를 파일명으로 인코딩하므로 쿼리는 따로 붙인다
  await cdp.open(pathToFileURL(resolve(SRC, page)).href + query, width, height, 1);
  await cdp.waitFor('!!document.body && !!document.body.dataset.ready');
  const font = await cdp.evaluate<string>('document.body.dataset.ready');
  if (font === 'fallback') console.warn(`  ! ${file}: Jua 글꼴을 못 불러와 대체 글꼴로 그렸다 (네트워크 확인)`);
  await sleep(200);
  await cdp.shot(file, { width, height });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const profile = resolve(OUT, '.chrome-profile');
  const server = await preview({ root: CLIENT, logLevel: 'warn', preview: { port: PREVIEW_PORT, strictPort: true } });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], {
    stdio: 'ignore',
  });
  try {
    const cdp = await Cdp.connect(DEBUG_PORT);
    console.log('■ 세로형 스크린샷 (실제 게임 화면)');
    await captureGame(cdp, `http://localhost:${PREVIEW_PORT}/`);
    console.log('■ 로고 · 썸네일 · 가로형');
    await renderPage(cdp, 'logo.html', 'logo-light-600.png', 600, 600, '?mode=light');
    await renderPage(cdp, 'logo.html', 'logo-dark-600.png', 600, 600, '?mode=dark');
    await renderPage(cdp, 'thumbnail.html', 'thumbnail-1932x828.png', 1932, 828);
    await renderPage(cdp, 'landscape.html', 'screenshot-landscape-1504x741.png', 1504, 741);
    if (cdp.problems.length > 0) console.warn('■ 페이지 오류\n' + cdp.problems.join('\n'));
    cdp.close();
  } finally {
    chrome.kill();
    await server.close();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  console.log(`완료 → ${OUT}`);
}

await main();
