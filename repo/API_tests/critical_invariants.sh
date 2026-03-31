#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://localhost:3443}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "[api] ADMIN_PASSWORD env is required"
  exit 1
fi

TMP_DIR="/tmp/task3_api"
mkdir -p "$TMP_DIR"

json_get() {
  local file="$1"
  local path="$2"
  node -e "const fs=require('fs');const o=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const p=process.argv[2].split('.');let c=o;for(const k of p){if(!k)continue;c=c?.[k]}if(c===undefined||c===null){process.exit(2)}process.stdout.write(String(c));" "$file" "$path"
}

req() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local token="${4:-}"
  local out="$5"
  if [[ -n "$data" ]]; then
    curl -sk -o "$out" -w "%{http_code}" -X "$method" "$BASE_URL$url" \
      -H "Content-Type: application/json" \
      ${token:+-H "Authorization: Bearer $token"} \
      -d "$data"
  else
    curl -sk -o "$out" -w "%{http_code}" -X "$method" "$BASE_URL$url" \
      ${token:+-H "Authorization: Bearer $token"}
  fi
}

assert_code() {
  local got="$1"
  local expect="$2"
  local msg="$3"
  if [[ "$got" != "$expect" ]]; then
    echo "[api] FAIL: $msg expected $expect got $got"
    exit 1
  fi
  echo "[api] PASS: $msg"
}

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  local msg="$3"
  if ! grep -q "$pattern" "$file"; then
    echo "[api] FAIL: $msg"
    cat "$file"
    exit 1
  fi
  echo "[api] PASS: $msg"
}

assert_equals() {
  local got="$1"
  local expect="$2"
  local msg="$3"
  if [[ "$got" != "$expect" ]]; then
    echo "[api] FAIL: $msg expected $expect got $got"
    exit 1
  fi
  echo "[api] PASS: $msg"
}

# Login as admin
code=$(req POST "/api/auth/login" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/admin_login.json")
assert_code "$code" "200" "admin login"
ADMIN_TOKEN=$(json_get "$TMP_DIR/admin_login.json" "token")

# Login as host for RBAC checks
code=$(req POST "/api/auth/login" "{\"username\":\"host\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/host_login.json")
assert_code "$code" "200" "host login"
HOST_TOKEN=$(json_get "$TMP_DIR/host_login.json" "token")
HOST_USER_ID=$(json_get "$TMP_DIR/host_login.json" "user.id")

# Login as moderator for forum moderation checks
code=$(req POST "/api/auth/login" "{\"username\":\"moderator\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/moderator_login.json")
assert_code "$code" "200" "moderator login"
MODERATOR_TOKEN=$(json_get "$TMP_DIR/moderator_login.json" "token")

# Login as customer/member for staff endpoint checks
code=$(req POST "/api/auth/login" "{\"username\":\"member\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/member_login.json")
assert_code "$code" "200" "member login"
MEMBER_TOKEN=$(json_get "$TMP_DIR/member_login.json" "token")

# Create SKU and inventory setup
expiry=$(date -u +"%m/%d/%Y")
code=$(req POST "/api/master/skus" "{\"name\":\"Invariant SKU\",\"description\":\"test\",\"expiry_date\":\"$expiry\"}" "$ADMIN_TOKEN" "$TMP_DIR/sku.json")
assert_code "$code" "201" "create sku"
SKU_ID=$(json_get "$TMP_DIR/sku.json" "id")

code=$(req POST "/api/master/skus" "{\"name\":\"Limit SKU\",\"description\":\"limit\",\"expiry_date\":\"$expiry\"}" "$ADMIN_TOKEN" "$TMP_DIR/limit_sku.json")
assert_code "$code" "201" "create limit sku"
LIMIT_SKU_ID=$(json_get "$TMP_DIR/limit_sku.json" "id")

code=$(req POST "/api/master/skus" "{\"name\":\"Third SKU\",\"description\":\"third\",\"expiry_date\":\"$expiry\"}" "$ADMIN_TOKEN" "$TMP_DIR/third_sku.json")
assert_code "$code" "201" "create third sku"
THIRD_SKU_ID=$(json_get "$TMP_DIR/third_sku.json" "id")

code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5000}" "$ADMIN_TOKEN" "$TMP_DIR/inv_main.json")
assert_code "$code" "201" "set MAIN inventory"
code=$(req POST "/api/master/inventory" "{\"store_code\":\"EAST\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5100}" "$ADMIN_TOKEN" "$TMP_DIR/inv_east.json")
assert_code "$code" "201" "set EAST inventory"
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$LIMIT_SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":4000}" "$ADMIN_TOKEN" "$TMP_DIR/inv_limit.json")
assert_code "$code" "201" "set LIMIT inventory"
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$THIRD_SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":3000}" "$ADMIN_TOKEN" "$TMP_DIR/inv_third.json")
assert_code "$code" "201" "set THIRD inventory"

