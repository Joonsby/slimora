import type { PurchaseOutcome, ShopStore } from '../session/ports';

type Sdk = typeof import('@apps-in-toss/web-framework');

/** 앱인토스 인앱 결제. 콘솔에 같은 sku 로 상품을 등록해야 한다 */
export function createTossShop(): ShopStore {
  let sdk: Sdk | null = null;
  const getSdk = async () => (sdk ??= await import('@apps-in-toss/web-framework'));

  return {
    async prices(skus) {
      try {
        const { IAP } = await getSdk();
        if (!IAP.getProductItemList.isSupported()) return {};
        const { products } = await IAP.getProductItemList();
        return Object.fromEntries(products.filter((p) => skus.includes(p.sku)).map((p) => [p.sku, p.displayAmount]));
      } catch {
        return {};
      }
    },

    async purchase(sku, grant) {
      const { IAP } = await getSdk().catch(() => ({ IAP: null }));
      if (!IAP?.createOneTimePurchaseOrder.isSupported()) return 'failed';
      return new Promise<PurchaseOutcome>((resolve) => {
        let settled = false;
        let cleanup: (() => void) | null = null;
        // 결제 흐름이 끝나면 cleanup 을 반드시 불러야 한다 (SDK 안내)
        const finish = (outcome: PurchaseOutcome) => {
          if (settled) return;
          settled = true;
          cleanup?.();
          resolve(outcome);
        };
        cleanup = IAP.createOneTimePurchaseOrder({
          // 토스는 여기서 true 를 받아야 결제를 완료로 친다. false 면 미지급 주문으로 남아 restore 로 다시 온다
          options: { sku, processProductGrant: ({ orderId }) => grant(sku, orderId) },
          onEvent: () => finish('ok'),
          onError: (e) => finish(outcomeOf(e)),
        });
        if (settled) cleanup();
      });
    },

    async restore(grant) {
      try {
        const { IAP } = await getSdk();
        if (!IAP.getPendingOrders.isSupported()) return;
        const { orders } = await IAP.getPendingOrders();
        for (const order of orders) {
          if (await grant(order.sku, order.orderId)) await IAP.completeProductGrant({ params: { orderId: order.orderId } });
        }
      } catch (e) {
        console.warn('미지급 주문 확인 실패', e);
      }
    },
  };
}

function outcomeOf(e: unknown): PurchaseOutcome {
  const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined;
  if (code === 'USER_CANCELED') return 'cancelled';
  if (code === 'PAYMENT_PENDING') return 'pending';
  return 'failed';
}
