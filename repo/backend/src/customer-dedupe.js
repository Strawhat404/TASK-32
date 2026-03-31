import { normalizePhone } from './crypto-utils.js';

export function dedupeReason(a, b) {
  if (a.email && b.email && a.email === b.email) return 'email';
  const ap = normalizePhone(a.phone || a.normalized_phone || '');
  const bp = normalizePhone(b.phone || b.normalized_phone || '');
  if (ap && bp && ap === bp) return 'normalized_phone';
  return null;
}