code=$(req POST "/api/master/shipping-rates" "{\"store_code\":\"MAIN\",\"method\":\"pickup\",\"min_subtotal_cents\":0,\"rate_cents\":0}" "$ADMIN_TOKEN" "$TMP_DIR/ship.json")
assert_code "$code" "201" "set shipping rate"

# Cart merge invariant: qty sum with cap + latest edit wins
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":8,\"member_pricing_applied\":false}" "$ADMIN_TOKEN" "$TMP_DIR/cart_main_add.json")
assert_code "$code" "201" "add cart line MAIN"
sleep 1
code=$(req POST "/api/commerce/carts/EAST/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":5,\"member_pricing_applied\":false}" "$ADMIN_TOKEN" "$TMP_DIR/cart_east_add.json")
assert_code "$code" "201" "add cart line EAST"

code=$(req POST "/api/commerce/carts/merge" "{\"from_store_code\":\"EAST\",\"to_store_code\":\"MAIN\"}" "$ADMIN_TOKEN" "$TMP_DIR/cart_merge.json")
assert_code "$code" "200" "merge carts"
qty=$(json_get "$TMP_DIR/cart_merge.json" "items.0.quantity")
if [[ "$qty" != "10" ]]; then
  echo "[api] FAIL: merged quantity cap expected 10 got $qty"
  exit 1
fi
echo "[api] PASS: merged quantity cap"

# Same-store merge must not double-count
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":4,\"member_pricing_applied\":false}" "$ADMIN_TOKEN" "$TMP_DIR/cart_same_store_seed.json")
assert_code "$code" "201" "seed same-store cart line"
code=$(req POST "/api/commerce/carts/merge" "{\"from_store_code\":\"MAIN\",\"to_store_code\":\"MAIN\"}" "$ADMIN_TOKEN" "$TMP_DIR/cart_same_store_merge.json")
assert_code "$code" "200" "same-store merge"
same_qty=$(json_get "$TMP_DIR/cart_same_store_merge.json" "items.0.quantity")
if [[ "$same_qty" != "4" ]]; then
  echo "[api] FAIL: same-store merge double-counted quantity, expected 4 got $same_qty"
  exit 1
fi
echo "[api] PASS: same-store merge does not double-count"

# Promotion stacking: member+coupon allowed (subtotal below threshold)
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":1,\"member_pricing_applied\":true,\"coupon_code\":\"WELCOME10\"}" "$ADMIN_TOKEN" "$TMP_DIR/cart_single.json")
assert_code "$code" "201" "set single-line cart for promo"
code=$(req GET "/api/commerce/checkout/preview?store_code=MAIN&coupon_code=WELCOME10&member_pricing=true" "" "$ADMIN_TOKEN" "$TMP_DIR/preview_allowed.json")
assert_code "$code" "200" "member + coupon allowed"
plimit=$(json_get "$TMP_DIR/preview_allowed.json" "purchase_limit")
if [[ "$plimit" != "max 2 per customer per day" ]]; then
  echo "[api] FAIL: purchase-limit display contract missing"
  exit 1
