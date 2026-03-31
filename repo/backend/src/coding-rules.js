import { query } from './db.js';
import { parseExpiryDateToEndOfDay } from './coding-rule-utils.js';
export { parseExpiryDateToEndOfDay } from './coding-rule-utils.js';

function pad(n, size) {
  return String(n).padStart(size, '0');
}

export async function selectActiveCodingRule(entityType = 'sku', now = new Date()) {
  const res = await query(
    `SELECT *
     FROM sku_coding_rules
     WHERE entity_type = $1
       AND is_active = TRUE
       AND effective_start_at <= $2
       AND (effective_end_at IS NULL OR effective_end_at >= $2)
     ORDER BY priority DESC, effective_start_at DESC, created_at ASC
     LIMIT 1`,
    [entityType, now]
  );
  if (!res.rows.length) {
    throw new Error(`No active coding rule for ${entityType}`);
  }
  return res.rows[0];
}

export async function nextCodeForRule(rule, now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = pad(now.getUTCMonth() + 1, 2);
  const period = `${yyyy}${mm}`;
  const c = await query(
    `INSERT INTO sku_coding_rule_counters (rule_id, period_key, counter, updated_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (rule_id, period_key)
     DO UPDATE SET counter = sku_coding_rule_counters.counter + 1, updated_at = NOW()
     RETURNING counter`,
    [rule.id, period]
  );
  const n = c.rows[0].counter;
  return String(rule.template)
    .replace('YYYY', String(yyyy))
    .replace('MM', mm)
    .replace('####', pad(n, 4));
}
