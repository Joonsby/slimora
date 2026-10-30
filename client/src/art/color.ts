/** '#rrggbb' 색 계산. 아트가 기본색 하나로 밝은 면 · 그림자 · 외곽선을 만든다 */

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function toHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb);
}

export const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t);
export const darken = (hex: string, t: number) => mix(hex, '#000000', t);

/** 그림자 쪽은 채도를 살려 어둡게 — 검정만 섞으면 탁해진다 */
export function shade(hex: string, t: number): string {
  const [r, g, b] = parseHex(hex);
  const max = Math.max(r, g, b);
  const deep = toHex([r === max ? r : r * 0.55, g === max ? g : g * 0.55, b === max ? b : b * 0.55]);
  return darken(mix(hex, deep, 0.5), t);
}

/** 기본색 하나에서 뽑는 4단계 */
export function ramp(hex: string) {
  return { light: lighten(hex, 0.35), base: hex, dark: shade(hex, 0.28), line: shade(hex, 0.62) };
}

export const hexToNumber = (hex: string) => parseInt(hex.replace('#', ''), 16);
export const numberToHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