fi
echo "[api] PASS: purchase-limit display contract"
preview_already=$(json_get "$TMP_DIR/preview_allowed.json" "purchase_limit_status.already_purchased_today")
preview_cart_total=$(json_get "$TMP_DIR/preview_allowed.json" "purchase_limit_status.in_cart_total_quantity")
assert_equals "$preview_already" "0" "preview shows customer-wide already purchased count"
assert_equals "$preview_cart_total" "1" "preview shows cart total quantity for daily limit"

# threshold + coupon blocked (subtotal above threshold)
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":3,\"member_pricing_applied\":false,\"coupon_code\":\"WELCOME10\"}" "$ADMIN_TOKEN" "$TMP_DIR/cart_threshold.json")
assert_code "$code" "201" "set threshold cart"
code=$(req GET "/api/commerce/checkout/preview?store_code=MAIN&coupon_code=WELCOME10&member_pricing=false" "" "$ADMIN_TOKEN" "$TMP_DIR/preview_blocked.json")
assert_code "$code" "400" "threshold + coupon blocked"
assert_file_contains "$TMP_DIR/preview_blocked.json" "threshold discounts must not combine with coupons" "threshold + coupon returns rule error"

# checkout variance > 2% blocked
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":1}" "$ADMIN_TOKEN" "$TMP_DIR/cart_variance.json")
assert_code "$code" "201" "set variance cart"
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5150}" "$ADMIN_TOKEN" "$TMP_DIR/inv_variance.json")
assert_code "$code" "201" "raise price >2%"
code=$(req POST "/api/commerce/checkout/place" "{\"store_code\":\"MAIN\",\"delivery_method\":\"pickup\"}" "$ADMIN_TOKEN" "$TMP_DIR/place_variance.json")
assert_code "$code" "400" "checkout blocked on >2% price change"
assert_file_contains "$TMP_DIR/place_variance.json" "price changed by more than 2%" "variance block reason"

# checkout variance exactly 2% allowed
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5000}" "$ADMIN_TOKEN" "$TMP_DIR/inv_reset_exact.json")
assert_code "$code" "201" "reset price for exact variance"
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":1}" "$ADMIN_TOKEN" "$TMP_DIR/cart_exact2.json")
assert_code "$code" "201" "set exact 2 percent cart"
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5100}" "$ADMIN_TOKEN" "$TMP_DIR/inv_exact2.json")
assert_code "$code" "201" "raise price exactly 2%"
code=$(req POST "/api/commerce/checkout/place" "{\"store_code\":\"MAIN\",\"delivery_method\":\"pickup\"}" "$ADMIN_TOKEN" "$TMP_DIR/place_exact2.json")
assert_code "$code" "200" "checkout allows exact 2% change"

# stock insufficient blocked
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":1,\"unit_price_cents\":5000}" "$ADMIN_TOKEN" "$TMP_DIR/inv_stock_low.json")
assert_code "$code" "201" "set low stock"
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":2}" "$ADMIN_TOKEN" "$TMP_DIR/cart_stock2.json")
assert_code "$code" "201" "set qty above stock"
code=$(req POST "/api/commerce/checkout/place" "{\"store_code\":\"MAIN\",\"delivery_method\":\"pickup\"}" "$ADMIN_TOKEN" "$TMP_DIR/place_stock.json")
assert_code "$code" "400" "checkout blocked on insufficient stock"
assert_file_contains "$TMP_DIR/place_stock.json" "stock insufficient" "stock block reason"

