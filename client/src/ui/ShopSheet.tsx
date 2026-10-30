import { useEffect, useState } from 'react';
import type { ProductDef } from '../core/model/config';
import { isSoldOut } from '../core/progression/shop';
import type { PurchaseOutcome } from '../session/ports';
import { openSheet } from '../store/gameStore';
import { formatNumber } from './format';
import { useGame, useGameContext } from './GameContext';
import { IconArrow, IconEssence, IconGem, IconPlay } from './icons';
import { Sheet } from './Sheet';

const OUTCOME_TEXT: Record<Exclude<PurchaseOutcome, 'ok'>, string | null> = {
  cancelled: null,
  pending: '결제 승인을 기다리고 있어요. 승인되면 다음에 앱을 열 때 지급돼요.',
  failed: '결제하지 못했어요. 결제가 끝났다면 다음에 앱을 열 때 자동으로 지급돼요.',
};

/** 보석 더미 — 비싼 상품일수록 많이 쌓인다 (x · y 는 % , s 는 크기) */
const PILES = [
  [{ x: 50, y: 54, s: 46 }],
  [
    { x: 30, y: 64, s: 32 },
    { x: 70, y: 64, s: 32 },
    { x: 50, y: 42, s: 40 },
  ],
  [
    { x: 20, y: 70, s: 28 },
    { x: 50, y: 72, s: 30 },
    { x: 80, y: 70, s: 28 },
    { x: 34, y: 46, s: 32 },
    { x: 66, y: 46, s: 32 },
    { x: 50, y: 22, s: 34 },
  ],
];

export function ShopSheet() {
  const { session, store, config, shop, sfx } = useGameContext();
  const open = useGame((s) => s.sheet === 'shop');
  const gems = useGame((s) => s.progress.gems);
  const purchases = useGame((s) => s.progress.purchases);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);

  // 가격은 스토어에 등록된 표시 가격을 쓴다 (못 받으면 정해 둔 원화 가격)
  useEffect(() => {
    if (!open || !shop) return;
    let alive = true;
    void shop.prices(config.shop.map((p) => p.sku)).then((p) => alive && setPrices(p));
    return () => {
      alive = false;
    };
  }, [open, shop, config]);

  if (!shop) return null;

  const buy = async (product: ProductDef) => {
    if (buying) return;
    setBuying(product.sku);
    setNotice(null);
    const outcome = await shop.purchase(product.sku, (sku, orderId) => session.grantOrder(sku, orderId));
    setBuying(null);
    if (outcome === 'ok') {
      sfx.play('buy');
      setNotice({ text: `${product.name} — 지급했어요!`, tone: 'good' });
      return;
    }
    const text = OUTCOME_TEXT[outcome];
    if (text) setNotice({ text, tone: 'bad' });
  };

  const price = (p: ProductDef) => (buying === p.sku ? '결제 중…' : (prices[p.sku] ?? `${p.priceKrw.toLocaleString('ko-KR')}원`));
  const gemProducts = config.shop.filter((p) => p.kind === 'consumable');
  const specials = config.shop.filter((p) => p.kind === 'once');

  return (
    <Sheet open={open} title="상점" icon={<IconGem size={26} />} onClose={() => openSheet(store, 'none')}>
      <div className="gem-bar">
        <span className="gem-balance">
          <IconGem size={22} />
          {formatNumber(gems)}
        </span>
        <button className="btn-link" onClick={() => openSheet(store, 'mercenary')}>
          용병 영입하러 가기 <IconArrow size={14} />
        </button>
      </div>
      {notice && <p className={`shop-notice ${notice.tone}`}>{notice.text}</p>}

      <h3 className="section-title">보석</h3>
      <ul className="shop-gems">
        {gemProducts.map((p, i) => (
          <li key={p.sku}>
            <button className="shop-card gem" disabled={buying !== null} onClick={() => void buy(p)}>
              {p.bonus > 0 && <span className="shop-ribbon">+{formatNumber(p.bonus)} 보너스</span>}
              <span className="gem-pile" aria-hidden="true">
                {(PILES[i] ?? PILES[0] ?? []).map((g, k) => (
                  <IconGem key={k} size={g.s} style={{ left: `${g.x}%`, top: `${g.y}%` }} />
                ))}
              </span>
              <strong className="shop-amount">{p.gems.toLocaleString('ko-KR')}</strong>
              <span className="shop-name">{p.name}</span>
              <span className="shop-price">{price(p)}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="section-title">
        특별 상품 <span className="muted small">— 한 번만 살 수 있어요</span>
      </h3>
      <ul className="shop-specials">
        {specials.map((p) => {
          const sold = isSoldOut({ purchases }, p);
          return (
            <li key={p.sku}>
              <button className={`shop-card special ${p.adPass ? 'pass' : 'starter'}`} disabled={sold || buying !== null} onClick={() => void buy(p)}>
                <span className="special-art" aria-hidden="true">
                  {p.adPass ? (
                    <IconPlay size={34} />
                  ) : (
                    <>
                      <IconGem size={32} />
                      <IconEssence size={24} />
                    </>
                  )}
                </span>
                <span className="special-text">
                  <strong>{p.name}</strong>
                  <span>{p.desc}</span>
                </span>
                <span className="shop-price">{sold ? '구매 완료' : price(p)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="shop-terms">
        <li>구매 후 7일 안에, 받은 보석 · 정수를 쓰지 않았다면 청약철회(환불)를 요청할 수 있어요. 일부라도 썼거나 광고 패스 혜택을 받은 뒤에는 철회가 제한돼요.</li>
        <li>미성년자가 법정대리인의 동의 없이 결제했다면 취소를 요청할 수 있어요.</li>
        <li>환불은 결제한 스토어의 고객센터에서 처리돼요. 용병 영입 확률은 용병 화면의 「확률 보기」에서 볼 수 있어요.</li>
      </ul>
    </Sheet>
  );
}
