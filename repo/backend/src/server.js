import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import Fastify from 'fastify';
import { pool, query } from './db.js';
import { audit, authenticate, authorize, login, revokeSession } from './auth.js';
import { roleMatches } from './roles.js';
import {
  nextCodeForRule,
  parseExpiryDateToEndOfDay,
  selectActiveCodingRule,
} from './coding-rules.js';
import {
  applyPromotions,
  CART_QTY_CAP,
  customerWidePurchaseLimitStatus,
  DAILY_PURCHASE_LIMIT,
  mergeCartItems,
  priceVarianceExceeded,
} from './commerce.js';
import {
  decryptSensitive,
  encryptSensitive,
  maskPhone,
  normalizePhone,
} from './crypto-utils.js';
import { parseCsv, readCsvFile, toCsv } from './csv-utils.js';
import { scanContentForDlp } from './dlp.js';
import { dedupeReason } from './customer-dedupe.js';
import { GRADE_THRESHOLDS, gradeForScore, mergeRounds, weightedAggregation } from './scoring.js';

const app = Fastify({ logger: true });
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const ADMIN_ROLES = ['Administrator'];
const STAFF_ROLES = ['Administrator', 'Store Manager', 'Inventory Clerk'];
const FORUM_MODERATION_ROLES = ['Administrator', 'Moderator'];
const BOOKING_MANAGER_ROLES = ['Administrator', 'Store Manager'];
const DB_READY_MAX_ATTEMPTS = Number(process.env.DB_READY_MAX_ATTEMPTS || 10);
const DB_READY_DELAY_MS = Number(process.env.DB_READY_DELAY_MS || 2000);

app.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.header('Vary', 'Origin');
  if (request.method === 'OPTIONS') return reply.code(204).send();
});

function requireBodyFields(payload, fields) {
  for (const f of fields) {
    if (payload?.[f] === undefined || payload?.[f] === null || payload?.[f] === '') {
      throw new Error(`missing field: ${f}`);
    }
  }
}

function resolveTmpPath(filePath) {
  const tmpRoot = path.resolve('/tmp');
  const resolvedPath = path.resolve(path.join(tmpRoot, filePath));
  if (resolvedPath !== tmpRoot && !resolvedPath.startsWith(`${tmpRoot}${path.sep}`)) {
    throw new Error('Path must be under /tmp');
  }
  return resolvedPath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabaseReady() {
  for (let attempt = 1; attempt <= DB_READY_MAX_ATTEMPTS; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      app.log.info({ attempt }, 'database readiness check passed');
      return;
    } catch (error) {
      app.log.warn(
        {
          attempt,
          maxAttempts: DB_READY_MAX_ATTEMPTS,
          delayMs: DB_READY_DELAY_MS,
          error: error.message,
        },
        'database not ready, retrying'
      );
      if (attempt === DB_READY_MAX_ATTEMPTS) {
        throw new Error(
          `database readiness failed after ${DB_READY_MAX_ATTEMPTS} attempts: ${error.message}`
        );
      }
      await sleep(DB_READY_DELAY_MS);
    }
  }
}

async function immutableLog(eventType, actorUserId, entityType, entityId, payload = {}) {
  await query(
    `INSERT INTO immutable_logs (event_type, actor_user_id, entity_type, entity_id, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [eventType, actorUserId, entityType, String(entityId), payload]
  );
}

async function getOrCreateCart(userId, storeId) {
  const res = await query(
    `INSERT INTO carts (user_id, store_id, updated_at)
     VALUES ($1,$2,NOW())
     ON CONFLICT (user_id, store_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, storeId]
  );
  return res.rows[0];
}

async function resolveStoreByCode(storeCode) {
  const s = await query('SELECT * FROM stores WHERE code=$1', [storeCode]);
  if (!s.rows.length) throw new Error('store not found');
  return s.rows[0];
}

async function getPurchaseSummary(userId, storeId) {
  const lines = await query(
    `SELECT ci.sku_id, ci.quantity, ci.unit_price_snapshot_cents,
            ci.member_pricing_applied, ci.coupon_code,
            i.unit_price_cents AS latest_unit_price,
            i.stock_qty,
            s.name AS sku_name
     FROM carts c
     JOIN cart_items ci ON ci.cart_id = c.id
     JOIN sku_inventory i ON i.store_id = c.store_id AND i.sku_id = ci.sku_id
     JOIN skus s ON s.id = ci.sku_id
     WHERE c.user_id = $1 AND c.store_id = $2`,
    [userId, storeId]
  );
  return lines.rows;
}

async function getCustomerPurchasedToday(dbClient, userId) {
  const result = await dbClient.query(
    `SELECT COALESCE(SUM(oi.quantity),0) AS qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id=$1
       AND o.created_at::date = CURRENT_DATE`,
    [userId]
  );
  return Number(result.rows[0]?.qty || 0);
}