# purchase limit enforcement max 2/day across all SKUs
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$LIMIT_SKU_ID\",\"stock_qty\":10,\"unit_price_cents\":4000}" "$ADMIN_TOKEN" "$TMP_DIR/inv_stock_reset.json")
assert_code "$code" "201" "reset inventory"
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":1}" "$ADMIN_TOKEN" "$TMP_DIR/cart_limit_a.json")
assert_code "$code" "201" "set first sku qty1"
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$LIMIT_SKU_ID\",\"quantity\":1}" "$ADMIN_TOKEN" "$TMP_DIR/cart_limit_b.json")
assert_code "$code" "201" "set second sku qty1"
code=$(req GET "/api/commerce/checkout/preview?store_code=MAIN" "" "$ADMIN_TOKEN" "$TMP_DIR/preview_limit_cross_sku.json")
assert_code "$code" "200" "preview cross-sku limit cart"
preview_cross_total=$(json_get "$TMP_DIR/preview_limit_cross_sku.json" "purchase_limit_status.in_cart_total_quantity")
assert_equals "$preview_cross_total" "2" "preview sums cart quantity across SKUs"
code=$(req POST "/api/commerce/checkout/place" "{\"store_code\":\"MAIN\",\"delivery_method\":\"pickup\"}" "$ADMIN_TOKEN" "$TMP_DIR/place_limit_ok.json")
assert_code "$code" "200" "first purchase within limit"
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$THIRD_SKU_ID\",\"quantity\":1}" "$ADMIN_TOKEN" "$TMP_DIR/cart_limit_over.json")
assert_code "$code" "201" "set third sku qty1 after reaching limit"
code=$(req GET "/api/commerce/checkout/preview?store_code=MAIN" "" "$ADMIN_TOKEN" "$TMP_DIR/preview_limit_blocked.json")
assert_code "$code" "200" "preview after reaching cross-sku limit"
preview_limit_exceeded=$(json_get "$TMP_DIR/preview_limit_blocked.json" "purchase_limit_status.would_exceed")
assert_equals "$preview_limit_exceeded" "true" "preview signals customer-wide limit exceeded"
code=$(req POST "/api/commerce/checkout/place" "{\"store_code\":\"MAIN\",\"delivery_method\":\"pickup\"}" "$ADMIN_TOKEN" "$TMP_DIR/place_limit_fail.json")
assert_code "$code" "400" "purchase limit enforced"
assert_file_contains "$TMP_DIR/place_limit_fail.json" "purchase limit exceeded for customer per day" "purchase limit block reason"

