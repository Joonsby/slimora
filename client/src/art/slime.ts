import { parseHex, toHex } from './color';
import { gid, linear, svgDoc, type Sprite } from './svg';

/**
 * 슬라임은 층으로 나눈다 — 뒤 장식 · 몸 · 얼굴 · 앞 장식.
 * 전투 화면은 회색조 몸에 흡수 색을 tint(곱하기)로 입히고, 얼굴 · 장식은 제 색 그대로 둔다.
 * 디자인 단위 200×170, 바닥 중앙 (100, 160)
 */
export const SLIME_W = 200;
export const SLIME_H = 170;
export const SLIME_FOOT_Y = 160;

/** tint 로 곱해질 회색조. 맨 위가 흰색이라 tint 색이 곧 몸 윗면 색이 된다 */
const GRAY = { top: '#ffffff', bottom: '#b0b0b0', line: '#4a4a4a', under: '#7a7a7a' };

const BODY_PATH = 'M 44 160 C 30 160 26 146 32 130 C 42 94 64 62 100 62 C 136 62 158 94 168 130 C 174 146 170 160 156 160 Z';

export type SlimePreset = 'vampire' | 'iron' | 'flame' | null;

interface Palette {
  top: string;
  bottom: string;
  line: string;
  under: string;
}

function body(p: Palette): string {
  const fill = gid('sb');
  const clip = gid('sc');
  return `<defs>${linear(fill, [[0, p.top], [0.55, p.top], [1, p.bottom]])}<clipPath id="${clip}"><path d="${BODY_PATH}"/></clipPath></defs>
    <path d="${BODY_PATH}" fill="url(#${fill})"/>
    <g clip-path="url(#${clip})">
      <ellipse cx="100" cy="170" rx="80" ry="26" fill="${p.under}" opacity=".45"/>
      <ellipse cx="150" cy="120" rx="16" ry="40" fill="${p.under}" opacity=".18"/>
    </g>
    <path d="${BODY_PATH}" fill="none" stroke="${p.line}" stroke-width="4.5" stroke-linejoin="round"/>`;
}

const EYES: Record<string, { iris: string; glint: string }> = {
  default: { iris: '#1d2530', glint: '#ffffff' },
  vampire: { iris: '#5c0b22', glint: '#ff9db2' },
  flame: { iris: '#4a2100', glint: '#ffe08a' },
  iron: { iris: '#1d2530', glint: '#ffffff' },
};

function face(preset: SlimePreset, blink: boolean): string {
  const eye = EYES[preset ?? 'default']!;
  const eyes = blink
    ? `<path d="M 77 122 Q 84 128 91 122 M 109 122 Q 116 128 123 122" fill="none" stroke="${eye.iris}" stroke-width="3.6" stroke-linecap="round"/>`
    : `<ellipse cx="84" cy="120" rx="7.5" ry="10.5" fill="${eye.iris}"/><ellipse cx="116" cy="120" rx="7.5" ry="10.5" fill="${eye.iris}"/>
       <circle cx="86.8" cy="115.8" r="3.1" fill="${eye.glint}"/><circle cx="118.8" cy="115.8" r="3.1" fill="${eye.glint}"/>
       <circle cx="82" cy="124.5" r="1.4" fill="${eye.glint}" opacity=".8"/><circle cx="114" cy="124.5" r="1.4" fill="${eye.glint}" opacity=".8"/>`;
  const fangs = preset === 'vampire' ? `<path d="M 95 133 L 97.5 140 L 100 133.5 Z M 100 133.5 L 102.5 140 L 105 133 Z" fill="#fff" stroke="#5c0b22" stroke-width="1" stroke-linejoin="round"/>` : '';
  return `
    <ellipse cx="74" cy="90" rx="15" ry="8" transform="rotate(-35 74 90)" fill="#fff" opacity=".72"/>
    <circle cx="58" cy="108" r="4.2" fill="#fff" opacity=".55"/>
    <path d="M 132 76 Q 146 86 152 104" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"/>
    ${eyes}
    <ellipse cx="68" cy="133" rx="9" ry="4.6" fill="#ff7b9c" opacity=".5"/><ellipse cx="132" cy="133" rx="9" ry="4.6" fill="#ff7b9c" opacity=".5"/>
    <path d="M 93 131 Q 100 138 107 131" fill="none" stroke="${eye.iris}" stroke-width="3" stroke-linecap="round"/>
    ${fangs}`;
}

