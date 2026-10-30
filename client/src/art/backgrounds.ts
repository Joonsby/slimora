import { darken, lighten, mix } from './color';
import { gid, linear, radial, round, seeded, svgDoc, type Sprite } from './svg';

/**
 * 스테이지 배경. 뒷배경(지평선이 맨 아래) + 땅(윗면이 맨 위) 두 장으로 나눠,
 * 전투 화면이 지평선을 캐릭터 발밑(groundY)에 맞춘다. 화면이 더 길면 위 · 아래를 top · bottom 색으로 채운다
 */
export const BACK_W = 540;
export const BACK_H = 760;
export const GROUND_H = 320;

export type AmbientKind = 'motes' | 'fireflies' | 'embers' | 'ash';

export interface SceneArt {
  backdrop: Sprite;
  ground: Sprite;
  top: string;
  bottom: string;
  ambient: { kind: AmbientKind; color: string; count: number };
}

type Template = 'cave' | 'ruins' | 'outdoor' | 'volcano';
type GroundKind = 'rock' | 'grass' | 'sand' | 'basalt' | 'tiles';
type Prop =
  | 'crystals'
  | 'hangingBats'
  | 'boulders'
  | 'cliffs'
  | 'deadTrees'
  | 'volcano'
  | 'pillars'
  | 'torches'
  | 'runes'
  | 'statues'
  | 'moon'
  | 'pines'
  | 'tombs'
  | 'roots'
  | 'bones'
  | 'fog'
  | 'eggs'
  | 'scaffold'
  | 'stalactites';

interface SceneSpec {
  template: Template;
  seed: number;
  sky: [string, string];
  far: string;
  mid: string;
  near: string;
  glow: string;
  accent?: string;
  ground: [string, string, string];
  groundKind: GroundKind;
  props: Prop[];
  ambient: SceneArt['ambient'];
}

const SCENES: Record<string, SceneSpec> = {
  duskCave: {
    template: 'cave', seed: 11, sky: ['#140f26', '#3a2a5c'], far: '#2c2148', mid: '#211936', near: '#0f0b1c', glow: '#8f6bff', accent: '#b48cff',
    ground: ['#4a3d63', '#2d2541', '#16111f'], groundKind: 'rock', props: ['crystals', 'fog'], ambient: { kind: 'motes', color: '#cdb8ff', count: 18 },
  },
  mossyPath: {
    template: 'outdoor', seed: 23, sky: ['#17323b', '#6d9a7c'], far: '#3f6a68', mid: '#2f5150', near: '#18302c', glow: '#e4f5b8',
    ground: ['#5f7f45', '#3e5631', '#1e2b19'], groundKind: 'grass', props: ['boulders', 'pines', 'fog'], ambient: { kind: 'motes', color: '#eaffb8', count: 14 },
  },
  scorchedNest: {
    template: 'volcano', seed: 37, sky: ['#1f0d0b', '#6b2616'], far: '#3a1712', mid: '#2a0f0b', near: '#150806', glow: '#ff7a33',
    ground: ['#4a2a20', '#2e1913', '#140a08'], groundKind: 'basalt', props: ['deadTrees', 'eggs', 'bones'], ambient: { kind: 'embers', color: '#ffb26b', count: 22 },
  },
  batNest: {
    template: 'cave', seed: 41, sky: ['#0e0a1a', '#2b1840'], far: '#251a3a', mid: '#1a1129', near: '#0b0713', glow: '#c45cff', accent: '#e07bff',
    ground: ['#3b2d4f', '#251c33', '#110c19'], groundKind: 'rock', props: ['hangingBats', 'crystals', 'bones'], ambient: { kind: 'motes', color: '#e6b5ff', count: 14 },
  },
  quarry: {
    template: 'outdoor', seed: 53, sky: ['#3a2b2a', '#d4935c'], far: '#8a5f45', mid: '#62412f', near: '#2e1f17', glow: '#ffc98a',
    ground: ['#a3784e', '#6e4f33', '#33241a'], groundKind: 'sand', props: ['cliffs', 'scaffold', 'boulders'], ambient: { kind: 'motes', color: '#ffe2b8', count: 12 },
  },
  lavaCanyon: {
    template: 'volcano', seed: 61, sky: ['#1a0806', '#7a2010'], far: '#40140c', mid: '#2a0c08', near: '#120504', glow: '#ff5a1f',
    ground: ['#3a1d16', '#24110d', '#0e0605'], groundKind: 'basalt', props: ['cliffs'], ambient: { kind: 'embers', color: '#ffa04d', count: 30 },
  },
  golemHall: {
    template: 'ruins', seed: 71, sky: ['#0d1418', '#24323a'], far: '#1c272d', mid: '#141d22', near: '#080d10', glow: '#5fe6ff', accent: '#5fe6ff',
    ground: ['#4b5559', '#2c3438', '#121719'], groundKind: 'tiles', props: ['pillars', 'runes', 'torches'], ambient: { kind: 'motes', color: '#9ff3ff', count: 16 },
  },
  echoCave: {
    template: 'cave', seed: 83, sky: ['#081423', '#15385a'], far: '#123050', mid: '#0d2238', near: '#060f1b', glow: '#4fc3ff', accent: '#7fe3ff',
    ground: ['#2f4a63', '#1c2f42', '#0b141e'], groundKind: 'rock', props: ['crystals', 'fog'], ambient: { kind: 'motes', color: '#b8ecff', count: 18 },
  },
  statueHall: {
    template: 'ruins', seed: 97, sky: ['#1a1410', '#3d2f22'], far: '#2e241a', mid: '#221a13', near: '#0f0b08', glow: '#ffb35c', accent: '#ffb35c',
    ground: ['#6b5a44', '#45392b', '#1c1712'], groundKind: 'tiles', props: ['statues', 'pillars', 'torches'], ambient: { kind: 'motes', color: '#ffd9a0', count: 12 },
  },
  ashVolcano: {
    template: 'volcano', seed: 101, sky: ['#2b2a2e', '#8a5f4c'], far: '#4a4246', mid: '#332e31', near: '#1a1719', glow: '#ff8a4a',
    ground: ['#4d4746', '#2f2b2b', '#141212'], groundKind: 'basalt', props: ['volcano', 'deadTrees'], ambient: { kind: 'ash', color: '#c9c2bd', count: 26 },
  },
  moonForest: {
    template: 'outdoor', seed: 113, sky: ['#0b1026', '#2a3a6b'], far: '#1d2a4f', mid: '#141e3a', near: '#0a1024', glow: '#cfe0ff',
    ground: ['#2f4a3e', '#1e3029', '#0c1512'], groundKind: 'grass', props: ['moon', 'pines', 'fog'], ambient: { kind: 'fireflies', color: '#f3ff9e', count: 16 },
  },
  giantTomb: {
    template: 'outdoor', seed: 127, sky: ['#151a1c', '#3d4a46'], far: '#2a3331', mid: '#1d2422', near: '#0d1110', glow: '#a8ffcf',
    ground: ['#46524a', '#2b332e', '#111512'], groundKind: 'rock', props: ['tombs', 'deadTrees', 'bones', 'fog'], ambient: { kind: 'motes', color: '#c6ffe0', count: 14 },
  },
  flameCrater: {
    template: 'volcano', seed: 131, sky: ['#240a06', '#a0300e'], far: '#4a160b', mid: '#2e0d07', near: '#140504', glow: '#ff6a1a',
    ground: ['#41190f', '#28100a', '#0f0504'], groundKind: 'basalt', props: ['volcano', 'bones'], ambient: { kind: 'embers', color: '#ffb24d', count: 36 },
  },
  tangledBorder: {
    template: 'outdoor', seed: 149, sky: ['#160f24', '#3d3a4f'], far: '#2d2a3d', mid: '#1f1c2b', near: '#0e0c16', glow: '#c08bff', accent: '#c08bff',
    ground: ['#3d4a33', '#262e21', '#10140d'], groundKind: 'grass', props: ['roots', 'pines', 'crystals', 'fog'], ambient: { kind: 'fireflies', color: '#d8a8ff', count: 14 },
  },
  dragonNest: {
    template: 'volcano', seed: 151, sky: ['#160504', '#4a0f0a'], far: '#2e0b08', mid: '#1f0705', near: '#0c0302', glow: '#ff3b1f',
    ground: ['#3a1610', '#220c08', '#0c0403'], groundKind: 'basalt', props: ['stalactites', 'bones', 'eggs'], ambient: { kind: 'embers', color: '#ff8a4d', count: 30 },
  },
};