# customer dedupe semantics + immutable logs
code=$(req POST "/api/master/customers" "{\"full_name\":\"Alice A\",\"email\":\"dedupe@example.com\",\"phone\":\"(555) 111-2222\",\"address\":\"123 Main\"}" "$ADMIN_TOKEN" "$TMP_DIR/c1.json")
assert_code "$code" "201" "create customer 1"
C1=$(json_get "$TMP_DIR/c1.json" "id")
code=$(req POST "/api/master/customers" "{\"full_name\":\"Consent Customer\",\"email\":\"consent@example.com\",\"phone\":\"(555) 333-4444\",\"marketing_email_consent\":true,\"marketing_sms_consent\":false,\"address\":\"789 Main\"}" "$ADMIN_TOKEN" "$TMP_DIR/consent_customer.json")
assert_code "$code" "201" "create consent customer"
CONSENT_CUSTOMER_ID=$(json_get "$TMP_DIR/consent_customer.json" "id")
consent_email=$(json_get "$TMP_DIR/consent_customer.json" "marketing_email_consent")
consent_sms=$(json_get "$TMP_DIR/consent_customer.json" "marketing_sms_consent")
assert_equals "$consent_email" "true" "marketing email consent stored"
assert_equals "$consent_sms" "false" "marketing sms consent default/explicit value stored"
code=$(req PATCH "/api/master/customers/$CONSENT_CUSTOMER_ID" "{\"marketing_email_consent\":false,\"marketing_sms_consent\":true}" "$ADMIN_TOKEN" "$TMP_DIR/consent_customer_patch.json")
assert_code "$code" "200" "update consent customer"
consent_email_after=$(json_get "$TMP_DIR/consent_customer_patch.json" "marketing_email_consent")
consent_sms_after=$(json_get "$TMP_DIR/consent_customer_patch.json" "marketing_sms_consent")
assert_equals "$consent_email_after" "false" "marketing email consent updated"
assert_equals "$consent_sms_after" "true" "marketing sms consent updated"
code=$(req POST "/api/master/customers" "{\"full_name\":\"Alice B\",\"email\":\"dedupe@example.com\",\"phone\":\"5551112222\",\"address\":\"456 Main\"}" "$ADMIN_TOKEN" "$TMP_DIR/c2.json")
assert_code "$code" "201" "create customer 2"
C2=$(json_get "$TMP_DIR/c2.json" "id")
code=$(req GET "/api/master/customers/dedupe-scan" "" "$ADMIN_TOKEN" "$TMP_DIR/dedupe_scan.json")
assert_code "$code" "200" "dedupe scan"
code=$(req POST "/api/master/customers/dedupe-merge" "{\"source_customer_id\":\"$C1\",\"target_customer_id\":\"$C2\"}" "$ADMIN_TOKEN" "$TMP_DIR/dedupe_merge.json")
assert_code "$code" "200" "dedupe merge"
code=$(req GET "/api/admin/immutable-logs?limit=200" "" "$ADMIN_TOKEN" "$TMP_DIR/immut.json")
assert_code "$code" "200" "read immutable logs"
assert_file_contains "$TMP_DIR/dedupe_merge.json" "\"reason\":\"email\"" "dedupe merge reason is recorded"
assert_file_contains "$TMP_DIR/immut.json" "\"event_type\":\"merge\"" "immutable merge log exists"
assert_file_contains "$TMP_DIR/immut.json" "\"entity_type\":\"customer\"" "immutable customer merge entity exists"
code=$(req POST "/api/master/customers/export-csv" "{\"file_path\":\"/tmp/task3_api/customers_export.csv\"}" "$ADMIN_TOKEN" "$TMP_DIR/customer_export.json")
assert_code "$code" "200" "export customers csv"
assert_file_contains "/tmp/task3_api/customers_export.csv" "marketing_email_consent" "customer export includes email consent column"
assert_file_contains "/tmp/task3_api/customers_export.csv" "marketing_sms_consent" "customer export includes sms consent column"
assert_file_contains "/tmp/task3_api/customers_export.csv" "consent@example.com" "customer export includes consent customer row"

# Booking validation against business hours, schedule, and overlap
code=$(req GET "/api/scripts" "" "$ADMIN_TOKEN" "$TMP_DIR/scripts_list.json")
assert_code "$code" "200" "list scripts"
SCRIPT_ID=$(json_get "$TMP_DIR/scripts_list.json" "items.0.id")
code=$(req GET "/api/resources/rooms" "" "$ADMIN_TOKEN" "$TMP_DIR/rooms_list.json")
assert_code "$code" "200" "list rooms"
ROOM_ID=$(json_get "$TMP_DIR/rooms_list.json" "items.0.id")
ROOM_NO_SCHEDULE_ID=$(json_get "$TMP_DIR/rooms_list.json" "items.1.id")
code=$(req POST "/api/resources/host-schedules" "{\"host_user_id\":\"$HOST_USER_ID\",\"room_id\":\"$ROOM_ID\",\"weekday\":1,\"start_time\":\"09:00\",\"end_time\":\"17:00\",\"is_available\":true}" "$ADMIN_TOKEN" "$TMP_DIR/host_schedule.json")
assert_code "$code" "201" "create host schedule"
code=$(req POST "/api/bookings" "{\"script_id\":\"$SCRIPT_ID\",\"room_id\":\"$ROOM_ID\",\"customer_name\":\"Hours Fail\",\"party_size\":2,\"start_at\":\"2026-03-30T08:00:00Z\",\"end_at\":\"2026-03-30T09:00:00Z\"}" "$ADMIN_TOKEN" "$TMP_DIR/booking_hours_fail.json")
assert_code "$code" "400" "outside business hours rejected"
assert_file_contains "$TMP_DIR/booking_hours_fail.json" "outside business hours" "outside-hours error message"
code=$(req POST "/api/bookings" "{\"script_id\":\"$SCRIPT_ID\",\"room_id\":\"$ROOM_NO_SCHEDULE_ID\",\"customer_name\":\"No Schedule\",\"party_size\":2,\"start_at\":\"2026-03-30T10:00:00Z\",\"end_at\":\"2026-03-30T11:00:00Z\"}" "$ADMIN_TOKEN" "$TMP_DIR/booking_schedule_fail.json")
assert_code "$code" "400" "missing availability rejected"
assert_file_contains "$TMP_DIR/booking_schedule_fail.json" "no host schedule or availability exists" "missing schedule error message"
code=$(req POST "/api/bookings" "{\"script_id\":\"$SCRIPT_ID\",\"room_id\":\"$ROOM_ID\",\"customer_name\":\"Valid Booking\",\"party_size\":2,\"start_at\":\"2026-03-30T10:00:00Z\",\"end_at\":\"2026-03-30T11:00:00Z\"}" "$ADMIN_TOKEN" "$TMP_DIR/booking_valid.json")
assert_code "$code" "201" "valid booking accepted"
code=$(req POST "/api/bookings" "{\"script_id\":\"$SCRIPT_ID\",\"room_id\":\"$ROOM_ID\",\"customer_name\":\"Overlap Booking\",\"party_size\":2,\"start_at\":\"2026-03-30T10:30:00Z\",\"end_at\":\"2026-03-30T11:30:00Z\"}" "$ADMIN_TOKEN" "$TMP_DIR/booking_overlap_fail.json")
assert_code "$code" "400" "overlapping booking rejected"
assert_file_contains "$TMP_DIR/booking_overlap_fail.json" "overlaps an existing reservation" "overlap error message"

