/**
 * 원스토어 그래픽 리소스 생성 — 대표 아이콘 512 · 세로 스크린샷(9:16, 1MB 이하) · 홍보 동영상(MP4)
 *   npm run build && npm run onestore-assets
 * 헤드리스 Chrome 이 필요하다. 동영상은 화면을 프레임으로 찍어 Chrome MediaRecorder 로 MP4 를 만든다 (ffmpeg 불필요).
 * 결과는 ../store-assets/onestore/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import type { ProgressState } from '../src/core/model/progress';
import { createInitialProgress } from '../src/core/progression/initial';
import { deriveSlimeStats, stageBase } from '../src/core/stats';
import { gameConfig as cfg } from '../src/data';
import { fnv1a } from '../src/persistence/checksum';
import { SCHEMA_VERSION } from '../src/session/saveData';
import { type Cdp, sleep, withChrome } from './cdp';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(CLIENT, '../store-assets/src');
const OUT = resolve(CLIENT, '../store-assets/onestore');
const DEBUG_PORT = 9337;
const PREVIEW_PORT = 4175;
/** CSS 크기 × 2 로 찍는다 → 720×1280 (9:16, 긴 변 1300 이하) */
const VIEW = { width: 360, height: 640, scale: 2 };
const PX = { width: VIEW.width * VIEW.scale, height: VIEW.height * VIEW.scale };
const MAX_SHOT_BYTES = 1_000_000;
const TUTORIAL = ['welcome', 'upgrade', 'challenge', 'mercenary', 'absorb', 'evolve', 'rebirth'];

type Patch = Partial<Omit<ProgressState, 'slime' | 'stage'>> & { slime?: Partial<ProgressState['slime']>; stage?: Partial<ProgressState['stage']> };

/** 공격력이 그 스테이지 몬스터 기준 HP × ratio 가 되는 가장 낮은 강화 레벨 (공격력 · HP 같은 레벨) */
function levelFor(stage: number, ratio: number, slime: Partial<ProgressState['slime']>): number {
  const want = stageBase(cfg, stage).hp * ratio;
  for (let lv = 0; lv < 1000; lv++) {
    if (deriveSlimeStats({ ...slime, upgrades: { attack: lv, maxHp: lv, critChance: 30 } }, cfg).attack >= want) return lv;
  }
  return 1000;
}

function progress(patch: Patch): ProgressState {
  const base = createInitialProgress(cfg);
  return {
    ...base,
    ...patch,
    slime: { ...base.slime, ...patch.slime },
    stage: { ...base.stage, ...patch.stage },
    lifetime: { kills: { bat: 4120, golem: 2360, fire: 5180 }, goldEarned: 9.2e12, deaths: 41 },
  };
}

/** 게임 저장 형식 그대로 넣는다. 튜토리얼은 다 본 것으로, 소리는 끈다 */
function injection(p: ProgressState): string {
  const envelope = {
    schemaVersion: SCHEMA_VERSION,
    configVersion: cfg.configVersion,
    savedAt: Date.now(),
    data: { installId: 'store-assets', createdAt: 0, lastActiveAt: '__NOW__', progress: p, settings: { battleSpeed: 1, sound: false, tutorial: TUTORIAL } },
  };
  // 오프라인 보상 창이 뜨지 않게 마지막 접속 시각은 페이지가 열릴 때 채운다
  return `(() => {
    const envelope = ${JSON.stringify(envelope)};
    envelope.data.lastActiveAt = Date.now();
    envelope.savedAt = Date.now();
    ${fnv1a.toString().replace('function fnv1a', 'function fnv')}
    localStorage.clear();
    localStorage.setItem('slime-merc:save', JSON.stringify({ checksum: fnv(JSON.stringify(envelope)), envelope }));
  })()`;
}