export const SCENE_KEYS = Object.keys(SCENES);
const FALLBACK = 'duskCave';

type Rand = () => number;
const W = BACK_W;
const H = BACK_H;

// ── 공통 조각 ──────────────────────────────────────────────

/** 바닥에서 솟은 능선. sharp 면 뾰족한 봉우리 */
function ridge(rand: Rand, baseY: number, amp: number, step: number, color: string, sharp = false, opacity = 1): string {
  let x = -30;
  let d = `M -30 ${H + 5} L -30 ${round(baseY - rand() * amp)}`;
  while (x < W + 30) {
    const nx = x + step * (0.6 + rand() * 0.8);
    const ny = baseY - rand() * amp;
    d += sharp ? ` L ${round((x + nx) / 2)} ${round(Math.min(ny, baseY - amp * (0.6 + rand() * 0.6)))} L ${round(nx)} ${round(ny)}` : ` Q ${round((x + nx) / 2)} ${round(ny - amp * 0.35 * rand())} ${round(nx)} ${round(ny)}`;
    x = nx;
  }
  return `<path d="${d} L ${W + 30} ${H + 5} Z" fill="${color}" opacity="${opacity}"/>`;
}

function stalactites(rand: Rand, count: number, minLen: number, maxLen: number, maxW: number, color: string): string {
  let d = `M -10 -5 L ${W + 10} -5 L ${W + 10} 24 Q ${W / 2} ${34 + rand() * 20} -10 24 Z`;
  for (let i = 0; i < count; i++) {
    const x = rand() * (W + 20) - 10;
    const len = minLen + rand() * (maxLen - minLen);
    const w = maxW * (0.45 + rand() * 0.55);
    d += ` M ${round(x - w)} 10 Q ${round(x - w * 0.3)} ${round(len * 0.55)} ${round(x)} ${round(len)} Q ${round(x + w * 0.3)} ${round(len * 0.55)} ${round(x + w)} 10 Z`;
  }
  return `<path d="${d}" fill="${color}"/>`;
}

