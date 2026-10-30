import type { RuleError } from '../model/commands';
import type { GameConfig, ProductDef } from '../model/config';
import type { ProgressState } from '../model/progress';
import { err, ok, type Result } from '../result';

/** 지급한 주문을 이만큼만 기억한다 — 스토어가 같은 주문을 다시 주는 건 대개 직후다 */
const ORDER_MEMORY = 100;

export function findProduct(cfg: GameConfig, sku: string): ProductDef | undefined {
  return cfg.shop.find((p) => p.sku === sku);
}

export function hasAdPass(p: Pick<ProgressState, 'purchases'>, cfg: GameConfig): boolean {
  return cfg.shop.some((s) => s.adPass && p.purchases.owned.includes(s.sku));
}

/** 1회 한정 상품을 이미 샀는가 */
export function isSoldOut(p: Pick<ProgressState, 'purchases'>, product: ProductDef): boolean {
  return product.kind === 'once' && p.purchases.owned.includes(product.sku);
}

/**
 * 결제된 주문을 지급한다. 같은 orderId 는 두 번 지급하지 않고 성공으로 친다 —
 * 스토어가 「지급 완료」 응답을 못 받아 다시 보내 줄 때가 있다
 */
export function grantPurchase(p: ProgressState, sku: string, orderId: string, cfg: GameConfig): Result<ProgressState, RuleError> {
  const product = findProduct(cfg, sku);
  if (!product) return err({ code: 'UNKNOWN_PRODUCT' });
  if (p.purchases.orders.some((o) => o.id === orderId)) return ok(p);
  const orders = [...p.purchases.orders, { id: orderId, sku }].slice(-ORDER_MEMORY);
  // 1회 한정을 또 샀다면(다른 기기 등) 주문만 기록하고 다시 주지 않는다
  if (isSoldOut(p, product)) return ok({ ...p, purchases: { ...p.purchases, orders } });
  return ok({
    ...p,
    gems: p.gems + product.gems,
    prestige: { ...p.prestige, essence: p.prestige.essence + product.essence },
    purchases: { owned: product.kind === 'once' ? [...p.purchases.owned, sku] : p.purchases.owned, orders },
  });
}

/**
 * 다른 기기의 저장으로 바꿀 때, 이 기기에서만 지급한 주문을 그 저장에도 지급한다 —
 * 서버 저장은 더 많이 진행한 쪽을 남기므로 결제한 보석이 사라질 수 있다
 */
export function carryPurchases(adopted: ProgressState, local: Pick<ProgressState, 'purchases'>, cfg: GameConfig): ProgressState {
  let p = adopted;
  for (const order of local.purchases.orders) {
    const r = grantPurchase(p, order.sku, order.id, cfg);
    if (r.ok) p = r.value;
  }
  return p;
}
