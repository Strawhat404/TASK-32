CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(32) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(128) NOT NULL,
  description TEXT,
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  min_party_size INTEGER NOT NULL CHECK (min_party_size > 0),
  max_party_size INTEGER NOT NULL CHECK (max_party_size >= min_party_size),
  required_props TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL CHECK (status IN ('active', 'paused')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(64) UNIQUE NOT NULL,
  room_type VARCHAR(16) NOT NULL CHECK (room_type IN ('room', 'table')),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (weekday)
);

CREATE TABLE IF NOT EXISTS host_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_user_id UUID NOT NULL REFERENCES users(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id UUID NOT NULL REFERENCES scripts(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  booked_by_user_id UUID REFERENCES users(id),
  customer_name VARCHAR(128) NOT NULL,
  customer_email VARCHAR(128),
  party_size INTEGER NOT NULL CHECK (party_size > 0),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(128) NOT NULL,
  description TEXT,
  parent_section_id UUID REFERENCES forum_sections(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id UUID NOT NULL REFERENCES forum_sections(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  author_user_id UUID REFERENCES users(id),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_thread_tags (
  thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES topic_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, tag_id)
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  parent_post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_user_id UUID REFERENCES users(id),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES users(id),
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS immutable_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(64) NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sku_coding_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(128) NOT NULL,
  entity_type VARCHAR(32) NOT NULL DEFAULT 'sku',
  template VARCHAR(64) NOT NULL,
  effective_start_at TIMESTAMPTZ NOT NULL,
  effective_end_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sku_coding_rule_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES sku_coding_rules(id) ON DELETE CASCADE,
  period_key VARCHAR(16) NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, period_key)
);

CREATE TABLE IF NOT EXISTS skus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  code_expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sku_barcodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  barcode VARCHAR(64) UNIQUE NOT NULL,
  symbology VARCHAR(32) NOT NULL DEFAULT 'EAN-13',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sku_batch_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  lot_number VARCHAR(64) NOT NULL,
  batch_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  manufactured_at DATE,
  expires_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sku_id, lot_number)
);

CREATE TABLE IF NOT EXISTS packaging_specs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  package_type VARCHAR(32) NOT NULL,
  units_per_package INTEGER NOT NULL CHECK (units_per_package > 0),
  weight_grams NUMERIC(12,2),
  dimensions_cm JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bin_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_code VARCHAR(32) NOT NULL,
  aisle VARCHAR(16) NOT NULL,
  shelf VARCHAR(16) NOT NULL,
  bin_code VARCHAR(64) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  service_levels TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(128) NOT NULL,
  email VARCHAR(128),
  phone VARCHAR(32),
  normalized_phone VARCHAR(32),
  marketing_email_consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_sms_consent BOOLEAN NOT NULL DEFAULT FALSE,
  address_encrypted TEXT,
  notes_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_phone_norm ON customers (normalized_phone);

CREATE TABLE IF NOT EXISTS customer_merge_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_customer_id UUID NOT NULL REFERENCES customers(id),
  target_customer_id UUID NOT NULL REFERENCES customers(id),
  reason VARCHAR(64) NOT NULL,
  merged_by_user_id UUID REFERENCES users(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  jurisdiction_code VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sku_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, sku_id)
);

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, store_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  latest_edit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unit_price_snapshot_cents INTEGER NOT NULL CHECK (unit_price_snapshot_cents >= 0),
  member_pricing_applied BOOLEAN NOT NULL DEFAULT FALSE,
  coupon_code VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, sku_id)
);

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_type VARCHAR(24) NOT NULL CHECK (promo_type IN ('threshold', 'coupon', 'member')),
  code VARCHAR(32),
  threshold_cents INTEGER,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(32) UNIQUE NOT NULL,
  description VARCHAR(128) NOT NULL,
  tax_rate_percent NUMERIC(6,3) NOT NULL CHECK (tax_rate_percent >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_rate_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  method VARCHAR(24) NOT NULL CHECK (method IN ('pickup', 'local_delivery', 'shipment')),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  max_subtotal_cents INTEGER,
  rate_cents INTEGER NOT NULL CHECK (rate_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  customer_id UUID REFERENCES customers(id),
  delivery_method VARCHAR(24) NOT NULL CHECK (delivery_method IN ('pickup', 'local_delivery', 'shipment')),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  shipping_address_encrypted TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'placed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scoring_adjustment_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id VARCHAR(128) NOT NULL,
  round_key VARCHAR(64) NOT NULL,
  store_id UUID REFERENCES stores(id),
  score_before NUMERIC(12,4),
  score_after NUMERIC(12,4) NOT NULL,
  strategy VARCHAR(16) NOT NULL CHECK (strategy IN ('drop', 'zero-fill', 'average-fill')),
  mapping_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_deletion_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(16) NOT NULL CHECK (entity_type IN ('thread', 'post')),
  entity_id UUID NOT NULL,
  requested_by UUID REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restore_deadline TIMESTAMPTZ NOT NULL,
  restored_at TIMESTAMPTZ,
  is_purged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS forum_tombstone_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(16) NOT NULL,
  entity_id UUID NOT NULL,
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retain_until TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dlp_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('accepted', 'rejected', 'quarantined')),
  reason VARCHAR(128) NOT NULL,
  source_path TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
  ('Administrator', 'Platform administrator'),
  ('Store Manager', 'Operational manager'),
  ('Inventory Clerk', 'Inventory staff'),
  ('Moderator', 'Forum moderator'),
  ('Customer/Member', 'Customer or member user')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (username, password_hash, role_id)
SELECT
  'admin',
  '$argon2id$v=19$BOOTSTRAP_REQUIRED',
  r.id
FROM roles r
WHERE r.name = 'Administrator'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, password_hash, role_id)
SELECT
  'moderator',
  '$argon2id$v=19$BOOTSTRAP_REQUIRED',
  r.id