/** 화면 양옆을 감싸는 바위벽 */
function sideWalls(rand: Rand, color: string, width: number): string {
  const wall = (flip: boolean) => {
    const x = (v: number) => round(flip ? W - v : v);
    const a = width * (0.7 + rand() * 0.4);
    const b = width * (0.4 + rand() * 0.5);
    const c = width * (0.8 + rand() * 0.5);
    return `<path d="M ${x(-10)} -10 L ${x(a)} -10 Q ${x(b + 30)} ${H * 0.3} ${x(b)} ${H * 0.55} Q ${x(c * 0.6)} ${H * 0.8} ${x(c)} ${H + 5} L ${x(-10)} ${H + 5} Z" fill="${color}"/>`;
  };
  return wall(false) + wall(true);
}

function glowAt(x: number, y: number, rx: number, ry: number, color: string, opacity: number): string {
  const g = gid('glow');
  return `<defs>${radial(g, [[0, color, opacity], [0.45, color, opacity * 0.45], [1, color, 0]])}</defs><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${g})"/>`;
}

function crystals(rand: Rand, color: string): string {
  const cluster = (cx: number, cy: number, s: number) => {
    let out = glowAt(cx, cy - 30 * s, 90 * s, 70 * s, color, 0.55);
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 16 * s + (rand() - 0.5) * 8 * s;
      const h = (40 + rand() * 50) * s * (i === Math.floor(n / 2) ? 1.4 : 1);
      const w = (8 + rand() * 6) * s;
      const lean = (rand() - 0.5) * 18 * s;
      const pts = `${round(x - w)},${cy} ${round(x - w * 0.9 + lean * 0.6)},${round(cy - h * 0.72)} ${round(x + lean)},${round(cy - h)} ${round(x + w * 0.9 + lean * 0.6)},${round(cy - h * 0.72)} ${round(x + w)},${cy}`;
      out += `<polygon points="${pts}" fill="${mix(color, '#1a1030', 0.25)}" stroke="${lighten(color, 0.5)}" stroke-width="1.5" stroke-linejoin="round"/>`;
      out += `<polygon points="${round(x + lean)},${round(cy - h)} ${round(x + w * 0.9 + lean * 0.6)},${round(cy - h * 0.72)} ${round(x + w)},${cy} ${round(x + lean * 0.2)},${cy}" fill="${lighten(color, 0.3)}" opacity=".55"/>`;
    }
    return out;
  };
  return cluster(70 + rand() * 30, H - 20, 0.9) + cluster(W - 80 - rand() * 30, H - 10, 1.1) + cluster(W * 0.55, H - 150, 0.45);
}

function hangingBats(rand: Rand, color: string): string {
  let out = '';
  for (let i = 0; i < 7; i++) {
    const x = 40 + rand() * (W - 80);
    const y = 50 + rand() * 90;
    const s = 0.5 + rand() * 0.5;
    out += `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s)})" fill="${color}"><path d="M 0 -30 L 0 -8" stroke="${color}" stroke-width="2"/><path d="M -12 0 C -14 10 -8 22 0 24 C 8 22 14 10 12 0 C 8 -6 -8 -6 -12 0 Z"/><path d="M -10 2 C -20 6 -22 18 -16 24 C -12 16 -8 14 -6 16 Z M 10 2 C 20 6 22 18 16 24 C 12 16 8 14 6 16 Z"/><circle cx="-4" cy="14" r="1.6" fill="#ffd36b"/><circle cx="4" cy="14" r="1.6" fill="#ffd36b"/></g>`;
  }
  return out;
}

function boulders(rand: Rand, color: string, moss: string | null): string {
  let out = '';
  for (const [x, y, r] of [[60, H - 10, 70], [W - 40, H, 90], [W * 0.62, H - 40, 34], [W * 0.25, H - 60, 26]] as const) {
    const rx = r * (0.9 + rand() * 0.3);
    out += `<ellipse cx="${x}" cy="${y}" rx="${round(rx)}" ry="${round(r * 0.75)}" fill="${color}"/>`;
    out += `<ellipse cx="${round(x - rx * 0.25)}" cy="${round(y - r * 0.4)}" rx="${round(rx * 0.45)}" ry="${round(r * 0.2)}" fill="${lighten(color, 0.12)}" opacity=".6"/>`;
    if (moss) out += `<path d="M ${round(x - rx * 0.8)} ${round(y - r * 0.35)} Q ${x} ${round(y - r * 1.05)} ${round(x + rx * 0.8)} ${round(y - r * 0.35)} Q ${x} ${round(y - r * 0.55)} ${round(x - rx * 0.8)} ${round(y - r * 0.35)} Z" fill="${moss}" opacity=".85"/>`;
  }
  return out;
}

function pine(x: number, base: number, h: number, color: string): string {
  const w = h * 0.36;
  let d = `M ${round(x - 3)} ${base} L ${round(x - 3)} ${round(base - h * 0.15)} L ${round(x + 3)} ${round(base - h * 0.15)} L ${round(x + 3)} ${base} Z`;
  for (let i = 0; i < 4; i++) {
    const top = base - h * (0.35 + i * 0.2) - h * 0.1;
    const bot = base - h * (0.1 + i * 0.2);
    const ww = w * (1 - i * 0.2);
    d += ` M ${round(x)} ${round(top)} L ${round(x + ww)} ${round(bot)} L ${round(x - ww)} ${round(bot)} Z`;
  }
  return `<path d="${d}" fill="${color}"/>`;
}

