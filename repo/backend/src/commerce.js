export const CART_QTY_CAP = 10;
export const DAILY_PURCHASE_LIMIT = 2;

export function customerWidePurchaseLimitStatus({ alreadyPurchasedToday, cartQuantity, maxPerDay = DAILY_PURCHASE_LIMIT }) {
  const already = Number(alreadyPurchasedToday || 0);
  const inCart = Number(cartQuantity || 0);
  return {
    already_purchased_today: already,
    in_cart_total_quantity: inCart,
    max_per_day: maxPerDay,
    would_exceed: already + inCart > maxPerDay,
  };
}

export function mergeCartItems(targetItems, sourceItems, cap = CART_QTY_CAP) {
  const idx = new Map();
  for (const item of targetItems) {
    idx.set(item.sku_id, { ...item });
  }
  for (const item of sourceItems) {
    const existing = idx.get(item.sku_id);
    if (!existing) {
      idx.set(item.sku_id, { ...item, quantity: Math.min(item.quantity, cap) });
      continue;
    }
    const latest = new Date(item.latest_edit_at) > new Date(existing.latest_edit_at) ? item : existing;
    idx.set(item.sku_id, {
      ...latest,
      sku_id: item.sku_id,
      quantity: Math.min(existing.quantity + item.quantity, cap),
    });
  }
  return Array.from(idx.values());
}

export function applyPromotions({ subtotalCents, couponPercent = 0, memberPricing = false, thresholdRule = null }) {
  if (couponPercent < 0) throw new Error('invalid couponPercent');
  let thresholdDiscount = 0;
  let couponDiscount = 0;
  let memberDiscount = 0;
  let message = null;

  if (thresholdRule && thresholdRule.threshold_cents != null) {
    if (subtotalCents >= thresholdRule.threshold_cents) {
      thresholdDiscount = Math.round(subtotalCents * (Number(thresholdRule.discount_percent || 0) / 100));
    } else {
      const addMore = (thresholdRule.threshold_cents - subtotalCents) / 100;
      message = `Add $${addMore.toFixed(2)} more for ${Number(thresholdRule.discount_percent || 0)}% off`;
    }
  }

  if (couponPercent > 0 && thresholdDiscount > 0) {
    throw new Error('threshold discounts must not combine with coupons');
  }

  if (memberPricing) {
    memberDiscount = Math.round(subtotalCents * 0.05);
  }

  if (couponPercent > 0) {
    couponDiscount = Math.round(subtotalCents * (couponPercent / 100));
  }

  const totalDiscount = thresholdDiscount + memberDiscount + couponDiscount;
  return {
    message,
    thresholdDiscount,
    memberDiscount,
    couponDiscount,
    totalDiscount,
  };
}

export function priceVarianceExceeded(snapshotUnitPrice, latestUnitPrice, thresholdPct = 2) {
  if (snapshotUnitPrice <= 0) return true;
  const pct = (Math.abs(latestUnitPrice - snapshotUnitPrice) / snapshotUnitPrice) * 100;
  return pct > thresholdPct;
}