function back(preset: SlimePreset): string {
  if (preset !== 'vampire') return '';
  const g = gid('wing');
  const wing = 'M 46 116 C 30 96 10 88 0 98 C 9 103 11 112 6 120 C 17 117 24 124 21 133 C 30 127 39 129 42 137 Z';
  return `<defs>${linear(g, [[0, '#6b2f86'], [1, '#2a0f3a']])}</defs>
    <g stroke="#1a0624" stroke-width="3" stroke-linejoin="round">
      <path d="${wing}" fill="url(#${g})"/>
      <path d="${wing}" fill="url(#${g})" transform="translate(200 0) scale(-1 1)"/>
      <path d="M 79 70 L 70 42 L 92 63 Z M 121 70 L 130 42 L 108 63 Z" fill="#4a1d5e"/>
    </g>
    <path d="M 44 116 L 14 101 M 42 124 L 15 118 M 42 132 L 24 129 M 156 116 L 186 101 M 158 124 L 185 118 M 158 132 L 176 129" stroke="#a46bc4" stroke-width="1.6" opacity=".6"/>`;
}

function front(preset: SlimePreset): string {
  if (preset === 'iron') {
    const steel = gid('steel');
    return `<defs>${linear(steel, [[0, '#f4f7fb'], [1, '#93a0b2']])}</defs>
      <path d="M 100 70 C 95 44 126 32 150 46 C 130 48 120 56 113 72 Z" fill="#e5484d" stroke="#8f2328" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 56 96 C 56 46 144 46 144 96 Z" fill="url(#${steel})" stroke="#46526a" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M 100 54 L 100 94" stroke="#46526a" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse cx="78" cy="70" rx="11" ry="5.5" transform="rotate(-28 78 70)" fill="#fff" opacity=".75"/>
      <rect x="49" y="90" width="102" height="15" rx="7.5" fill="#c8d1dd" stroke="#46526a" stroke-width="4.5"/>
      <circle cx="64" cy="97.5" r="2.4" fill="#46526a"/><circle cx="136" cy="97.5" r="2.4" fill="#46526a"/>`;
  }
  if (preset === 'flame') {
    const outer = gid('fo');
    const inner = gid('fi');
    const flame = (x: number, y: number, s: number) =>
      `<g transform="translate(${x} ${y}) scale(${s})">
        <path d="M0 0 C -14 0 -18 -14 -11 -26 C -8 -19 -4 -19 -4 -24 C -6 -36 0 -46 9 -56 C 7 -42 18 -34 16 -18 C 15 -6 9 0 0 0 Z" fill="url(#${outer})" stroke="#b3360f" stroke-width="${2.2 / s}" stroke-linejoin="round"/>
        <path d="M0 0 C -7 0 -9 -9 -5 -14 C -3 -10 0 -10 0 -14 C 0 -20 4 -24 7 -27 C 7 -18 10 -14 9 -8 C 8 -3 5 0 0 0 Z" fill="url(#${inner})"/>
      </g>`;
    return `<defs>${linear(outer, [[0, '#ffd84a'], [1, '#ff5a1f']], 0, -1)}${linear(inner, [[0, '#fff6c8'], [1, '#ffd84a']])}</defs>
      ${flame(80, 72, 0.7)}${flame(120, 72, 0.7)}${flame(100, 66, 1)}`;
  }
  return '';
}

export interface SlimeLayers {
  back: Sprite | null;
  body: Sprite;
  face: Sprite;
  blink: Sprite;
  front: Sprite | null;
}

const sprite = (inner: string, res: number): Sprite => ({ svg: svgDoc(SLIME_W, SLIME_H, inner, res), width: SLIME_W, height: SLIME_H });

/** 전투 화면용 층. 몸은 회색조 — tint 로 색을 입힌다 */
export function slimeLayers(preset: SlimePreset, res: number): SlimeLayers {
  const b = back(preset);
  const f = front(preset);
  return {
    back: b ? sprite(b, res) : null,
    body: sprite(body(GRAY), res),
    face: sprite(face(preset, false), res),
    blink: sprite(face(preset, true), res),
    front: f ? sprite(f, res) : null,
  };
}

/** 회색조에 tint 를 곱한 색 — 전투 화면과 같은 색이 나온다 */
function multiply(gray: string, tint: string): string {
  const g = parseHex(gray);
  const t = parseHex(tint);
  return toHex([0, 1, 2].map((i) => (g[i]! * t[i]!) / 255) as [number, number, number]);
}

/** 메뉴용 초상 한 장 */
export function slimePortrait(color: string, preset: SlimePreset, res = 1): string {
  const p: Palette = { top: multiply(GRAY.top, color), bottom: multiply(GRAY.bottom, color), line: multiply(GRAY.line, color), under: multiply(GRAY.under, color) };
  return svgDoc(SLIME_W, SLIME_H, back(preset) + body(p) + face(preset, false) + front(preset), res);
}