function pines(rand: Rand, far: string, near: string): string {
  let out = '';
  for (let x = -10; x < W + 20; x += 26 + rand() * 20) out += pine(x, H - 70 - rand() * 30, 110 + rand() * 80, far);
  for (const x of [20, 80, W - 70, W - 15]) out += pine(x + (rand() - 0.5) * 20, H + 4, 220 + rand() * 90, near);
  return out;
}

function deadTree(x: number, base: number, h: number, color: string, flip: boolean): string {
  const s = flip ? -1 : 1;
  const p = (dx: number, dy: number) => `${round(x + dx * s)} ${round(base - dy)}`;
  return `<path d="M ${p(-6, 0)} L ${p(-3, h * 0.6)} L ${p(-30, h * 0.85)} L ${p(-28, h * 0.88)} L ${p(-1, h * 0.68)} L ${p(2, h)} L ${p(6, h)} L ${p(5, h * 0.7)} L ${p(26, h * 0.92)} L ${p(28, h * 0.89)} L ${p(7, h * 0.55)} L ${p(8, 0)} Z" fill="${color}"/>`;
}

function cliffs(rand: Rand, color: string, light: string): string {
  const side = (flip: boolean) => {
    let out = '';
    let y = H + 5;
    let d = `M ${flip ? W + 10 : -10} ${H + 5}`;
    while (y > 120) {
      const x = 70 + rand() * 90;
      d += ` L ${flip ? W - x : x} ${round(y)}`;
      y -= 90 + rand() * 90;
      d += ` L ${flip ? W - x - (rand() - 0.5) * 30 : x + (rand() - 0.5) * 30} ${round(y)}`;
    }
    d += ` L ${flip ? W + 10 : -10} ${round(y)} Z`;
    out += `<path d="${d}" fill="${color}"/>`;
    for (let i = 0; i < 6; i++) {
      const yy = 160 + rand() * (H - 200);
      out += `<path d="M ${flip ? W - 10 : 10} ${round(yy)} L ${flip ? W - 60 - rand() * 50 : 60 + rand() * 50} ${round(yy + 6)}" stroke="${light}" stroke-width="2" opacity=".35"/>`;
    }
    return out;
  };
  return side(false) + side(true);
}

function scaffold(color: string): string {
  return `<g stroke="${color}" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M 380 ${H} L 380 ${H - 230} M 440 ${H} L 440 ${H - 230} M 372 ${H - 220} L 448 ${H - 220} M 372 ${H - 140} L 448 ${H - 140} M 380 ${H - 140} L 440 ${H - 220} M 380 ${H - 60} L 440 ${H - 140}"/>
    <path d="M 440 ${H - 230} L 520 ${H - 260} M 500 ${H - 252} L 500 ${H - 190}" stroke-width="4"/></g>
    <rect x="490" y="${H - 192}" width="20" height="16" rx="3" fill="${color}"/>`;
}

function volcanoCone(rand: Rand, color: string, glow: string, x: number, w: number, h: number): string {
  const base = H - 40;
  const top = base - h;
  let out = glowAt(x, top, 120, 80, glow, 0.8);
  out += `<path d="M ${x - w} ${base} L ${x - 34} ${top + 6} Q ${x} ${top - 6} ${x + 34} ${top + 6} L ${x + w} ${base} Z" fill="${color}"/>`;
  out += `<path d="M ${x - 26} ${top + 8} Q ${x} ${top + 18} ${x + 26} ${top + 8}" stroke="${lighten(glow, 0.3)}" stroke-width="5" fill="none"/>`;
  for (let i = 0; i < 3; i++) {
    const sx = x + (i - 1) * 16;
    const ex = sx + (rand() - 0.5) * 120;
    out += `<path d="M ${sx} ${top + 12} Q ${round((sx + ex) / 2 + (rand() - 0.5) * 40)} ${round(top + h * 0.5)} ${round(ex)} ${round(base - 10)}" stroke="${glow}" stroke-width="${round(3 + rand() * 3)}" fill="none" opacity=".85"/>`;
  }
  const smoke = gid('smoke');
  out += `<defs><filter id="${smoke}"><feGaussianBlur stdDeviation="10"/></filter></defs><g filter="url(#${smoke})" fill="${mix(color, '#888888', 0.3)}" opacity=".7">`;
  for (let i = 0; i < 5; i++) out += `<ellipse cx="${round(x + (rand() - 0.3) * 80 + i * 18)}" cy="${round(top - 30 - i * 40)}" rx="${round(40 + i * 14)}" ry="${round(24 + i * 6)}"/>`;
  return `${out}</g>`;
}

