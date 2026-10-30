import { registerPlugin } from '@capacitor/core';
import type { ShopStore } from '../session/ports';

interface OneStorePurchase {
  orderId: string;
  sku: string;
  purchaseToken: string;
  acknowledged: boolean;
}

/** android/.../OneStoreBillingPlugin.java */
interface OneStoreBilling {
  prices(o: { skus: string[] }): Promise<{ prices: Record<string, string> }>;
  /** code = 원스토어 ResponseCode (0 성공 · 1 취소) */
  purchase(o: { sku: string }): Promise<{ code: number; purchases: OneStorePurchase[] }>;
  finish(o: { purchaseToken: string; consume: boolean }): Promise<void>;
  pending(): Promise<{ purchases: OneStorePurchase[] }>;
}

const RESULT_OK = 0;
const RESULT_USER_CANCELED = 1;

/**
 * 원스토어 인앱결제 (안드로이드 앱). 지급한 뒤 소비해서 닫는다 — 3일 안에 닫지 않으면 원스토어가 자동 환불한다.
 * 영구 상품(광고 패스)만 확인으로 닫아 남겨 둔다: 재설치해도 restore 가 다시 지급한다.
 * 스타터 팩처럼 보석을 주는 1회 한정은 소비해야 재설치로 또 받는 일이 없다
 */
export function createOneStoreShop(isPermanent: (sku: string) => boolean): ShopStore {
  const billing = registerPlugin<OneStoreBilling>('OneStoreBilling');

  /** 지급하고 닫는다. 이미 확인한 영구 상품은 지급만 (재설치 뒤 복원) */
  const settle = async (p: OneStorePurchase, grant: (sku: string, orderId: string) => Promise<boolean>) => {
    if (!(await grant(p.sku, p.orderId))) return false;
    if (p.acknowledged) return true;
    await billing.finish({ purchaseToken: p.purchaseToken, consume: !isPermanent(p.sku) });
    return true;
  };

  return {
    async prices(skus) {
      try {
        return (await billing.prices({ skus: [...skus] })).prices;
      } catch {
        return {};
      }
    },

    async purchase(sku, grant) {
      try {
        const { code, purchases } = await billing.purchase({ sku });
        if (code === RESULT_USER_CANCELED) return 'cancelled';
        const bought = purchases.find((p) => p.sku === sku);
        if (code !== RESULT_OK || !bought) return 'failed';
        return (await settle(bought, grant)) ? 'ok' : 'failed';
      } catch (e) {
        console.warn('원스토어 결제 실패', e);
        return 'failed';
      }
    },

    async restore(grant) {
      try {
        const { purchases } = await billing.pending();
        for (const p of purchases) await settle(p, grant);
      } catch (e) {
        console.warn('원스토어 미지급 주문 확인 실패', e);
      }
    },
  };
}
