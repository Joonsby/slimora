import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../data';
import type { ProgressState } from '../model/progress';
import { applyCommand } from './applyCommand';
import { createInitialProgress } from './initial';
import { carryPurchases, hasAdPass } from './shop';

const cfg = gameConfig;

function grant(p: ProgressState, sku: string, orderId: string): ProgressState {
  const r = applyCommand(p, { type: 'grantPurchase', sku, orderId }, cfg);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe('결제 지급', () => {
  it('보석 상품은 살 때마다 지급하고, 같은 주문은 한 번만', () => {
    const start = { ...createInitialProgress(cfg), gems: 0 };
    const once = grant(start, 'gems_1100', 'order-1');
    expect(once.gems).toBe(1100);
    expect(grant(once, 'gems_1100', 'order-1').gems).toBe(1100);
    expect(grant(once, 'gems_1100', 'order-2').gems).toBe(2200);
  });

  it('스타터 팩은 보석 · 정수를 주고 한 번만 — 또 결제돼도 다시 주지 않는다', () => {
    const start = { ...createInitialProgress(cfg), gems: 0 };
    const bought = grant(start, 'starter_pack', 'a');
    expect(bought.gems).toBe(1000);
    expect(bought.prestige.essence).toBe(5);
    expect(bought.purchases.owned).toEqual(['starter_pack']);
    const again = grant(bought, 'starter_pack', 'b');
    expect(again.gems).toBe(1000);
    expect(again.purchases.orders.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('광고 패스를 사면 광고 없이 받을 수 있다', () => {
    const start = createInitialProgress(cfg);
    expect(hasAdPass(start, cfg)).toBe(false);
    expect(hasAdPass(grant(start, 'ad_pass', 'x'), cfg)).toBe(true);
  });

  it('모르는 상품은 지급하지 않는다', () => {
    expect(applyCommand(createInitialProgress(cfg), { type: 'grantPurchase', sku: 'ghost', orderId: 'z' }, cfg)).toEqual({ ok: false, error: { code: 'UNKNOWN_PRODUCT' } });
  });

  it('다른 기기 저장으로 바꿔도 이 기기에서 결제한 것은 남는다', () => {
    const start = { ...createInitialProgress(cfg), gems: 0 };
    const both = grant(start, 'gems_300', 'shared');
    const local = grant(grant(both, 'gems_1100', 'here'), 'ad_pass', 'pass');
    const remote = { ...grant(both, 'gems_3800', 'there'), gems: 50 };
    const merged = carryPurchases(remote, local, cfg);
    expect(merged.gems).toBe(50 + 1100);
    expect(hasAdPass(merged, cfg)).toBe(true);
    expect(merged.purchases.orders.map((o) => o.id)).toEqual(['shared', 'there', 'here', 'pass']);
  });

  it('결제 기록은 환생해도 남는다', () => {
    let p = grant(createInitialProgress(cfg), 'ad_pass', 'x');
    p = { ...p, stage: { ...p.stage, highestCleared: cfg.balance.prestige.unlockStage } };
    const r = applyCommand(p, { type: 'rebirth' }, cfg);
    expect(r.ok && hasAdPass(r.value, cfg)).toBe(true);
  });
});
