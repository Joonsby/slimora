import type { FamilyDef } from '../core/model/config';

/** 민트빛 젤리. 몸 텍스처는 회색조라 이 색이 곧 몸 윗면 색이다 */
export const SLIME_BASE_COLOR = 0x86ecc6;
/** 흡수 총합이 이만큼이면 최대로 물든다 */
const FULL_TINT_AT = 1500;
const MAX_STRENGTH = 0.75;

/**
 * 가장 많이 흡수한 계열 색 쪽으로 물든다. 총량이 많고 그 계열 비중이 클수록 진하게 (GAME_DESIGN D11).
 * RGB 로 섞으면 보색끼리 탁해지므로(민트 + 주황 = 카키) 색상환을 따라 돌린다
 */
export function slimeTint(absorption: Readonly<Record<string, number>>, families: readonly FamilyDef[]): number {
  const total = families.reduce((sum, f) => sum + (absorption[f.id] ?? 0), 0);
  if (total <= 0) return SLIME_BASE_COLOR;
  const dominant = families.reduce((best, f) => ((absorption[f.id] ?? 0) > (absorption[best.id] ?? 0) ? f : best));
  const share = (absorption[dominant.id] ?? 0) / total;
  const t = MAX_STRENGTH * Math.min(1, total / FULL_TINT_AT) * share;

  const [h0, s0, l0] = toHsl(SLIME_BASE_COLOR);
  const [h1, s1raw, l1raw] = toHsl(parseInt(dominant.color.slice(1), 16));
  // 슬라임답게 밝고 선명하게
  const s1 = Math.max(s1raw, 0.55);
  const l1 = Math.min(0.72, Math.max(0.62, l1raw));
  let dh = h1 - h0;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return fromHsl((h0 + dh * t + 360) % 360, s0 + (s1 - s0) * t, l0 + (l1 - l0) * t);
}

function toHsl(color: number): [number, number, number] {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255);
  return (to(r) << 16) | (to(g) << 8) | to(b);
}