FROM roles r
WHERE r.name = 'Moderator'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, password_hash, role_id)
SELECT
  'host',
  '$argon2id$v=19$BOOTSTRAP_REQUIRED',
  r.id
FROM roles r
WHERE r.name = 'Store Manager'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, password_hash, role_id)
SELECT
  'clerk',
  '$argon2id$v=19$BOOTSTRAP_REQUIRED',
  r.id
FROM roles r
WHERE r.name = 'Inventory Clerk'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, password_hash, role_id)
SELECT
  'member',
  '$argon2id$v=19$BOOTSTRAP_REQUIRED',
  r.id
FROM roles r
WHERE r.name = 'Customer/Member'
ON CONFLICT (username) DO NOTHING;

INSERT INTO forum_sections (name, description, pinned, featured)
VALUES ('Announcements', 'Official updates and platform notices', TRUE, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO forum_sections (name, description, parent_section_id)
SELECT 'Operational Announcements', 'Nested updates for operational teams', fs.id
FROM forum_sections fs
WHERE fs.name = 'Announcements'
ON CONFLICT DO NOTHING;

INSERT INTO rooms (name, room_type, capacity)
VALUES
  ('Room Alpha', 'room', 8),
  ('Table 1', 'table', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO business_hours (weekday, open_time, close_time, is_closed)
VALUES
  (0, '09:00', '18:00', FALSE),
  (1, '09:00', '18:00', FALSE),
  (2, '09:00', '18:00', FALSE),
  (3, '09:00', '18:00', FALSE),
  (4, '09:00', '18:00', FALSE),
  (5, '10:00', '16:00', FALSE),
  (6, '00:00', '00:00', TRUE)
ON CONFLICT (weekday) DO NOTHING;

INSERT INTO scripts (title, description, difficulty, duration_minutes, min_party_size, max_party_size, required_props, status, tags)
VALUES
  ('Vault Heist', 'A classic break-in scenario', 3, 60, 2, 6, ARRAY['lockpick set', 'map'], 'active', ARRAY['heist', 'team']),
  ('Signal Lost', 'Restore a critical uplink before timeout', 4, 45, 2, 5, ARRAY['radio', 'cipher wheel'], 'paused', ARRAY['sci-fi'])
ON CONFLICT DO NOTHING;

INSERT INTO sku_coding_rules (name, entity_type, template, effective_start_at, effective_end_at, priority, is_active)
VALUES
  ('Default SKU Rule', 'sku', 'SKU-YYYYMM-####', '2025-01-01T00:00:00Z', NULL, 100, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO stores (code, name, jurisdiction_code)
VALUES
  ('MAIN', 'Main Store', 'US-CA-SF'),
  ('EAST', 'East Store', 'US-NY-NYC')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tax_jurisdictions (code, description, tax_rate_percent, is_active)
VALUES
  ('US-CA-SF', 'San Francisco Tax Rule', 8.625, TRUE),
  ('US-NY-NYC', 'NYC Tax Rule', 8.875, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO promotions (promo_type, code, threshold_cents, discount_percent, is_active, starts_at)
VALUES
  ('threshold', NULL, 10000, 10.0, TRUE, NOW()),
  ('coupon', 'WELCOME10', NULL, 10.0, TRUE, NOW()),
  ('member', NULL, NULL, 5.0, TRUE, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO carriers (code, name, service_levels)
VALUES
  ('LOCAL', 'Local Carrier', ARRAY['same_day','next_day']),
  ('GROUND', 'Ground Carrier', ARRAY['standard'])
ON CONFLICT (code) DO NOTHING;

INSERT INTO topic_tags (name)
VALUES ('operations'), ('events'), ('staff')
ON CONFLICT (name) DO NOTHING;