function pillars(rand: Rand, color: string, light: string, count: number): string {
  let out = '';
  const gap = W / count;
  for (let i = 0; i < count; i++) {
    const x = gap * (i + 0.5) + (rand() - 0.5) * 20;
    if (Math.abs(x - W / 2) < 90) continue;
    const w = 44 + rand() * 10;
    const broken = rand() < 0.3;
    const top = broken ? 260 + rand() * 120 : 40;
    out += `<rect x="${round(x - w / 2)}" y="${round(top)}" width="${round(w)}" height="${round(H - top)}" fill="${color}"/>`;
    out += `<rect x="${round(x - w / 2)}" y="${round(top)}" width="8" height="${round(H - top)}" fill="${light}" opacity=".25"/>`;
    if (broken) out += `<path d="M ${round(x - w / 2)} ${round(top)} L ${round(x - w / 4)} ${round(top - 18)} L ${round(x)} ${round(top - 4)} L ${round(x + w / 4)} ${round(top - 22)} L ${round(x + w / 2)} ${round(top)} Z" fill="${color}"/>`;
    else out += `<rect x="${round(x - w / 2 - 8)}" y="${round(top)}" width="${round(w + 16)}" height="18" fill="${color}"/>`;
    out += `<rect x="${round(x - w / 2 - 10)}" y="${H - 26}" width="${round(w + 20)}" height="26" fill="${color}"/>`;
  }
  return out;
}

function torches(xs: number[], y: number, glow: string, metal: string): string {
  return xs
    .map(
      (x) =>
        `${glowAt(x, y - 20, 90, 90, glow, 0.7)}<path d="M ${x - 9} ${y} L ${x + 9} ${y} L ${x + 5} ${y + 22} L ${x - 5} ${y + 22} Z" fill="${metal}"/><path d="M ${x} ${y - 2} C ${x - 12} ${y - 4} ${x - 10} ${y - 18} ${x - 4} ${y - 24} C ${x - 4} ${y - 16} ${x + 2} ${y - 18} ${x + 2} ${y - 26} C ${x + 10} ${y - 18} ${x + 12} ${y - 6} ${x} ${y - 2} Z" fill="${lighten(glow, 0.2)}"/><path d="M ${x} ${y - 4} C ${x - 5} ${y - 6} ${x - 4} ${y - 12} ${x} ${y - 16} C ${x + 4} ${y - 12} ${x + 5} ${y - 6} ${x} ${y - 4} Z" fill="#fff6d0"/>`,
    )
    .join('');
}

function runes(rand: Rand, glow: string): string {
  let out = glowAt(W / 2, 330, 150, 150, glow, 0.35);
  out += `<circle cx="${W / 2}" cy="330" r="92" fill="none" stroke="${glow}" stroke-width="3" opacity=".7"/><circle cx="${W / 2}" cy="330" r="74" fill="none" stroke="${glow}" stroke-width="1.5" opacity=".5"/>`;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = W / 2 + Math.cos(a) * 83;
    const y = 330 + Math.sin(a) * 83;
    out += `<path d="M ${round(x - 5)} ${round(y - 6)} L ${round(x + 5)} ${round(y)} L ${round(x - 5)} ${round(y + 6)}" stroke="${lighten(glow, 0.4)}" stroke-width="2.5" fill="none" opacity="${round(0.6 + rand() * 0.4)}"/>`;
  }
  out += `<path d="M ${W / 2} 270 L ${W / 2 + 34} 330 L ${W / 2} 390 L ${W / 2 - 34} 330 Z" fill="none" stroke="${lighten(glow, 0.3)}" stroke-width="3" opacity=".8"/>`;
  return out;
}

function statues(color: string, light: string): string {
  const statue = (x: number, flip: boolean) => {
    const s = flip ? -1 : 1;
    const p = (dx: number, dy: number) => `${round(x + dx * s)} ${round(H - dy)}`;
    return `<rect x="${x - 50}" y="${H - 60}" width="100" height="60" fill="${color}"/><rect x="${x - 56}" y="${H - 72}" width="112" height="16" fill="${color}"/>
      <path d="M ${p(-30, 72)} L ${p(-26, 230)} Q ${p(0, 250)} ${p(26, 230)} L ${p(30, 72)} Z" fill="${color}"/>
      <circle cx="${x}" cy="${H - 268}" r="26" fill="${color}"/><path d="M ${p(-18, 290)} L ${p(0, 318)} L ${p(18, 290)} Z" fill="${color}"/>
      <path d="M ${p(18, 120)} L ${p(58, 130)} L ${p(56, 210)} L ${p(28, 220)} Z" fill="${color}"/><path d="M ${p(-36, 120)} L ${p(-40, 330)}" stroke="${color}" stroke-width="8"/>
      <rect x="${x - 26}" y="${H - 236}" width="8" height="150" fill="${light}" opacity=".18"/>`;
  };
  return statue(90, false) + statue(W - 90, true);
}

function tombs(rand: Rand, color: string, light: string): string {
  let out = '';
  for (const [x, y, s] of [[70, H - 10, 1.2], [150, H - 50, 0.7], [W - 150, H - 40, 0.8], [W - 60, H - 5, 1.3], [W * 0.5 + 60, H - 90, 0.5]] as const) {
    const w = 34 * s;
    const h = (70 + rand() * 20) * s;
    const tilt = (rand() - 0.5) * 10;
    out += `<g transform="rotate(${round(tilt)} ${x} ${y})"><path d="M ${round(x - w)} ${y} L ${round(x - w)} ${round(y - h)} Q ${x} ${round(y - h - w * 1.1)} ${round(x + w)} ${round(y - h)} L ${round(x + w)} ${y} Z" fill="${color}"/><path d="M ${x} ${round(y - h + 4)} L ${x} ${round(y - h * 0.45)} M ${round(x - w * 0.45)} ${round(y - h * 0.8)} L ${round(x + w * 0.45)} ${round(y - h * 0.8)}" stroke="${light}" stroke-width="${round(4 * s)}" opacity=".35"/></g>`;
  }
  return out;
}