# IDOR / RBAC checks
code=$(req GET "/api/master/customers/dedupe-scan" "" "$HOST_TOKEN" "$TMP_DIR/host_dedupe_forbidden.json")
assert_code "$code" "403" "host cannot access dedupe admin endpoint"
code=$(req GET "/api/master/skus" "" "$MEMBER_TOKEN" "$TMP_DIR/member_master_forbidden.json")
assert_code "$code" "403" "customer member cannot access master data"
code=$(req GET "/api/master/customers?include_sensitive=true" "" "$HOST_TOKEN" "$TMP_DIR/host_masked.json")
assert_code "$code" "200" "host customer list"
if grep -q "123 Main" "$TMP_DIR/host_masked.json"; then
  echo "[api] FAIL: sensitive address leaked for non-admin"
  exit 1
fi
echo "[api] PASS: sensitive fields masked for non-admin"

# Forum moderation stays Moderator/Admin only
code=$(req POST "/api/forum/sections" "{\"name\":\"RBAC Section\",\"description\":\"test\"}" "$ADMIN_TOKEN" "$TMP_DIR/forum_section.json")
assert_code "$code" "201" "admin creates forum section"
SECTION_ID=$(json_get "$TMP_DIR/forum_section.json" "id")
code=$(req POST "/api/forum/sections" "{\"name\":\"Nested RBAC Section\",\"description\":\"child\",\"parent_section_id\":\"$SECTION_ID\"}" "$ADMIN_TOKEN" "$TMP_DIR/forum_child_section.json")
assert_code "$code" "201" "admin creates nested forum section"
CHILD_SECTION_ID=$(json_get "$TMP_DIR/forum_child_section.json" "id")
code=$(req GET "/api/forum/sections" "" "$ADMIN_TOKEN" "$TMP_DIR/forum_sections_get.json")
assert_code "$code" "200" "list forum sections with hierarchy"
assert_file_contains "$TMP_DIR/forum_sections_get.json" "\"parent_section_id\":\"$SECTION_ID\"" "nested section parent id returned"
assert_file_contains "$TMP_DIR/forum_sections_get.json" "\"children\"" "forum hierarchy payload returned"
code=$(req POST "/api/forum/threads" "{\"section_id\":\"$SECTION_ID\",\"title\":\"RBAC Thread\",\"body\":\"body\"}" "$HOST_TOKEN" "$TMP_DIR/forum_thread.json")
assert_code "$code" "201" "host creates thread"
THREAD_ID=$(json_get "$TMP_DIR/forum_thread.json" "id")
code=$(req POST "/api/forum/threads" "{\"section_id\":\"$CHILD_SECTION_ID\",\"title\":\"Tagged Thread\",\"body\":\"body\",\"topic_tags\":[\"operations\",\"priority\"]}" "$ADMIN_TOKEN" "$TMP_DIR/forum_tagged_thread.json")
assert_code "$code" "201" "create tagged thread"
assert_file_contains "$TMP_DIR/forum_tagged_thread.json" "\"topic_tags\":[\"operations\",\"priority\"]" "thread tags stored on create"
code=$(req GET "/api/forum/tags" "" "$ADMIN_TOKEN" "$TMP_DIR/forum_tags.json")
assert_code "$code" "200" "list topic tags"
assert_file_contains "$TMP_DIR/forum_tags.json" "\"name\":\"operations\"" "topic tag listed"
code=$(req GET "/api/forum/threads/by-tag/operations" "" "$ADMIN_TOKEN" "$TMP_DIR/forum_threads_by_tag.json")
assert_code "$code" "200" "list threads by tag"
assert_file_contains "$TMP_DIR/forum_threads_by_tag.json" "\"title\":\"Tagged Thread\"" "thread retrieved by tag filter"
code=$(req PATCH "/api/forum/threads/$THREAD_ID/moderation" "{\"featured\":true}" "$HOST_TOKEN" "$TMP_DIR/forum_host_forbidden.json")
assert_code "$code" "403" "store manager cannot moderate forum"
code=$(req PATCH "/api/forum/threads/$THREAD_ID/moderation" "{\"featured\":true}" "$MODERATOR_TOKEN" "$TMP_DIR/forum_mod_ok.json")
assert_code "$code" "200" "moderator can moderate forum"
assert_file_contains "$TMP_DIR/forum_mod_ok.json" "\"featured\":true" "moderator change persisted"