function sanitizeTopicTags(tags) {
  const rawTags = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return [...new Set(rawTags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
}

async function attachTagsToThread(threadId, tags) {
  const sanitizedTags = sanitizeTopicTags(tags);
  await query('DELETE FROM forum_thread_tags WHERE thread_id=$1', [threadId]);
  for (const tag of sanitizedTags) {
    const tagRes = await query(
      `INSERT INTO topic_tags (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [tag]
    );
    await query(
      `INSERT INTO forum_thread_tags (thread_id, tag_id)
       VALUES ($1,$2)
       ON CONFLICT (thread_id, tag_id) DO NOTHING`,
      [threadId, tagRes.rows[0].id]
    );
  }
}

function buildSectionHierarchy(items) {
  const byId = new Map(items.map((item) => [item.id, { ...item, children: [] }]));
  const roots = [];
  for (const item of byId.values()) {
    if (item.parent_section_id && byId.has(item.parent_section_id)) {
      byId.get(item.parent_section_id).children.push(item);
    } else {
      roots.push(item);
    }
  }
  return roots;
}

function toUtcTimeString(date) {
  return date.toISOString().slice(11, 16);
}

function isTimeWithinWindow(startTime, endTime, openTime, closeTime) {
  return startTime >= openTime && endTime <= closeTime && endTime > startTime;
}

async function validateBookingWindow({ roomId, partySize, startAt, endAt }) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('booking start_at and end_at must be valid datetimes');
  }
  if (end <= start) {
    throw new Error('booking end_at must be later than start_at');
  }

  const roomRes = await query('SELECT * FROM rooms WHERE id=$1 AND is_active=TRUE', [roomId]);
  if (!roomRes.rows.length) {
    throw new Error('room or table is not available');
  }
  const room = roomRes.rows[0];
  if (Number(partySize) > Number(room.capacity)) {
    throw new Error('party size exceeds room or table capacity');
  }

  const weekday = start.getUTCDay();
  const startTime = toUtcTimeString(start);
  const endTime = toUtcTimeString(end);

  const businessHours = await query('SELECT * FROM business_hours WHERE weekday=$1 LIMIT 1', [weekday]);
  if (!businessHours.rows.length || businessHours.rows[0].is_closed) {
    throw new Error('booking is outside business hours');
  }
  const hours = businessHours.rows[0];
  if (!isTimeWithinWindow(startTime, endTime, hours.open_time.slice(0, 5), hours.close_time.slice(0, 5))) {
    throw new Error('booking is outside business hours');
  }

  const schedules = await query(
    `SELECT * FROM host_schedules
     WHERE room_id=$1 AND weekday=$2 AND is_available=TRUE`,
    [roomId, weekday]
  );
  const hasSchedule = schedules.rows.some((schedule) =>
    isTimeWithinWindow(startTime, endTime, schedule.start_time.slice(0, 5), schedule.end_time.slice(0, 5))
  );
  if (!hasSchedule) {
    throw new Error('no host schedule or availability exists for the requested window');
  }

  const overlap = await query(
    `SELECT id FROM bookings
     WHERE room_id=$1
       AND status IN ('pending', 'confirmed')
       AND start_at < $3::timestamptz
       AND end_at > $2::timestamptz
     LIMIT 1`,
    [roomId, startAt, endAt]
  );
  if (overlap.rows.length) {
    throw new Error('booking overlaps an existing reservation');
  }
}

app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/auth/login', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) {
    return reply.code(400).send({ error: 'username and password are required' });
  }
  const result = await login(username, password);
  if (!result.ok) {
    return reply.code(result.statusCode).send({ error: result.message, lockedUntil: result.lockedUntil });
  }
  return { token: result.token, user: result.user };
});

app.get('/api/auth/me', { preHandler: authenticate }, async (request) => ({ user: request.user }));

app.post('/api/auth/logout', { preHandler: authenticate }, async (request) => {
  const token = request.headers.authorization.slice(7).trim();
  await revokeSession(token);
  await audit(request.user.id, 'logout', 'session', request.user.sessionId);
  return { success: true };
});

app.get('/api/master/sku-rules', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async () => {
  const res = await query(
    'SELECT * FROM sku_coding_rules ORDER BY priority DESC, effective_start_at DESC, created_at DESC'
  );
  return { items: res.rows };
});

app.post('/api/master/sku-rules', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['name', 'template', 'effective_start_at']);

    let startAt = p.effective_start_at;
    let endAt = p.effective_end_at || null;
    if (String(startAt).includes('/')) {
      const [mm, dd, yyyy] = String(startAt).split('/').map(Number);
      startAt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0)).toISOString();
    }
    if (endAt && String(endAt).includes('/')) {
      endAt = parseExpiryDateToEndOfDay(endAt).toISOString();
    }

    const res = await query(
      `INSERT INTO sku_coding_rules (name, entity_type, template, effective_start_at, effective_end_at, priority, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        p.name,
        p.entity_type || 'sku',
        p.template,
        startAt,
        endAt,
        Number(p.priority || 100),
        p.is_active !== false,
      ]
    );
    await audit(request.user.id, 'create', 'sku_rule', res.rows[0].id, { template: p.template });
    return reply.code(201).send(res.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/skus', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['name', 'expiry_date']);
    const expiryAt = parseExpiryDateToEndOfDay(p.expiry_date);
    const rule = await selectActiveCodingRule('sku');
    const code = await nextCodeForRule(rule);
    const res = await query(
      `INSERT INTO skus (code, name, description, code_expires_at, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       RETURNING *`,
      [code, p.name, p.description || '', expiryAt, p.is_active !== false]
    );
    await immutableLog('create', request.user.id, 'sku', res.rows[0].id, {
      code,
      rule_id: rule.id,
      expiry_at: expiryAt.toISOString(),
    });
    return reply.code(201).send(res.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/master/skus', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async () => {
  const res = await query('SELECT * FROM skus ORDER BY created_at DESC');
  return { items: res.rows };
});

app.patch('/api/master/skus/:id', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  const p = request.body || {};
  const res = await query(
    `UPDATE skus SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       is_active = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [request.params.id, p.name ?? null, p.description ?? null, p.is_active ?? null]
  );
  if (!res.rows.length) return reply.code(404).send({ error: 'SKU not found' });
  await immutableLog('update', request.user.id, 'sku', request.params.id, p);
  return res.rows[0];
});

app.delete('/api/master/skus/:id', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request) => {
  await query('DELETE FROM skus WHERE id=$1', [request.params.id]);
  await immutableLog('delete', request.user.id, 'sku', request.params.id, {});
  return { success: true };
});

app.post('/api/master/skus/:id/barcodes', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['barcode']);
    const r = await query(
      `INSERT INTO sku_barcodes (sku_id, barcode, symbology, is_primary)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [request.params.id, p.barcode, p.symbology || 'EAN-13', !!p.is_primary]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/master/skus/:id/barcodes', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request) => {
  const r = await query('SELECT * FROM sku_barcodes WHERE sku_id=$1 ORDER BY created_at DESC', [request.params.id]);
  return { items: r.rows };
});

app.post('/api/master/skus/:id/lots', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['lot_number']);
    const r = await query(
      `INSERT INTO sku_batch_lots (sku_id, lot_number, batch_attributes, manufactured_at, expires_at)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [request.params.id, p.lot_number, p.batch_attributes || {}, p.manufactured_at || null, p.expires_at || null]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/master/skus/:id/lots', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request) => {
  const r = await query('SELECT * FROM sku_batch_lots WHERE sku_id=$1 ORDER BY created_at DESC', [request.params.id]);
  return { items: r.rows };
});

app.post('/api/master/skus/:id/packaging', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['package_type', 'units_per_package']);
    const r = await query(
      `INSERT INTO packaging_specs (sku_id, package_type, units_per_package, weight_grams, dimensions_cm)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [request.params.id, p.package_type, Number(p.units_per_package), p.weight_grams || null, p.dimensions_cm || {}]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/master/skus/:id/packaging', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request) => {
  const r = await query('SELECT * FROM packaging_specs WHERE sku_id=$1 ORDER BY created_at DESC', [request.params.id]);
  return { items: r.rows };
});

app.get('/api/master/bins', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async () => {
  const r = await query('SELECT * FROM bin_locations ORDER BY created_at DESC');
  return { items: r.rows };
});

app.post('/api/master/bins', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['warehouse_code', 'aisle', 'shelf', 'bin_code']);
    const r = await query(
      `INSERT INTO bin_locations (warehouse_code, aisle, shelf, bin_code, is_active)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [p.warehouse_code, p.aisle, p.shelf, p.bin_code, p.is_active !== false]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/master/carriers', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async () => {
  const r = await query('SELECT * FROM carriers ORDER BY created_at DESC');
  return { items: r.rows };
});

app.get('/api/master/stores', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async () => {
  const r = await query('SELECT * FROM stores ORDER BY created_at ASC');
  return { items: r.rows };
});

app.post('/api/master/carriers', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['code', 'name']);
    const r = await query(
      `INSERT INTO carriers (code, name, service_levels, is_active)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [p.code, p.name, p.service_levels || [], p.is_active !== false]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/inventory', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['store_code', 'sku_id', 'stock_qty', 'unit_price_cents']);
    const store = await resolveStoreByCode(p.store_code);
    const r = await query(
      `INSERT INTO sku_inventory (store_id, sku_id, stock_qty, unit_price_cents, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (store_id, sku_id)
       DO UPDATE SET stock_qty = EXCLUDED.stock_qty, unit_price_cents = EXCLUDED.unit_price_cents, updated_at = NOW()
       RETURNING *`,
      [store.id, p.sku_id, Number(p.stock_qty), Number(p.unit_price_cents)]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/shipping-rates', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['store_code', 'method', 'min_subtotal_cents', 'rate_cents']);
    const store = await resolveStoreByCode(p.store_code);
    const r = await query(
      `INSERT INTO shipping_rate_tables (store_id, method, min_subtotal_cents, max_subtotal_cents, rate_cents)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [store.id, p.method, Number(p.min_subtotal_cents), p.max_subtotal_cents ?? null, Number(p.rate_cents)]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/promotions', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['promo_type', 'discount_percent']);
    const r = await query(
      `INSERT INTO promotions (promo_type, code, threshold_cents, discount_percent, is_active, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,NOW()),$7)
       RETURNING *`,
      [
        p.promo_type,
        p.code || null,
        p.threshold_cents ?? null,
        Number(p.discount_percent),
        p.is_active !== false,
        p.starts_at || null,
        p.ends_at || null,
      ]
    );
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/customers', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['full_name']);
    const normalized = normalizePhone(p.phone || '');
    const r = await query(
      `INSERT INTO customers
       (full_name, email, phone, normalized_phone, marketing_email_consent, marketing_sms_consent, address_encrypted, notes_encrypted, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       RETURNING *`,
      [
        p.full_name,
        p.email || null,
        p.phone || null,
        normalized || null,
        !!p.marketing_email_consent,
        !!p.marketing_sms_consent,
        encryptSensitive(p.address || ''),
        encryptSensitive(p.notes || ''),
      ]
    );
    await immutableLog('create', request.user.id, 'customer', r.rows[0].id, {
      dedupe_keys: {},
      consent: {
        marketing_email_consent: !!p.marketing_email_consent,
        marketing_sms_consent: !!p.marketing_sms_consent,
      },
    });
    return reply.code(201).send(r.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/master/customers', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request) => {
  const includeSensitive =
    request.query.include_sensitive === 'true' && roleMatches(request.user.role, ADMIN_ROLES);
  const r = await query('SELECT * FROM customers ORDER BY created_at DESC');
  const items = r.rows.map((row) => {
    const dto = {
      ...row,
      phone_masked: maskPhone(row.phone),
      address: includeSensitive ? decryptSensitive(row.address_encrypted) : '*** MASKED ***',
      notes: includeSensitive ? decryptSensitive(row.notes_encrypted) : '*** MASKED ***',
    };
    if (!includeSensitive) {
      delete dto.phone;
      delete dto.normalized_phone;
    }
    return dto;
  });
  return { items };
});

app.patch('/api/master/customers/:id', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  const p = request.body || {};
  const normalized = p.phone === undefined ? null : normalizePhone(p.phone || '');
  const r = await query(
    `UPDATE customers
     SET full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         normalized_phone = COALESCE($5, normalized_phone),
         marketing_email_consent = COALESCE($6, marketing_email_consent),
         marketing_sms_consent = COALESCE($7, marketing_sms_consent),
         address_encrypted = COALESCE($8, address_encrypted),
         notes_encrypted = COALESCE($9, notes_encrypted),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      request.params.id,
      p.full_name ?? null,
      p.email ?? null,
      p.phone ?? null,
      normalized,
      p.marketing_email_consent === undefined ? null : !!p.marketing_email_consent,
      p.marketing_sms_consent === undefined ? null : !!p.marketing_sms_consent,
      p.address !== undefined ? encryptSensitive(p.address) : null,
      p.notes !== undefined ? encryptSensitive(p.notes) : null,
    ]
  );
  if (!r.rows.length) return reply.code(404).send({ error: 'Customer not found' });
  const sanitizedPayload = {};
  if (p.full_name !== undefined) sanitizedPayload.full_name = p.full_name;
  if (p.marketing_email_consent !== undefined) {
    sanitizedPayload.marketing_email_consent = !!p.marketing_email_consent;
  }
  if (p.marketing_sms_consent !== undefined) {
    sanitizedPayload.marketing_sms_consent = !!p.marketing_sms_consent;
  }
  await immutableLog('update', request.user.id, 'customer', request.params.id, sanitizedPayload);
  return r.rows[0];
});

app.get('/api/master/customers/dedupe-scan', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async () => {
  const emailMatches = await query(
    `SELECT c1.id AS a, c2.id AS b, 'email' AS reason
     FROM customers c1
     JOIN customers c2 ON c1.id < c2.id AND c1.email IS NOT NULL AND c1.email = c2.email`
  );
  const phoneMatches = await query(
    `SELECT c1.id AS a, c2.id AS b, 'normalized_phone' AS reason
     FROM customers c1
     JOIN customers c2 ON c1.id < c2.id
      AND c1.normalized_phone IS NOT NULL
      AND c1.normalized_phone = c2.normalized_phone`
  );
  return { items: [...emailMatches.rows, ...phoneMatches.rows] };
});

app.post('/api/master/customers/dedupe-merge', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['source_customer_id', 'target_customer_id']);
    const source = await query('SELECT * FROM customers WHERE id=$1', [p.source_customer_id]);
    const target = await query('SELECT * FROM customers WHERE id=$1', [p.target_customer_id]);
    if (!source.rows.length || !target.rows.length) {
      return reply.code(404).send({ error: 'source or target customer missing' });
    }

    const s = source.rows[0];
    const t = target.rows[0];
    const reason = dedupeReason(s, t);
    if (!reason) {
      return reply.code(400).send({ error: 'customers do not match by email or normalized phone' });
    }

    await query('UPDATE orders SET customer_id=$2 WHERE customer_id=$1', [s.id, t.id]);
    await query(
      `INSERT INTO customer_merge_logs (source_customer_id, target_customer_id, reason, merged_by_user_id, payload)
       VALUES ($1,$2,$3,$4,$5)`,
      [s.id, t.id, reason, request.user.id, { source: s, target: t }]
    );
    await immutableLog('merge', request.user.id, 'customer', t.id, {
      source_customer_id: s.id,
      reason,
    });
    await query('DELETE FROM customers WHERE id=$1', [s.id]);
    return { success: true, reason };
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/customers/:id/delete-request', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async (request, reply) => {
  try {
    const updated = await query(
      `UPDATE customers SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [request.params.id]
    );
    if (!updated.rows.length) return reply.code(404).send({ error: 'Customer not found' });

    const restoreDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const reqIns = await query(
      `INSERT INTO customer_deletion_requests (customer_id, requested_by, restore_deadline)
       VALUES ($1,$2,$3) RETURNING *`,
      [request.params.id, request.user.id, restoreDeadline]
    );

    await immutableLog('delete_request', request.user.id, 'customer', request.params.id, {
      restore_deadline: restoreDeadline.toISOString(),
    });
    return reqIns.rows[0];
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/customers/deletion/:id/restore', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async (request, reply) => {
  const dr = await query('SELECT * FROM customer_deletion_requests WHERE id=$1', [request.params.id]);
  if (!dr.rows.length) return reply.code(404).send({ error: 'deletion request not found' });
  const reqRow = dr.rows[0];
  if (reqRow.is_purged) return reply.code(400).send({ error: 'already purged' });
  if (reqRow.restored_at) return reply.code(400).send({ error: 'already restored' });
  if (new Date(reqRow.restore_deadline) < new Date()) {
    return reply.code(400).send({ error: 'restore window expired' });
  }

  await query('UPDATE customers SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [reqRow.customer_id]);
  await query('UPDATE customer_deletion_requests SET restored_at = NOW() WHERE id = $1', [request.params.id]);
  await immutableLog('restore', request.user.id, 'customer', reqRow.customer_id, {
    request_id: request.params.id,
  });
  return { success: true };
});

app.post('/api/master/customers/retention/run', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async () => {
  const purgeCandidates = await query(
    `SELECT * FROM customer_deletion_requests
     WHERE is_purged = FALSE
       AND restored_at IS NULL
       AND restore_deadline < NOW()`
  );

  let purged = 0;
  for (const row of purgeCandidates.rows) {
    const payload = await query('SELECT * FROM customers WHERE id=$1', [row.customer_id]);
    await query(
      `INSERT INTO customer_tombstone_reports (customer_id, report_payload, retain_until)
       VALUES ($1,$2,NOW() + INTERVAL '7 years')`,
      [row.customer_id, payload.rows[0] || {}]
    );
    await query('DELETE FROM customers WHERE id = $1', [row.customer_id]);
    await query('UPDATE customer_deletion_requests SET is_purged = TRUE WHERE id = $1', [row.id]);
    purged += 1;
  }
  return { purged_deleted_content: purged };
});

app.post('/api/master/customers/import-csv', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async (request, reply) => {
  try {
    const { file_path } = request.body || {};
    requireBodyFields(request.body || {}, ['file_path']);
    const safePath = resolveTmpPath(file_path);
    const text = await readCsvFile(safePath);
    const scan = scanContentForDlp(text);
    await query(
      'INSERT INTO dlp_events (event_type, reason, source_path, details) VALUES ($1,$2,$3,$4)',
      [scan.status, scan.reason, safePath, { bytes: text.length }]
    );
    await immutableLog(scan.status, request.user.id, 'csv_import', safePath, { reason: scan.reason });
    if (scan.status !== 'accepted') {
      return reply.code(400).send({ error: `CSV ${scan.status}: ${scan.reason}` });
    }

    const rows = parseCsv(text);
    let created = 0;
    let merged = 0;
    for (const row of rows) {
      const email = row.email || null;
      const phone = row.phone || null;
      const norm = normalizePhone(phone || '');
      const existing = await query(
        `SELECT * FROM customers
         WHERE (email IS NOT NULL AND email = $1)
            OR (normalized_phone IS NOT NULL AND normalized_phone = $2)
         LIMIT 1`,
        [email, norm || null]
      );
      if (existing.rows.length) {
        merged += 1;
        const { address, notes, phone, ...safeRow } = row;
        await immutableLog('merge_hint', request.user.id, 'customer', existing.rows[0].id, {
          by: email ? 'email' : 'normalized_phone',
          row: safeRow,
        });
        continue;
      }
      await query(
        `INSERT INTO customers (full_name, email, phone, normalized_phone, address_encrypted, notes_encrypted)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          row.full_name || 'Unknown',
          email,
          phone,
          norm || null,
          encryptSensitive(row.address || ''),
          encryptSensitive(row.notes || ''),
        ]
      );
      created += 1;
    }

    return { success: true, created, merged };
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/master/customers/export-csv', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async (request, reply) => {
  try {
    const { file_path } = request.body || {};
    requireBodyFields(request.body || {}, ['file_path']);
    const safePath = resolveTmpPath(file_path);
    const r = await query(
      `SELECT id, full_name, email, phone, marketing_email_consent, marketing_sms_consent, created_at
       FROM customers ORDER BY created_at DESC`
    );
    const csv = toCsv(r.rows, ['id', 'full_name', 'email', 'phone', 'marketing_email_consent', 'marketing_sms_consent', 'created_at']);
    await fs.writeFile(safePath, csv, 'utf8');
    await immutableLog('export', request.user.id, 'customer_csv', safePath, { count: r.rows.length });
    return { success: true, count: r.rows.length, file_path: safePath };
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/commerce/carts/:storeCode', { preHandler: authenticate }, async (request, reply) => {
  try {
    const store = await resolveStoreByCode(request.params.storeCode);
    const cart = await getOrCreateCart(request.user.id, store.id);
    const items = await query('SELECT * FROM cart_items WHERE cart_id=$1 ORDER BY updated_at DESC', [cart.id]);
    return { cart, items: items.rows, quantity_cap: CART_QTY_CAP };
  } catch (e) {
    return reply.code(404).send({ error: e.message });
  }
});

