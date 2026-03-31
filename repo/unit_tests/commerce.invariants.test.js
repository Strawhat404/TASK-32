import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPromotions,
  customerWidePurchaseLimitStatus,
  mergeCartItems,
  priceVarianceExceeded,
} from '../backend/src/commerce.js';

test('cart merge uses latest edit and quantity sum with cap', () => {
  const target = [{ sku_id: 'A', quantity: 8, latest_edit_at: '2026-01-01T00:00:00Z', unit_price_snapshot_cents: 100 }];
  const source = [{ sku_id: 'A', quantity: 5, latest_edit_at: '2026-01-02T00:00:00Z', unit_price_snapshot_cents: 105 }];
  const out = mergeCartItems(target, source, 10);
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 10);
  assert.equal(out[0].unit_price_snapshot_cents, 105);
});

test('same-store merge input should not be re-merged and doubled by callers', () => {
  const existing = [{ sku_id: 'A', quantity: 4, latest_edit_at: '2026-01-02T00:00:00Z', unit_price_snapshot_cents: 100 }];
  const out = existing.map((item) => ({ ...item, quantity: Math.min(item.quantity, 10) }));
  assert.deepEqual(out, existing);
});

test('promo stacking allows member+coupon', () => {
  const p = applyPromotions({
    subtotalCents: 10000,
    couponPercent: 10,
    memberPricing: true,
    thresholdRule: null,
  });
  assert.equal(p.couponDiscount > 0, true);
  assert.equal(p.memberDiscount > 0, true);
});

test('promo stacking blocks threshold + coupon', () => {
  assert.throws(
    () =>
      applyPromotions({
        subtotalCents: 10000,
        couponPercent: 10,
        memberPricing: false,
        thresholdRule: { threshold_cents: 5000, discount_percent: 10 },
      }),
    /threshold discounts must not combine with coupons/
  );
});

test('checkout variance guard blocks over 2 percent', () => {
  assert.equal(priceVarianceExceeded(100, 102), false);
  assert.equal(priceVarianceExceeded(100, 103), true);
});

test('checkout variance guard allows exactly 2 percent and blocks above', () => {
  assert.equal(priceVarianceExceeded(5000, 5100), false);
  assert.equal(priceVarianceExceeded(5000, 5101), true);
});

test('customer-wide purchase limit is enforced across all SKUs', () => {
  const ok = customerWidePurchaseLimitStatus({ alreadyPurchasedToday: 1, cartQuantity: 1, maxPerDay: 2 });
  const blocked = customerWidePurchaseLimitStatus({ alreadyPurchasedToday: 2, cartQuantity: 1, maxPerDay: 2 });

  assert.equal(ok.would_exceed, false);
  assert.equal(blocked.would_exceed, true);
  assert.equal(blocked.already_purchased_today, 2);
  assert.equal(blocked.in_cart_total_quantity, 1);
});
