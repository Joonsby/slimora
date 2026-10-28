import type { FamilyDef } from '../core/model/config';

/** 옅은 민트빛 젤리. 무채색에 가까워야 어떤 계열 색과 섞여도 탁해지지 않는다 */
export const SLIME_BASE_COLOR = 0xc8f0e1;
/** 흡수 총합이 이만큼이면 최대로 물든다 */
const FULL_TINT_AT = 1500;
const MAX_STRENGTH = 0.75;

/** 가장 많이 흡수한 계열 색 쪽으로 섞는다. 총량이 많고 그 계열 비중이 클수록 진하게 (GAME_DESIGN D11) */
export function slimeTint(absorption: Readonly<Record<string, number>>, families: readonly FamilyDef[]): number {
  const total = families.reduce((sum, f) => sum + (absorption[f.id] ?? 0), 0);
  if (total <= 0) return SLIME_BASE_COLOR;
  const dominant = families.reduce((best, f) => ((absorption[f.id] ?? 0) > (absorption[best.id] ?? 0) ? f : best));
  const share = (absorption[dominant.id] ?? 0) / total;
  const strength = MAX_STRENGTH * Math.min(1, total / FULL_TINT_AT) * share;
  const target = rgb(parseInt(dominant.color.slice(1), 16));
  const [r, g, b] = rgb(SLIME_BASE_COLOR).map((c, i) => Math.round(c + (target[i]! - c) * strength));
  return (r! << 16) | (g! << 8) | b!;
}

function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}