app.post('/api/commerce/carts/:storeCode/items', { preHandler: authenticate }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['sku_id', 'quantity']);
    const quantity = Math.max(1, Math.min(Number(p.quantity), CART_QTY_CAP));
    const store = await resolveStoreByCode(request.params.storeCode);
    const inv = await query('SELECT * FROM sku_inventory WHERE store_id=$1 AND sku_id=$2', [store.id, p.sku_id]);
    if (!inv.rows.length) return reply.code(404).send({ error: 'inventory item not found for store' });

    const cart = await getOrCreateCart(request.user.id, store.id);
    const item = await query(
      `INSERT INTO cart_items (cart_id, sku_id, quantity, latest_edit_at, unit_price_snapshot_cents, member_pricing_applied, coupon_code, updated_at)
       VALUES ($1,$2,$3,NOW(),$4,$5,$6,NOW())
       ON CONFLICT (cart_id, sku_id)
       DO UPDATE SET quantity = EXCLUDED.quantity,
                     latest_edit_at = NOW(),
                     unit_price_snapshot_cents = EXCLUDED.unit_price_snapshot_cents,
                     member_pricing_applied = EXCLUDED.member_pricing_applied,
                     coupon_code = EXCLUDED.coupon_code,
                     updated_at = NOW()
       RETURNING *`,
      [
        cart.id,
        p.sku_id,
        quantity,
        inv.rows[0].unit_price_cents,
        !!p.member_pricing_applied,
        p.coupon_code || null,
      ]
    );
    return reply.code(201).send(item.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/commerce/carts/merge', { preHandler: authenticate }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['from_store_code', 'to_store_code']);
    const fromStore = await resolveStoreByCode(p.from_store_code);
    const toStore = await resolveStoreByCode(p.to_store_code);
    const fromCart = await getOrCreateCart(request.user.id, fromStore.id);
    const toCart = await getOrCreateCart(request.user.id, toStore.id);

    const [src, dst] = await Promise.all([
      query('SELECT * FROM cart_items WHERE cart_id=$1', [fromCart.id]),
      query('SELECT * FROM cart_items WHERE cart_id=$1', [toCart.id]),
    ]);

    const merged =
      fromCart.id === toCart.id
        ? dst.rows.map((item) => ({
            ...item,
            quantity: Math.min(Number(item.quantity), CART_QTY_CAP),
          }))
        : mergeCartItems(dst.rows, src.rows, CART_QTY_CAP);

    for (const line of merged) {
      await query(
        `INSERT INTO cart_items (cart_id, sku_id, quantity, latest_edit_at, unit_price_snapshot_cents, member_pricing_applied, coupon_code, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (cart_id, sku_id)
         DO UPDATE SET quantity = EXCLUDED.quantity,
                       latest_edit_at = EXCLUDED.latest_edit_at,
                       unit_price_snapshot_cents = EXCLUDED.unit_price_snapshot_cents,
                       member_pricing_applied = EXCLUDED.member_pricing_applied,
                       coupon_code = EXCLUDED.coupon_code,
                       updated_at = NOW()`,
        [
          toCart.id,
          line.sku_id,
          line.quantity,
          line.latest_edit_at || new Date(),
          line.unit_price_snapshot_cents,
          !!line.member_pricing_applied,
          line.coupon_code || null,
        ]
      );
    }

    if (fromCart.id !== toCart.id) {
      await query('DELETE FROM cart_items WHERE cart_id=$1', [fromCart.id]);
    }

    await immutableLog('merge', request.user.id, 'cart', toCart.id, {
      from_store: p.from_store_code,
      to_store: p.to_store_code,
      merged_count: merged.length,
    });

    return { success: true, items: merged, quantity_cap: CART_QTY_CAP };
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/commerce/checkout/preview', { preHandler: authenticate }, async (request, reply) => {
  try {
    const store = await resolveStoreByCode(request.query.store_code);
    const lines = await getPurchaseSummary(request.user.id, store.id);
    const subtotal = lines.reduce((acc, x) => acc + x.latest_unit_price * x.quantity, 0);
    const cartTotalQuantity = lines.reduce((acc, line) => acc + Number(line.quantity || 0), 0);

    const couponCode = request.query.coupon_code || null;
    const memberPricing = request.query.member_pricing === 'true';

    const thresholdPromo = await query(
      `SELECT * FROM promotions
       WHERE promo_type='threshold' AND is_active=TRUE
       AND starts_at <= NOW()
       AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY created_at DESC LIMIT 1`
    );
    const coupon = couponCode
      ? await query(
          `SELECT * FROM promotions WHERE promo_type='coupon' AND code=$1
            AND is_active=TRUE AND starts_at <= NOW() AND (ends_at IS NULL OR ends_at >= NOW())
           LIMIT 1`,
          [couponCode]
        )
      : { rows: [] };

    const promo = applyPromotions({
      subtotalCents: subtotal,
      couponPercent: Number(coupon.rows[0]?.discount_percent || 0),
      memberPricing,
      thresholdRule: thresholdPromo.rows[0] || null,
    });

    const alreadyPurchasedToday = await getCustomerPurchasedToday({ query }, request.user.id);
    const purchaseLimitStatus = customerWidePurchaseLimitStatus({
      alreadyPurchasedToday,
      cartQuantity: cartTotalQuantity,
      maxPerDay: DAILY_PURCHASE_LIMIT,
    });

    return {
      subtotal_cents: subtotal,
      promo,
      quantity_cap: CART_QTY_CAP,
      purchase_limit: `max ${DAILY_PURCHASE_LIMIT} per customer per day`,
      purchase_limit_status: purchaseLimitStatus,
      lines,
    };
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.post('/api/commerce/checkout/place', { preHandler: authenticate }, async (request, reply) => {
  const client = await pool.connect();
  try {
    const p = request.body || {};
    requireBodyFields(p, ['store_code', 'delivery_method']);
    const store = await resolveStoreByCode(p.store_code);

    await client.query('BEGIN');
    const cartRes = await client.query('SELECT * FROM carts WHERE user_id=$1 AND store_id=$2 FOR UPDATE', [
      request.user.id,
      store.id,
    ]);
    if (!cartRes.rows.length) {
      throw new Error('cart not found');
    }
    const cart = cartRes.rows[0];

    const lines = await client.query('SELECT * FROM cart_items WHERE cart_id=$1 FOR UPDATE', [cart.id]);
    if (!lines.rows.length) {
      throw new Error('cart is empty');
    }
    const cartTotalQuantity = lines.rows.reduce((acc, line) => acc + Number(line.quantity || 0), 0);
    const alreadyPurchasedToday = await getCustomerPurchasedToday(client, request.user.id);
    if (alreadyPurchasedToday + cartTotalQuantity > DAILY_PURCHASE_LIMIT) {
      throw new Error('purchase limit exceeded for customer per day');
    }

    let subtotal = 0;
    const finalized = [];

    for (const line of lines.rows) {
      const inv = await client.query(
        'SELECT * FROM sku_inventory WHERE store_id=$1 AND sku_id=$2 FOR UPDATE',
        [store.id, line.sku_id]
      );
      if (!inv.rows.length) throw new Error(`inventory missing for sku ${line.sku_id}`);
      const item = inv.rows[0];
      if (item.stock_qty < line.quantity) {
        throw new Error(`stock insufficient for sku ${line.sku_id}`);
      }

      if (priceVarianceExceeded(line.unit_price_snapshot_cents, item.unit_price_cents, 2)) {
        throw new Error(`price changed by more than 2% for sku ${line.sku_id}`);
      }

      subtotal += item.unit_price_cents * line.quantity;
      finalized.push({ sku_id: line.sku_id, quantity: line.quantity, unit_price_cents: item.unit_price_cents });
    }

    const thresholdPromo = await client.query(
      `SELECT * FROM promotions
       WHERE promo_type='threshold' AND is_active=TRUE AND starts_at <= NOW()
         AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY created_at DESC LIMIT 1`
    );
    const coupon = p.coupon_code
      ? await client.query(
          `SELECT * FROM promotions WHERE promo_type='coupon' AND code=$1
            AND is_active=TRUE AND starts_at <= NOW() AND (ends_at IS NULL OR ends_at >= NOW())
           LIMIT 1`,
          [p.coupon_code]
        )
      : { rows: [] };

    const promo = applyPromotions({
      subtotalCents: subtotal,
      couponPercent: Number(coupon.rows[0]?.discount_percent || 0),
      memberPricing: !!p.member_pricing,
      thresholdRule: thresholdPromo.rows[0] || null,
    });

    const ship = await client.query(
      `SELECT * FROM shipping_rate_tables
       WHERE store_id=$1 AND method=$2
         AND min_subtotal_cents <= $3
         AND (max_subtotal_cents IS NULL OR max_subtotal_cents >= $3)
       ORDER BY min_subtotal_cents DESC
       LIMIT 1`,
      [store.id, p.delivery_method, subtotal]
    );
    const shippingCents = Number(ship.rows[0]?.rate_cents || 0);

    const tax = await client.query('SELECT * FROM tax_jurisdictions WHERE code=$1 AND is_active=TRUE LIMIT 1', [
      store.jurisdiction_code,
    ]);
    const taxPct = Number(tax.rows[0]?.tax_rate_percent || 0);
    const taxable = subtotal - promo.totalDiscount + shippingCents;
    const taxCents = Math.round(taxable * (taxPct / 100));
    const total = taxable + taxCents;

    const order = await client.query(
      `INSERT INTO orders
       (user_id, store_id, customer_id, delivery_method, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, shipping_address_encrypted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        request.user.id,
        store.id,
        p.customer_id || null,
        p.delivery_method,
        subtotal,
        promo.totalDiscount,
        shippingCents,
        taxCents,
        total,
        encryptSensitive(p.shipping_address || ''),
      ]
    );

    for (const item of finalized) {
      await client.query(
        `INSERT INTO order_items (order_id, sku_id, quantity, unit_price_cents)
         VALUES ($1,$2,$3,$4)`,
        [order.rows[0].id, item.sku_id, item.quantity, item.unit_price_cents]
      );
      await client.query(
        'UPDATE sku_inventory SET stock_qty = stock_qty - $3, updated_at = NOW() WHERE store_id=$1 AND sku_id=$2',
        [store.id, item.sku_id, item.quantity]
      );
    }

    await client.query('DELETE FROM cart_items WHERE cart_id=$1', [cart.id]);
    await client.query('COMMIT');

    await immutableLog('checkout', request.user.id, 'order', order.rows[0].id, {
      delivery_method: p.delivery_method,
      subtotal,
      discount: promo.totalDiscount,
      shipping: shippingCents,
      tax: taxCents,
      total,
    });

    return {
      order: order.rows[0],
      totals: {
        subtotal_cents: subtotal,
        discount_cents: promo.totalDiscount,
        shipping_cents: shippingCents,
        tax_cents: taxCents,
        total_cents: total,
      },
    };
  } catch (e) {
    await client.query('ROLLBACK');
    return reply.code(400).send({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/api/scoring/calculate', { preHandler: [authenticate, authorize(STAFF_ROLES)] }, async (request, reply) => {
  try {
    const p = request.body || {};
    requireBodyFields(p, ['subject_id', 'round_key', 'metrics', 'weights', 'store_code']);
    const store = await resolveStoreByCode(p.store_code);
    const score = weightedAggregation({
      metrics: p.metrics,
      weights: p.weights,
      strategy: p.strategy || 'drop',
      mappingRules: p.mapping_rules || {},
    });
    const merged = mergeRounds([...(p.previous_round_scores || []), score]);
    const ledger = await query(
      `INSERT INTO scoring_adjustment_ledger
       (subject_id, round_key, store_id, score_before, score_after, strategy, mapping_rule, weights, details, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        p.subject_id,
        p.round_key,
        store.id,
        p.previous_score ?? null,
        merged,
        p.strategy || 'drop',
        p.mapping_rules || {},
        p.weights,
        { current_score: score, previous_round_scores: p.previous_round_scores || [], store_code: p.store_code },
        request.user.id,
      ]
    );
    return reply.code(201).send({
      current_score: score,
      merged_score: merged,
      grade: gradeForScore(merged),
      ledger: ledger.rows[0],
    });
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/scoring/ledger/:subjectId', { preHandler: authenticate }, async (request, reply) => {
  if (!roleMatches(request.user.role, ADMIN_ROLES) && request.user.id !== request.params.subjectId && request.user.username !== request.params.subjectId) {
    return reply.code(403).send({ error: 'Access denied to this ledger' });
  }
  const r = await query(
    `SELECT sal.*, s.code AS store_code
     FROM scoring_adjustment_ledger sal
     LEFT JOIN stores s ON s.id = sal.store_id
     WHERE sal.subject_id=$1
     ORDER BY sal.created_at DESC`,
    [request.params.subjectId]
  );
  return { items: r.rows };
});

app.get('/api/scoring/grades-rankings', { preHandler: authenticate }, async (request, reply) => {
  const { store_code, from, to } = request.query || {};
  if (!store_code || !from || !to) {
    return reply.code(400).send({ error: 'store_code, from, and to are required' });
  }
  const store = await resolveStoreByCode(store_code);
  const r = await query(
    `SELECT sal.subject_id,
            AVG(sal.score_after)::numeric(12,4) AS aggregated_score,
            MIN(s.code) AS store_code
     FROM scoring_adjustment_ledger sal
     JOIN stores s ON s.id = sal.store_id
     WHERE sal.store_id = $1
       AND sal.created_at >= $2::timestamptz
       AND sal.created_at <= $3::timestamptz
     GROUP BY sal.subject_id
     ORDER BY aggregated_score DESC, sal.subject_id ASC`,
    [store.id, from, to]
  );
  const rankings = r.rows.map((row, index) => ({
    rank: index + 1,
    subject_id_hash: crypto.createHash('sha256').update(String(row.subject_id)).digest('hex').slice(0, 12),
    aggregated_score: Number(row.aggregated_score),
    grade: gradeForScore(row.aggregated_score),
    store_code: row.store_code,
  }));
  return {
    thresholds: GRADE_THRESHOLDS,
    rankings,
  };
});

app.post('/api/forum/:entity/:id/delete-request', { preHandler: [authenticate, authorize(FORUM_MODERATION_ROLES)] }, async (request, reply) => {
  try {
    const map = { thread: 'forum_threads', post: 'forum_posts' };
    const table = map[request.params.entity];
    if (!table) return reply.code(400).send({ error: 'entity must be thread|post' });

    const updated = await query(
      `UPDATE ${table}
       SET archived = TRUE,
           locked = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [request.params.id]
    );
    if (!updated.rows.length) return reply.code(404).send({ error: 'Entity not found' });

    const restoreDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const reqIns = await query(
      `INSERT INTO forum_deletion_requests (entity_type, entity_id, requested_by, restore_deadline)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [request.params.entity, request.params.id, request.user.id, restoreDeadline]
    );

    await immutableLog('delete_request', request.user.id, request.params.entity, request.params.id, {
      restore_deadline: restoreDeadline.toISOString(),
    });
    return reqIns.rows[0];
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.get('/api/forum/deletion-requests', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async () => {
  const r = await query(
    `SELECT * FROM forum_deletion_requests
     WHERE is_purged = FALSE AND restored_at IS NULL
     ORDER BY restore_deadline ASC`
  );
  return { items: r.rows };
});

app.post('/api/forum/deletion/:id/restore', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async (request, reply) => {
  const dr = await query('SELECT * FROM forum_deletion_requests WHERE id=$1', [request.params.id]);
  if (!dr.rows.length) return reply.code(404).send({ error: 'deletion request not found' });
  const reqRow = dr.rows[0];
  if (reqRow.is_purged) return reply.code(400).send({ error: 'already purged' });
  if (reqRow.restored_at) return reply.code(400).send({ error: 'already restored' });
  if (new Date(reqRow.restore_deadline) < new Date()) {
    return reply.code(400).send({ error: 'restore window expired' });
  }

  const table = reqRow.entity_type === 'thread' ? 'forum_threads' : 'forum_posts';
  await query(`UPDATE ${table} SET archived = FALSE, locked = FALSE, updated_at = NOW() WHERE id = $1`, [
    reqRow.entity_id,
  ]);
  await query('UPDATE forum_deletion_requests SET restored_at = NOW() WHERE id = $1', [request.params.id]);
  await immutableLog('restore', request.user.id, reqRow.entity_type, reqRow.entity_id, {
    request_id: request.params.id,
  });
  return { success: true };
});

app.post('/api/forum/retention/run', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async () => {
  const purgeCandidates = await query(
    `SELECT * FROM forum_deletion_requests
     WHERE is_purged = FALSE
       AND restored_at IS NULL
       AND restore_deadline < NOW()`
  );

  let purged = 0;
  for (const row of purgeCandidates.rows) {
    const table = row.entity_type === 'thread' ? 'forum_threads' : 'forum_posts';
    const payload = await query(`SELECT * FROM ${table} WHERE id=$1`, [row.entity_id]);
    await query(
      `INSERT INTO forum_tombstone_reports (entity_type, entity_id, report_payload, retain_until)
       VALUES ($1,$2,$3,NOW() + INTERVAL '7 years')`,
      [row.entity_type, row.entity_id, payload.rows[0] || {}]
    );
    await query(`DELETE FROM ${table} WHERE id = $1`, [row.entity_id]);
    await query('UPDATE forum_deletion_requests SET is_purged = TRUE WHERE id = $1', [row.id]);
    purged += 1;
  }

  const archivedForumLogs = await query(
    `DELETE FROM immutable_logs
     WHERE entity_type IN ('thread', 'post')
       AND created_at < NOW() - INTERVAL '365 days'
     RETURNING id`
  );
  const tombstonePurge = await query(
    `DELETE FROM forum_tombstone_reports
     WHERE created_at < NOW() - INTERVAL '365 days'
     RETURNING id`
  );

  return {
    purged_deleted_content: purged,
    purged_archived_forum_logs: archivedForumLogs.rows.length,
    purged_expired_tombstones: tombstonePurge.rows.length,
  };
});

app.get('/api/admin/immutable-logs', { preHandler: [authenticate, authorize(ADMIN_ROLES)] }, async (request) => {
  const limit = Math.min(Number(request.query.limit || 100), 500);
  const r = await query('SELECT * FROM immutable_logs ORDER BY created_at DESC LIMIT $1', [limit]);
  return { items: r.rows };
});

app.get('/api/scripts', { preHandler: authenticate }, async () => {
  const res = await query('SELECT * FROM scripts ORDER BY created_at DESC');
  return { items: res.rows };
});

app.post('/api/scripts', { preHandler: [authenticate, authorize(['Administrator', 'Store Manager'])] }, async (request, reply) => {
  try {
    const p = request.body || {};
    if (
      !p.title ||
      !Number.isInteger(p.difficulty) ||
      p.difficulty < 1 ||
      p.difficulty > 5 ||
      !Number.isInteger(p.duration_minutes) ||
      p.duration_minutes <= 0 ||
      !Number.isInteger(p.min_party_size) ||
      !Number.isInteger(p.max_party_size) ||
      p.min_party_size <= 0 ||
      p.max_party_size < p.min_party_size ||
      !['active', 'paused'].includes(p.status)
    ) {
      return reply.code(400).send({ error: 'Invalid script payload' });
    }

    const res = await query(
      `INSERT INTO scripts
       (title, description, difficulty, duration_minutes, min_party_size, max_party_size, required_props, status, tags, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        p.title,
        p.description || '',
        p.difficulty,
        p.duration_minutes,
        p.min_party_size,
        p.max_party_size,
        p.required_props || [],
        p.status,
        p.tags || [],
        request.user.id,
      ]
    );
    return reply.code(201).send(res.rows[0]);
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

app.patch('/api/scripts/:id', { preHandler: [authenticate, authorize(['Administrator', 'Store Manager'])] }, async (request, reply) => {
  const { status } = request.body || {};
  if (!['active', 'paused'].includes(status)) return reply.code(400).send({ error: 'invalid status' });
  const res = await query('UPDATE scripts SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *', [
    request.params.id,
    status,
  ]);
  if (!res.rows.length) return reply.code(404).send({ error: 'script not found' });
  return res.rows[0];
});

app.get('/api/resources/rooms', { preHandler: authenticate }, async () => {
  const res = await query('SELECT * FROM rooms ORDER BY created_at DESC');
  return { items: res.rows };
});

app.post('/api/resources/rooms', { preHandler: [authenticate, authorize(['Administrator', 'Store Manager'])] }, async (request, reply) => {
  const { name, room_type, capacity } = request.body || {};
  if (!name || !['room', 'table'].includes(room_type) || !Number.isInteger(capacity) || capacity <= 0) {
    return reply.code(400).send({ error: 'Invalid room payload' });
  }
  const res = await query('INSERT INTO rooms (name, room_type, capacity) VALUES ($1,$2,$3) RETURNING *', [
    name,
    room_type,
    capacity,
  ]);
  return reply.code(201).send(res.rows[0]);
});

app.get('/api/resources/business-hours', { preHandler: authenticate }, async () => {
  const res = await query('SELECT * FROM business_hours ORDER BY weekday ASC');
  return { items: res.rows };
});

app.put('/api/resources/business-hours', { preHandler: [authenticate, authorize(['Administrator', 'Store Manager'])] }, async (request, reply) => {
  const { items } = request.body || {};
  if (!Array.isArray(items)) return reply.code(400).send({ error: 'items array required' });
  for (const it of items) {
    await query(
      `INSERT INTO business_hours (weekday, open_time, close_time, is_closed)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (weekday)
       DO UPDATE SET open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time, is_closed = EXCLUDED.is_closed`,
      [it.weekday, it.open_time, it.close_time, !!it.is_closed]
    );
  }
  return { success: true };
});

app.get('/api/resources/host-schedules', { preHandler: authenticate }, async () => {
  const res = await query(
    `SELECT hs.*, u.username AS host_username, r.name AS room_name
     FROM host_schedules hs
     JOIN users u ON u.id = hs.host_user_id
     JOIN rooms r ON r.id = hs.room_id
     ORDER BY hs.created_at DESC`
  );
  return { items: res.rows };
});

app.post('/api/resources/host-schedules', { preHandler: [authenticate, authorize(['Administrator', 'Store Manager'])] }, async (request, reply) => {
  const { host_user_id, room_id, weekday, start_time, end_time, is_available = true } = request.body || {};
  if (!host_user_id || !room_id || !Number.isInteger(weekday) || !start_time || !end_time) {
    return reply.code(400).send({ error: 'Invalid host schedule payload' });
  }
  const res = await query(
    `INSERT INTO host_schedules (host_user_id, room_id, weekday, start_time, end_time, is_available)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [host_user_id, room_id, weekday, start_time, end_time, is_available]
  );
  return reply.code(201).send(res.rows[0]);
});

app.get('/api/resources/availability', { preHandler: authenticate }, async () => {
  const [rooms, hours, schedules] = await Promise.all([
    query('SELECT * FROM rooms WHERE is_active = TRUE ORDER BY name'),
    query('SELECT * FROM business_hours ORDER BY weekday'),
    query('SELECT * FROM host_schedules WHERE is_available = TRUE ORDER BY weekday'),
  ]);
  return { rooms: rooms.rows, business_hours: hours.rows, host_schedules: schedules.rows };
});

app.get('/api/bookings', { preHandler: authenticate }, async (request) => {
  let querySql = `SELECT b.*, s.title AS script_title, r.name AS room_name
     FROM bookings b
     JOIN scripts s ON s.id = b.script_id
     JOIN rooms r ON r.id = b.room_id`;
  let queryParams = [];

  if (!roleMatches(request.user.role, ADMIN_ROLES) && !roleMatches(request.user.role, BOOKING_MANAGER_ROLES)) {
    querySql += ` WHERE b.booked_by_user_id = $1`;
    queryParams.push(request.user.id);
  }

  querySql += ` ORDER BY b.start_at DESC`;

  const res = await query(querySql, queryParams);
  return { items: res.rows };
});

app.post('/api/bookings', { preHandler: authenticate }, async (request, reply) => {
  const p = request.body || {};
  if (!p.script_id || !p.room_id || !p.customer_name || !Number.isInteger(p.party_size) || !p.start_at || !p.end_at) {
    return reply.code(400).send({ error: 'Invalid booking payload' });
  }
  try {
    await validateBookingWindow({
      roomId: p.room_id,
      partySize: p.party_size,
      startAt: p.start_at,
      endAt: p.end_at,
    });

    const scriptRes = await query('SELECT required_props FROM scripts WHERE id=$1', [p.script_id]);
    if (!scriptRes.rows.length) return reply.code(404).send({ error: 'script not found' });
    const props = scriptRes.rows[0].required_props || [];

    if (props.length > 0) {
      const propConflict = await query(
        `SELECT b.id FROM bookings b
         JOIN scripts s ON s.id = b.script_id
         WHERE b.status IN ('pending', 'confirmed')
           AND b.start_at < $2 AND b.end_at > $1
           AND s.required_props && $3::text[]`,
        [p.start_at, p.end_at, props]
      );
      if (propConflict.rows.length > 0) {
        return reply.code(400).send({ error: 'Required props are currently in use by another booking' });
      }
    }
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
  const status = roleMatches(request.user.role, ADMIN_ROLES) ? 'confirmed' : 'pending';
  const res = await query(
    `INSERT INTO bookings
     (script_id, room_id, booked_by_user_id, customer_name, customer_email, party_size, start_at, end_at, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      p.script_id,
      p.room_id,
      request.user.id,
      p.customer_name,
      p.customer_email || null,
      p.party_size,
      p.start_at,
      p.end_at,
      status,
      p.notes || '',
    ]
  );
  return reply.code(201).send(res.rows[0]);
});

app.patch('/api/bookings/:id/status', { preHandler: [authenticate, authorize(BOOKING_MANAGER_ROLES)] }, async (request, reply) => {
  const { status } = request.body || {};
  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return reply.code(400).send({ error: 'Invalid status' });
  }
  const res = await query('UPDATE bookings SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *', [
    request.params.id,
    status,
  ]);
  if (!res.rows.length) return reply.code(404).send({ error: 'Booking not found' });
  return res.rows[0];
});

app.get('/api/forum/sections', { preHandler: authenticate }, async () => {
  const res = await query('SELECT * FROM forum_sections ORDER BY created_at ASC');
  return { items: res.rows, hierarchy: buildSectionHierarchy(res.rows) };
});

app.post('/api/forum/sections', { preHandler: [authenticate, authorize(FORUM_MODERATION_ROLES)] }, async (request, reply) => {
  const { name, description = '', parent_section_id = null } = request.body || {};
  if (!name) return reply.code(400).send({ error: 'name required' });
  const res = await query('INSERT INTO forum_sections (name, description, parent_section_id) VALUES ($1,$2,$3) RETURNING *', [
    name,
    description,
    parent_section_id,
  ]);
  return reply.code(201).send(res.rows[0]);
});

app.get('/api/forum/threads', { preHandler: authenticate }, async (request, reply) => {
  const sectionId = request.query.section_id;
  if (!sectionId) return reply.code(400).send({ error: 'section_id is required' });
  const isAdmin = roleMatches(request.user.role, FORUM_MODERATION_ROLES);
  const filter = isAdmin ? '' : 'AND ft.archived = FALSE';
  const res = await query(
    `SELECT ft.*,
            COALESCE(array_remove(array_agg(tt.name ORDER BY tt.name), NULL), '{}') AS topic_tags
     FROM forum_threads ft
     LEFT JOIN forum_thread_tags ftt ON ftt.thread_id = ft.id
     LEFT JOIN topic_tags tt ON tt.id = ftt.tag_id
     WHERE ft.section_id=$1 ${filter}
     GROUP BY ft.id
     ORDER BY ft.created_at DESC`,
    [sectionId]
  );
  return { items: res.rows };
});

app.post('/api/forum/threads', { preHandler: authenticate }, async (request, reply) => {
  const { section_id, title, body, topic_tags = [] } = request.body || {};
  if (!section_id || !title || !body) return reply.code(400).send({ error: 'section_id, title, body required' });
  
  const secReq = await query('SELECT locked, archived FROM forum_sections WHERE id=$1', [section_id]);
  if (!secReq.rows.length) return reply.code(404).send({ error: 'Section not found' });
  if (secReq.rows[0].locked || secReq.rows[0].archived) return reply.code(403).send({ error: 'Section is locked or archived' });

  const res = await query(
    `INSERT INTO forum_threads (section_id, title, body, author_user_id)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [section_id, title, body, request.user.id]
  );
  await attachTagsToThread(res.rows[0].id, topic_tags);
  const thread = await query(
    `SELECT ft.*,
            COALESCE(array_remove(array_agg(tt.name ORDER BY tt.name), NULL), '{}') AS topic_tags
     FROM forum_threads ft
     LEFT JOIN forum_thread_tags ftt ON ftt.thread_id = ft.id
     LEFT JOIN topic_tags tt ON tt.id = ftt.tag_id
     WHERE ft.id=$1
     GROUP BY ft.id`,
    [res.rows[0].id]
  );
  return reply.code(201).send(thread.rows[0]);
});

app.get('/api/forum/tags', { preHandler: authenticate }, async () => {
  const res = await query(
    `SELECT tt.name, COUNT(ftt.thread_id)::int AS thread_count
     FROM topic_tags tt
     LEFT JOIN forum_thread_tags ftt ON ftt.tag_id = tt.id
     GROUP BY tt.id
     ORDER BY tt.name ASC`
  );
  return { items: res.rows };
});

app.get('/api/forum/threads/by-tag/:tag', { preHandler: authenticate }, async (request) => {
  const tag = String(request.params.tag || '').trim().toLowerCase();
  const isAdmin = roleMatches(request.user.role, FORUM_MODERATION_ROLES);
  const filter = isAdmin ? '' : 'AND ft.archived = FALSE';
  const res = await query(
    `SELECT ft.*,
            COALESCE(array_remove(array_agg(tt2.name ORDER BY tt2.name), NULL), '{}') AS topic_tags
     FROM forum_threads ft
     JOIN forum_thread_tags ftt ON ftt.thread_id = ft.id
     JOIN topic_tags tt ON tt.id = ftt.tag_id
     LEFT JOIN forum_thread_tags ftt2 ON ftt2.thread_id = ft.id
     LEFT JOIN topic_tags tt2 ON tt2.id = ftt2.tag_id
     WHERE tt.name = $1 ${filter}
     GROUP BY ft.id
     ORDER BY ft.created_at DESC`,
    [tag]
  );
  return { items: res.rows };
});

app.get('/api/forum/threads/:id/posts', { preHandler: authenticate }, async (request) => {
  const isAdmin = roleMatches(request.user.role, FORUM_MODERATION_ROLES);
  const qs = isAdmin 
    ? 'SELECT * FROM forum_posts WHERE thread_id=$1 ORDER BY created_at ASC'
    : 'SELECT * FROM forum_posts WHERE thread_id=$1 AND archived = FALSE ORDER BY created_at ASC';
  const res = await query(qs, [request.params.id]);
  return { items: res.rows };
});

app.post('/api/forum/posts', { preHandler: authenticate }, async (request, reply) => {
  const { thread_id, parent_post_id = null, body } = request.body || {};
  if (!thread_id || !body) return reply.code(400).send({ error: 'thread_id and body required' });

  const thReq = await query('SELECT locked, archived FROM forum_threads WHERE id=$1', [thread_id]);
  if (!thReq.rows.length) return reply.code(404).send({ error: 'Thread not found' });
  if (thReq.rows[0].locked || thReq.rows[0].archived) return reply.code(403).send({ error: 'Thread is locked or archived' });

  if (parent_post_id) {
    const parentReq = await query('SELECT locked, archived FROM forum_posts WHERE id=$1', [parent_post_id]);
    if (!parentReq.rows.length) return reply.code(404).send({ error: 'Parent post not found' });
    if (parentReq.rows[0].locked || parentReq.rows[0].archived) return reply.code(403).send({ error: 'Parent post is locked or archived' });
  }

  const res = await query(
    `INSERT INTO forum_posts (thread_id, parent_post_id, body, author_user_id)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [thread_id, parent_post_id, body, request.user.id]
  );
  return reply.code(201).send(res.rows[0]);
});

app.patch('/api/forum/:entity/:id/moderation', { preHandler: [authenticate, authorize(FORUM_MODERATION_ROLES)] }, async (request, reply) => {
  const { entity, id } = request.params;
  const { pinned, featured, locked, archived } = request.body || {};
  const tableMap = { sections: 'forum_sections', threads: 'forum_threads', posts: 'forum_posts' };
  const table = tableMap[entity];
  if (!table) return reply.code(400).send({ error: 'entity must be sections|threads|posts' });

  const updateSql =
    table === 'forum_sections'
      ? `UPDATE ${table}
         SET pinned = COALESCE($1, pinned),
             featured = COALESCE($2, featured),
             locked = COALESCE($3, locked),
             archived = COALESCE($4, archived)
         WHERE id = $5
         RETURNING *`
      : `UPDATE ${table}
         SET pinned = COALESCE($1, pinned),
             featured = COALESCE($2, featured),
             locked = COALESCE($3, locked),
             archived = COALESCE($4, archived),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`;
  const res = await query(updateSql, [pinned, featured, locked, archived, id]);
  if (!res.rows.length) return reply.code(404).send({ error: 'Entity not found' });
  return res.rows[0];
});


async function start() {
  const port = Number(process.env.PORT || 3000);
  const host = '0.0.0.0';
  try {
    await waitForDatabaseReady();
    if (process.env.ADMIN_PASSWORD) {
      const argon2 = await import('argon2');
      const hash = await argon2.default.hash(process.env.ADMIN_PASSWORD);
      await query(`UPDATE users SET password_hash = $1 WHERE username IN ('admin', 'moderator', 'host', 'clerk', 'member')`, [hash]);
      app.log.info('Seeded user credentials from ADMIN_PASSWORD');
    }
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const shutdown = async () => {
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