# Scoring grades and rankings by store and date range
code=$(req POST "/api/scoring/calculate" "{\"subject_id\":\"rank-a\",\"round_key\":\"r1\",\"store_code\":\"MAIN\",\"strategy\":\"drop\",\"metrics\":{\"a\":95,\"b\":85},\"weights\":{\"a\":0.5,\"b\":0.5},\"previous_round_scores\":[]}" "$ADMIN_TOKEN" "$TMP_DIR/score_a.json")
assert_code "$code" "201" "create scoring entry A"
assert_file_contains "$TMP_DIR/score_a.json" "\"grade\":\"A\"" "grade A returned on scoring"
code=$(req POST "/api/scoring/calculate" "{\"subject_id\":\"rank-b\",\"round_key\":\"r1\",\"store_code\":\"MAIN\",\"strategy\":\"drop\",\"metrics\":{\"a\":70,\"b\":70},\"weights\":{\"a\":0.5,\"b\":0.5},\"previous_round_scores\":[]}" "$ADMIN_TOKEN" "$TMP_DIR/score_b.json")
assert_code "$code" "201" "create scoring entry B"
code=$(req GET "/api/scoring/grades-rankings?store_code=MAIN&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z" "" "$ADMIN_TOKEN" "$TMP_DIR/scoring_rankings.json")
assert_code "$code" "200" "load scoring rankings"
top_subject=$(json_get "$TMP_DIR/scoring_rankings.json" "rankings.0.subject_id")
top_grade=$(json_get "$TMP_DIR/scoring_rankings.json" "rankings.0.grade")
second_subject=$(json_get "$TMP_DIR/scoring_rankings.json" "rankings.1.subject_id")
assert_equals "$top_subject" "rank-a" "rankings sorted by aggregated score"
assert_equals "$top_grade" "A" "top ranking grade is deterministic"
assert_equals "$second_subject" "rank-b" "second ranking subject order is deterministic"

echo "[api] All critical invariant API checks passed."
