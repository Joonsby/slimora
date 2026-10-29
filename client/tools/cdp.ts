/**
 * 헤드리스 Chrome 을 DevTools 프로토콜로 다루는 최소 도구 — 이미지 생성 스크립트들이 같이 쓴다.
 * 경로는 CHROME_PATH 로 바꿀 수 있다
 */
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, unknown>;

export class Cdp {
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

  /** 지금 화면을 PNG 로 저장한다. 크기가 기대와 다르면 실패 */
  async shot(path: string, expect: { width: number; height: number }): Promise<void> {
    const { data } = (await this.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    const png = Buffer.from(data, 'base64');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== expect.width || height !== expect.height) throw new Error(`${path}: ${width}×${height} (기대 ${expect.width}×${expect.height})`);
    writeFileSync(path, png);
  }

  close(): void {
    this.ws.close();
  }
}

/** 헤드리스 Chrome 을 띄워 work 를 돌리고, 끝나면 프로필까지 지운다 */
export async function withChrome(profile: string, port: number, work: (cdp: Cdp) => Promise<void>): Promise<void> {
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], {
    stdio: 'ignore',
  });
  try {
    const cdp = await Cdp.connect(port);
    await work(cdp);
    if (cdp.problems.length > 0) console.warn('■ 페이지 오류\n' + cdp.problems.join('\n'));
    cdp.close();
  } finally {
    chrome.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