const party = { owned: { goldy: 4, wyvern: 6, shade: 3, pip: 8, pebble: 5, ember: 7, moss: 2 }, party: ['goldy', 'wyvern'] };
const flame = { form: 'flame', unlockedForms: ['flame', 'iron'], absorption: { bat: 2400, golem: 3100, fire: 9800 } };
const vampire = { form: 'vampire', unlockedForms: ['vampire', 'flame', 'iron'], absorption: { bat: 52000, golem: 21000, fire: 18000 } };
const lv = (stage: number, ratio: number, slime: Partial<ProgressState['slime']>) => {
  const l = levelFor(stage, ratio, slime);
  return { ...slime, upgrades: { attack: l, maxHp: l, critChance: 30 } };
};

/** 화면 장면들 — 저장 상태 · 기다릴 것 · 누를 것 */
interface Scene {
  name: string;
  save: ProgressState;
  /** 전투 화면이 뜬 뒤 이 조건이 참이 될 때까지 기다린다 */
  until?: string;
  waitMs: number;
  tap?: string;
}

const MID = { highestCleared: 54, current: 54, mode: 'farm' as const, autoAdvance: false };
const scenes: Record<string, Scene> = {
  battle: {
    name: '화염 슬라임 전투 (서리 동굴)',
    save: progress({ gold: 3.4e6, gems: 1280, slime: lv(23, 0.3, flame), stage: { highestCleared: 29, current: 23, mode: 'farm', autoAdvance: false }, mercenaries: party }),
    waitMs: 3200,
  },
  boss: {
    name: '보스전 (빙하 거인)',
    save: progress({ gold: 9.1e7, gems: 1280, slime: lv(40, 1.1, flame), stage: { highestCleared: 39, current: 40, mode: 'challenge', autoAdvance: false }, mercenaries: party }),
    until: `!!document.querySelector('.progress.boss')`,
    waitMs: 900,
  },
  stages: {
    name: '사냥터 — 20장 200 스테이지',
    save: progress({ gold: 5.2e12, gems: 2480, slime: lv(54, 0.3, flame), stage: MID, mercenaries: party }),
    waitMs: 1500,
    tap: '.stage-pill',
  },
  upgrade: {
    name: '강화 — 25레벨 돌파',
    save: progress({ gold: 8.8e13, gems: 2480, slime: { ...flame, upgrades: { attack: 149, maxHp: 141, critChance: 42 } }, stage: MID, mercenaries: party }),
    waitMs: 1500,
    tap: '.menu button:nth-child(1)',
  },
  mercenary: {
    name: '용병 영입 · 편성',
    save: progress({ gold: 5.2e12, gems: 2480, slime: lv(54, 0.3, flame), stage: MID, mercenaries: party }),
    waitMs: 1500,
    tap: '.menu button:nth-child(3)',
  },
  evolve: {
    name: '진화',
    save: progress({ gold: 5.2e12, gems: 2480, slime: lv(54, 0.3, flame), stage: MID, mercenaries: party }),
    waitMs: 1500,
    tap: '.menu button:nth-child(4)',
  },
  abyss: {
    name: '흡혈 슬라임 전투 (심연의 문)',
    save: progress({ gold: 4.4e28, gems: 6120, slime: lv(183, 0.3, vampire), stage: { highestCleared: 186, current: 183, mode: 'farm', autoAdvance: false }, mercenaries: { ...party, party: ['goldy', 'shade'] } }),
    waitMs: 3000,
  },
  rebirth: {
    name: '환생 · 정수 강화',
    save: progress({
      gold: 5.2e12,
      gems: 2480,
      slime: lv(54, 0.3, flame),
      stage: MID,
      mercenaries: party,
      prestige: { count: 6, essence: 1840, legacy: { might: 24, jelly: 23, greed: 22, dream: 2 }, bestStage: 112 },
    }),
    waitMs: 1500,
    tap: '.menu button:nth-child(5)',
  },
};

/** 저장을 넣고 게임을 열어 전투 화면이 뜰 때까지 */
async function openGame(cdp: Cdp, baseUrl: string, scene: Scene): Promise<void> {
  const { identifier } = (await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: injection(scene.save) })) as { identifier: string };
  await cdp.open(baseUrl, VIEW.width, VIEW.height, VIEW.scale);
  await cdp.waitFor(`!!document.querySelector('.battle canvas')`);
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  if (scene.until) await cdp.waitFor(scene.until, 90_000);
}

