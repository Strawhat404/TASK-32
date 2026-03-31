export function parseExpiryDateToEndOfDay(dateText) {
  const [mm, dd, yyyy] = String(dateText || '').split('/').map((x) => Number(x));
  if (!mm || !dd || !yyyy) {
    throw new Error('expiry_date must be MM/DD/YYYY');
  }
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 23, 59, 0, 0));
  if (Number.isNaN(d.getTime())) {
    throw new Error('invalid expiry_date');
  }
  return d;
}
