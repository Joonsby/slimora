/** SVG 문자열 조립. 아트는 전부 viewBox 좌표(디자인 단위)로 그리고, 픽셀 크기는 res 배율로 정한다 */

export interface Sprite {
  svg: string;
  /** 디자인 단위 크기 */
  width: number;
  height: number;
}

export function svgDoc(width: number, height: number, body: string, res = 1): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * res)}" height="${Math.round(height * res)}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

export function dataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 같은 문서 안에서 겹치지 않는 그라데이션 id */
let uid = 0;
export const gid = (prefix: string) => `${prefix}${++uid}`;

export const linear = (id: string, stops: [number, string, number?][], x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>`;

export const radial = (id: string, stops: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</radialGradient>`;

/** 결정적 난수 — 같은 장면은 늘 같은 모양 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export const round = (n: number) => Math.round(n * 10) / 10;