/** PNG 가 1MB 를 넘으면 JPEG(품질 92) 로 */
async function shot(cdp: Cdp, file: string): Promise<string> {
  const png = Buffer.from(((await cdp.send('Page.captureScreenshot', { format: 'png' })) as { data: string }).data, 'base64');
  const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (width !== PX.width || height !== PX.height) throw new Error(`${file}: ${width}×${height}`);
  if (png.length <= MAX_SHOT_BYTES) {
    writeFileSync(resolve(OUT, `${file}.png`), png);
    return `${file}.png ${(png.length / 1024).toFixed(0)}KB`;
  }
  const jpg = Buffer.from(((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })) as { data: string }).data, 'base64');
  if (jpg.length > MAX_SHOT_BYTES) throw new Error(`${file}: JPEG 도 1MB 초과`);
  writeFileSync(resolve(OUT, `${file}.jpg`), jpg);
  return `${file}.jpg ${(jpg.length / 1024).toFixed(0)}KB`;
}

async function icon(cdp: Cdp): Promise<void> {
  // 로고(600) 를 0.8533 배로 찍어 512 로
  await cdp.open(pathToFileURL(resolve(SRC, 'logo.html')).href + '?mode=dark', 600, 600, 512 / 600);
  await cdp.waitFor('!!document.body && !!document.body.dataset.ready');
  await sleep(200);
  await cdp.shot(resolve(OUT, 'icon-512.png'), { width: 512, height: 512 });
  console.log('  icon-512.png');
}

async function screenshots(cdp: Cdp, baseUrl: string): Promise<void> {
  const order = ['battle', 'boss', 'stages', 'upgrade', 'mercenary', 'evolve', 'abyss', 'rebirth'];
  for (const [i, key] of order.entries()) {
    const scene = scenes[key]!;
    await openGame(cdp, baseUrl, scene);
    if (scene.tap) {
      await sleep(800);
      await cdp.tap(scene.tap);
    }
    await sleep(scene.waitMs);
    console.log(`  ${await shot(cdp, `screenshot-${i + 1}`)}  ${scene.name}`);
  }
}

// ── 동영상 ────────────────────────────────────────────────

interface Frame {
  data: string;
  /** 동영상 안에서의 시각(ms) */
  at: number;
}

/** 화면을 durationMs 동안 프레임으로 받는다. during 은 녹화를 켠 직후 실행 (누르기 등) */
async function record(cdp: Cdp, frames: Frame[], offset: number, durationMs: number, during?: () => Promise<void>): Promise<number> {
  let start: number | null = null;
  cdp.on('Page.screencastFrame', (p) => {
    const meta = p.metadata as { timestamp: number };
    start ??= meta.timestamp;
    const at = offset + (meta.timestamp - start) * 1000;
    if (at - offset <= durationMs) frames.push({ data: p.data as string, at });
    void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId as number });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: PX.width, maxHeight: PX.height, everyNthFrame: 1 });
  await during?.();
  await sleep(durationMs + 150);
  await cdp.send('Page.stopScreencast');
  cdp.on('Page.screencastFrame', null);
  return offset + durationMs;
}

async function card(cdp: Cdp, kind: 'intro' | 'outro'): Promise<void> {
  await cdp.open(pathToFileURL(resolve(SRC, 'video-card.html')).href + `?kind=${kind}`, VIEW.width, VIEW.height, VIEW.scale);
  await cdp.waitFor('!!document.body && !!document.body.dataset.ready');
  await sleep(200);
}