function roots(rand: Rand, color: string): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    const x0 = rand() * W;
    const x1 = x0 + (rand() - 0.5) * 360;
    const peak = 180 + rand() * 300;
    const w = 10 + rand() * 18;
    out += `<path d="M ${round(x0)} ${H + 10} C ${round(x0)} ${round(H - peak)} ${round(x1)} ${round(H - peak)} ${round(x1)} ${H + 10}" stroke="${color}" stroke-width="${round(w)}" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}

function bones(rand: Rand, color: string): string {
  let out = '';
  for (let i = 0; i < 5; i++) {
    const x = 30 + rand() * (W - 60);
    const y = H - 6 - rand() * 30;
    const a = (rand() - 0.5) * 60;
    out += `<g transform="rotate(${round(a)} ${round(x)} ${round(y)})" fill="${color}"><rect x="${round(x - 18)}" y="${round(y - 3)}" width="36" height="6" rx="3"/><circle cx="${round(x - 18)}" cy="${round(y - 4)}" r="5"/><circle cx="${round(x - 18)}" cy="${round(y + 4)}" r="5"/><circle cx="${round(x + 18)}" cy="${round(y - 4)}" r="5"/><circle cx="${round(x + 18)}" cy="${round(y + 4)}" r="5"/></g>`;
  }
  out += `<g fill="${color}"><path d="M ${W - 120} ${H} C ${W - 130} ${H - 70} ${W - 30} ${H - 90} ${W - 20} ${H - 20} L ${W - 20} ${H} Z"/><circle cx="${W - 92}" cy="${H - 44}" r="9" fill="#00000066"/><circle cx="${W - 58}" cy="${H - 46}" r="9" fill="#00000066"/></g>`;
  return out;
}

function eggs(glow: string): string {
  const egg = (x: number, y: number, s: number) => {
    const g = gid('egg');
    return `<defs>${radial(g, [[0, lighten(glow, 0.55)], [0.6, glow], [1, darken(glow, 0.45)]], 0.4, 0.35, 0.7)}</defs><ellipse cx="${x}" cy="${round(y - 30 * s)}" rx="${round(22 * s)}" ry="${round(30 * s)}" fill="url(#${g})"/><path d="M ${round(x - 10 * s)} ${round(y - 40 * s)} l ${round(6 * s)} ${round(8 * s)} l ${round(-4 * s)} ${round(8 * s)}" stroke="${darken(glow, 0.5)}" stroke-width="2" fill="none"/>`;
  };
  return glowAt(W * 0.8, H - 30, 110, 60, glow, 0.5) + egg(W * 0.76, H, 1) + egg(W * 0.86, H + 4, 0.8) + egg(W * 0.7, H + 6, 0.65);
}

function fog(color: string): string {
  const f = gid('fog');
  return `<defs><filter id="${f}"><feGaussianBlur stdDeviation="16"/></filter></defs><g filter="url(#${f})" fill="${color}" opacity=".35"><ellipse cx="120" cy="${H - 60}" rx="220" ry="40"/><ellipse cx="${W - 100}" cy="${H - 90}" rx="200" ry="34"/><ellipse cx="${W / 2}" cy="${H - 20}" rx="300" ry="40"/></g>`;
}

function stars(rand: Rand): string {
  let out = '';
  for (let i = 0; i < 70; i++) out += `<circle cx="${round(rand() * W)}" cy="${round(rand() * H * 0.6)}" r="${round(0.6 + rand() * 1.6)}" fill="#fff" opacity="${round(0.3 + rand() * 0.7)}"/>`;
  return out;
}

function moon(glow: string): string {
  return `${glowAt(390, 150, 170, 170, glow, 0.5)}<circle cx="390" cy="150" r="56" fill="${lighten(glow, 0.6)}"/><circle cx="372" cy="136" r="10" fill="${glow}" opacity=".5"/><circle cx="408" cy="170" r="14" fill="${glow}" opacity=".4"/><circle cx="412" cy="128" r="6" fill="${glow}" opacity=".45"/>`;
}

// ── 템플릿 ────────────────────────────────────────────────

function compose(spec: SceneSpec, rand: Rand): string {
  const sky = gid('sky');
  const has = (p: Prop) => spec.props.includes(p);
  let out = `<defs>${linear(sky, [[0, spec.sky[0]], [1, spec.sky[1]]])}</defs><rect width="${W}" height="${H}" fill="url(#${sky})"/>`;

  switch (spec.template) {
    case 'cave':
      out += glowAt(W / 2, H - 140, 360, 320, spec.glow, 0.6);
      out += ridge(rand, H - 200, 160, 60, spec.far, true, 0.9);
      out += stalactites(rand, 14, 60, 200, 26, spec.far);
      out += ridge(rand, H - 60, 90, 70, spec.mid);
      out += stalactites(rand, 9, 50, 150, 34, spec.mid);
      if (has('hangingBats')) out += hangingBats(rand, darken(spec.near, 0.2));
      out += sideWalls(rand, spec.near, 60);
      if (has('crystals')) out += crystals(rand, spec.accent ?? spec.glow);
      break;
    case 'ruins': {
      out += `<g opacity=".55">${Array.from({ length: 14 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${round(c * 84 - (r % 2) * 42)}" y="${r * 54}" width="80" height="50" rx="3" fill="${spec.far}"/>`).join('')).join('')}</g>`;
      out += glowAt(W / 2, H - 140, 300, 260, spec.glow, 0.3);
      if (has('runes')) out += runes(rand, spec.accent ?? spec.glow);
      out += `<path d="M ${W / 2 - 110} ${H} L ${W / 2 - 110} 300 Q ${W / 2} 170 ${W / 2 + 110} 300 L ${W / 2 + 110} ${H} Z" fill="${darken(spec.sky[0], 0.3)}" opacity=".7"/>`;
      if (has('pillars')) out += pillars(rand, spec.mid, lighten(spec.mid, 0.4), 6);
      if (has('statues')) out += statues(spec.near, lighten(spec.mid, 0.5));
      if (has('torches')) out += torches([W * 0.2, W * 0.8], 300, spec.glow, darken(spec.near, 0.1));
      out += `<rect y="0" width="${W}" height="40" fill="${spec.near}"/>`;
      break;
    }
    case 'outdoor':
      if (spec.glow && has('moon')) out += stars(rand) + moon(spec.glow);
      else out += glowAt(W / 2, H - 160, 380, 260, spec.glow, 0.45);
      out += ridge(rand, H - 300, 140, 90, spec.far, true, 0.85);
      if (has('cliffs')) out += cliffs(rand, spec.mid, lighten(spec.mid, 0.4));
      out += ridge(rand, H - 150, 90, 110, mix(spec.far, spec.mid, 0.6));
      if (has('pines')) out += pines(rand, spec.mid, spec.near);
      if (has('roots')) out += roots(rand, spec.near);
      if (has('crystals')) out += crystals(rand, spec.accent ?? spec.glow);
      if (has('tombs')) out += tombs(rand, spec.mid, lighten(spec.mid, 0.4));
      if (has('deadTrees')) out += deadTree(70, H, 240, spec.near, false) + deadTree(W - 60, H, 200, spec.near, true);
      if (has('scaffold')) out += scaffold(darken(spec.mid, 0.2));
      if (has('boulders')) out += boulders(rand, spec.near, spec.groundKind === 'grass' ? '#5d8a3a' : null);
      break;
    case 'volcano':
      out += glowAt(W / 2, H, 420, 320, spec.glow, 0.6);
      if (has('volcano')) out += volcanoCone(rand, spec.far, spec.glow, W * 0.55, 230, 360);
      out += ridge(rand, H - 220, 150, 70, spec.far, true, 0.9);
      if (has('stalactites')) out += stalactites(rand, 12, 70, 230, 30, spec.mid);
      if (has('cliffs')) out += cliffs(rand, spec.mid, spec.glow);
      out += ridge(rand, H - 70, 100, 60, spec.mid, true);
      // 지평선 너머 용암 빛
      out += glowAt(W / 2, H, 460, 70, spec.glow, 0.75) + `<rect y="${H - 5}" width="${W}" height="5" fill="${lighten(spec.glow, 0.3)}" opacity=".7"/>`;
      if (has('deadTrees')) out += deadTree(60, H, 260, spec.near, false) + deadTree(W - 50, H, 210, spec.near, true);
      if (has('eggs')) out += eggs(spec.glow);
      break;
  }
  if (has('bones')) out += bones(rand, mix(spec.near, '#d8cbb0', 0.35));
  if (has('fog')) out += fog(lighten(spec.sky[1], 0.4));
  return out;
}