async function video(cdp: Cdp, baseUrl: string): Promise<void> {
  const frames: Frame[] = [];
  let t = 0;
  await card(cdp, 'intro');
  t = await record(cdp, frames, t, 2500);
  for (const [key, ms] of [['battle', 6000], ['boss', 5500]] as const) {
    const scene = scenes[key]!;
    await openGame(cdp, baseUrl, { ...scene, until: scene.until ?? `true` });
    if (!scene.until) await sleep(1200);
    t = await record(cdp, frames, t, ms);
  }
  // 사냥터를 열어 장 목록을 보여 준다
  await openGame(cdp, baseUrl, scenes.stages!);
  await sleep(1200);
  t = await record(cdp, frames, t, 3500, () => cdp.tap('.stage-pill'));
  // 강화 149 → 150 돌파
  await openGame(cdp, baseUrl, scenes.upgrade!);
  await sleep(1200);
  await cdp.tap('.menu button:nth-child(1)');
  await sleep(900);
  t = await record(cdp, frames, t, 3500, async () => {
    await sleep(900);
    await cdp.tap('.upgrade-card.up-attack .buy');
  });
  await openGame(cdp, baseUrl, scenes.abyss!);
  await sleep(1200);
  t = await record(cdp, frames, t, 5000);
  await card(cdp, 'outro');
  t = await record(cdp, frames, t, 3000);
  console.log(`  프레임 ${frames.length}개 · ${(t / 1000).toFixed(1)}초 — MP4 로 굽는 중`);
  await encode(cdp, frames, t);
}

/** 프레임을 캔버스에 시각대로 다시 그리며 MediaRecorder 로 MP4 를 만든다 */
async function encode(cdp: Cdp, frames: Frame[], totalMs: number): Promise<void> {
  await cdp.open('about:blank', PX.width, PX.height, 1);
  await sleep(300);
  await cdp.evaluate(`window.__frames = []; true`);
  for (const f of frames) await cdp.evaluate(`window.__frames.push({ at: ${f.at}, data: ${JSON.stringify(f.data)} }); true`);
  const size = await cdp.evaluate<number>(`(async () => {
    const W = ${PX.width}, H = ${PX.height}, TOTAL = ${totalMs};
    const frames = await Promise.all(window.__frames.map(async (f) => ({ at: f.at, img: await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + f.data)).blob()) })));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(frames[0].img, 0, 0, W, H);
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/mp4;codecs=avc1.640028', videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start(1000);
    const t0 = performance.now();
    let i = 0;
    await new Promise((finish) => {
      const tick = () => {
        const now = performance.now() - t0;
        while (i + 1 < frames.length && frames[i + 1].at <= now) i++;
        ctx.drawImage(frames[i].img, 0, 0, W, H);
        if (now >= TOTAL) finish(); else requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop();
    await done;
    const buf = new Uint8Array(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer());
    let bin = '';
    for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000));
    window.__mp4 = btoa(bin);
    return buf.length;
  })()`);
  const parts: string[] = [];
  const STEP = 4_000_000;
  for (let k = 0; k < Math.ceil(size / 3) * 4; k += STEP) parts.push(await cdp.evaluate<string>(`window.__mp4.slice(${k}, ${k + STEP})`));
  const mp4 = Buffer.from(parts.join(''), 'base64');
  writeFileSync(resolve(OUT, 'promo-720x1280.mp4'), mp4);
  console.log(`  promo-720x1280.mp4  ${(mp4.length / 1024 / 1024).toFixed(1)}MB · ${(totalMs / 1000).toFixed(1)}초`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  const server = await preview({ root: CLIENT, logLevel: 'warn', preview: { port: PREVIEW_PORT, strictPort: true } });
  const baseUrl = `http://localhost:${PREVIEW_PORT}/`;
  try {
    await withChrome(resolve(OUT, '.chrome-profile'), DEBUG_PORT, async (cdp) => {
      if (!only || only === 'icon') {
        console.log('■ 대표 아이콘');
        await icon(cdp);
      }
      if (!only || only === 'shots') {
        console.log('■ 스크린샷 (720×1280)');
        await screenshots(cdp, baseUrl);
      }
      if (!only || only === 'video') {
        console.log('■ 동영상');
        await video(cdp, baseUrl);
      }
    });
  } finally {
    await server.close();
  }
  console.log(`완료 → ${OUT}`);
}

await main();