function ground(spec: SceneSpec, rand: Rand): string {
  const g = gid('gr');
  const [top, mid, bottom] = spec.ground;
  let out = `<defs>${linear(g, [[0, top], [0.35, mid], [1, bottom]])}</defs><rect width="${W}" height="${GROUND_H}" fill="url(#${g})"/>`;
  // 윗면 테두리 — 지평선이 또렷해야 캐릭터가 서 있어 보인다
  let lip = 'M 0 0';
  for (let x = 0; x <= W; x += 30) lip += ` L ${x} ${round(3 + rand() * 6)}`;
  out += `<path d="${lip} L ${W} 0 Z" fill="${lighten(top, 0.25)}"/>`;
  switch (spec.groundKind) {
    case 'rock':
      for (let i = 0; i < 26; i++) {
        const x = rand() * W;
        const y = 20 + rand() * (GROUND_H - 40);
        const r = 4 + rand() * 16 * (y / GROUND_H + 0.3);
        out += `<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(r * 1.6)}" ry="${round(r * 0.6)}" fill="${lighten(mid, 0.15)}" opacity=".55"/><ellipse cx="${round(x)}" cy="${round(y + r * 0.35)}" rx="${round(r * 1.6)}" ry="${round(r * 0.3)}" fill="${darken(bottom, 0.3)}" opacity=".35"/>`;
      }
      for (let i = 0; i < 6; i++) {
        const x = rand() * W;
        out += `<path d="M ${round(x)} ${round(20 + rand() * 40)} l ${round((rand() - 0.5) * 40)} ${round(20 + rand() * 30)} l ${round((rand() - 0.5) * 40)} ${round(20 + rand() * 30)}" stroke="${darken(bottom, 0.3)}" stroke-width="2" fill="none" opacity=".5"/>`;
      }
      break;
    case 'grass':
      for (let x = -4; x < W + 4; x += 5 + rand() * 5) {
        const h = 8 + rand() * 14;
        out += `<path d="M ${round(x)} 6 L ${round(x + 2 + (rand() - 0.5) * 6)} ${round(6 - h)} L ${round(x + 4)} 6 Z" fill="${lighten(top, 0.2 + rand() * 0.2)}"/>`;
      }
      for (let i = 0; i < 20; i++) out += `<circle cx="${round(rand() * W)}" cy="${round(16 + rand() * 120)}" r="${round(1.5 + rand() * 2)}" fill="${['#ffe08a', '#ff9fc4', '#ffffff'][i % 3]}" opacity=".7"/>`;
      for (let i = 0; i < 14; i++) out += `<ellipse cx="${round(rand() * W)}" cy="${round(40 + rand() * (GROUND_H - 60))}" rx="${round(20 + rand() * 40)}" ry="${round(3 + rand() * 4)}" fill="${darken(mid, 0.2)}" opacity=".4"/>`;
      break;
    case 'sand':
      for (let i = 0; i < 12; i++) {
        const y = 20 + i * 24 + rand() * 10;
        out += `<path d="M -10 ${round(y)} Q ${round(W * 0.3)} ${round(y - 8)} ${round(W * 0.6)} ${round(y + 2)} T ${W + 10} ${round(y)}" stroke="${lighten(mid, 0.2)}" stroke-width="2" fill="none" opacity=".35"/>`;
      }
      for (let i = 0; i < 14; i++) out += `<polygon points="${[0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; const r = 5 + rand() * 9; return `${round(rand() * 0 + Math.cos(a) * r)},${round(Math.sin(a) * r * 0.6)}`; }).join(' ')}" transform="translate(${round(rand() * W)} ${round(20 + rand() * (GROUND_H - 40))})" fill="${darken(mid, 0.15)}"/>`;
      break;
    case 'basalt': {
      const f = gid('lava');
      out += `<defs><filter id="${f}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter></defs>`;
      let cracks = '';
      for (let i = 0; i < 7; i++) {
        let x = rand() * W;
        let y = 14 + rand() * (GROUND_H - 60);
        const dir = rand() < 0.5 ? -1 : 1;
        cracks += `M ${round(x)} ${round(y)}`;
        for (let k = 0; k < 3; k++) {
          x += dir * (24 + rand() * 46);
          y += (rand() - 0.4) * 16;
          cracks += ` L ${round(x)} ${round(y)}`;
        }
      }
      out += `<path d="${cracks}" stroke="${spec.glow}" stroke-width="7" fill="none" filter="url(#${f})" opacity=".8"/><path d="${cracks}" stroke="${lighten(spec.glow, 0.45)}" stroke-width="2" fill="none"/>`;
      for (let i = 0; i < 16; i++) out += `<ellipse cx="${round(rand() * W)}" cy="${round(20 + rand() * (GROUND_H - 30))}" rx="${round(8 + rand() * 20)}" ry="${round(3 + rand() * 6)}" fill="${lighten(mid, 0.1)}" opacity=".5"/>`;
      break;
    }
    case 'tiles': {
      let lines = '';
      for (let i = 1; i < 8; i++) {
        const y = Math.pow(i / 8, 1.6) * GROUND_H;
        lines += `M 0 ${round(y)} L ${W} ${round(y)} `;
      }
      for (let i = -8; i <= 8; i++) lines += `M ${round(W / 2 + i * 40)} 0 L ${round(W / 2 + i * 150)} ${GROUND_H} `;
      out += `<path d="${lines}" stroke="${darken(bottom, 0.25)}" stroke-width="2" opacity=".55"/>`;
      for (let i = 0; i < 10; i++) out += `<rect x="${round(rand() * W)}" y="${round(10 + rand() * (GROUND_H - 30))}" width="${round(20 + rand() * 30)}" height="${round(4 + rand() * 6)}" fill="${lighten(mid, 0.15)}" opacity=".35"/>`;
      break;
    }
  }
  const shadow = gid('gs');
  out += `<defs>${linear(shadow, [[0, '#000', 0], [1, '#000', 0.45]])}</defs><rect width="${W}" height="${GROUND_H}" fill="url(#${shadow})"/>`;
  return out;
}

export function sceneArt(key: string, res: number): SceneArt {
  const spec = SCENES[key] ?? SCENES[FALLBACK]!;
  const rand = seeded(spec.seed);
  return {
    backdrop: { svg: svgDoc(W, H, compose(spec, rand), res), width: W, height: H },
    ground: { svg: svgDoc(W, GROUND_H, ground(spec, rand), res), width: W, height: GROUND_H },
    top: spec.sky[0],
    bottom: darken(spec.ground[2], 0.35),
    ambient: spec.ambient,
  };
}

/** 메뉴용 작은 썸네일 색 (사냥터 목록) */
export function sceneColors(key: string): { sky: [string, string]; glow: string; ground: string } {
  const spec = SCENES[key] ?? SCENES[FALLBACK]!;
  return { sky: spec.sky, glow: spec.glow, ground: spec.ground[0] };
}
