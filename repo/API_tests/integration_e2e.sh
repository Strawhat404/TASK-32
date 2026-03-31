#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-https://localhost:3443}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
if [[ -z "$ADMIN_PASSWORD" ]]; then echo "[e2e] ADMIN_PASSWORD required"; exit 1; fi

TMP_DIR="/tmp/task3_api_e2e"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

json_get() {
  node -e "const fs=require('fs');const o=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const p=process.argv[2].split('.');let c=o;for(const k of p){if(!k)continue;c=c?.[k]}if(c===undefined||c===null){process.exit(2)}process.stdout.write(String(c));" "$1" "$2"
}

req() {
  local method="$1" url="$2" data="${3:-}" token="${4:-}" out="$5"
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
  local got="$1" expect="$2" msg="$3"
  if [[ "$got" != "$expect" ]]; then echo "[e2e] FAIL: $msg expected $expect got $got"; cat "${5:-/dev/null}" 2>/dev/null || true; exit 1; fi
  echo "[e2e] PASS: $msg"
}

assert_file_contains() {
  local file="$1" pattern="$2" msg="$3"
  if ! grep -q "$pattern" "$file"; then echo "[e2e] FAIL: $msg"; cat "$file"; exit 1; fi
  echo "[e2e] PASS: $msg"
}

assert_equals() {
  local got="$1" expect="$2" msg="$3"
  if [[ "$got" != "$expect" ]]; then echo "[e2e] FAIL: $msg expected '$expect' got '$got'"; exit 1; fi
  echo "[e2e] PASS: $msg"
}

echo "=== E2E Integration Tests ==="
echo ""

# ================================================================
# 1. LOGIN ALL ROLES
# ================================================================
echo "--- 1. Authentication ---"
code=$(req POST "/api/auth/login" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/admin.json")
assert_code "$code" "200" "admin login"
ADM_TK=$(json_get "$TMP_DIR/admin.json" "token")

code=$(req POST "/api/auth/login" "{\"username\":\"member\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/member.json")
assert_code "$code" "200" "member login"
MEM_TK=$(json_get "$TMP_DIR/member.json" "token")

code=$(req POST "/api/auth/login" "{\"username\":\"host\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/host.json")
assert_code "$code" "200" "host login"
HOST_TK=$(json_get "$TMP_DIR/host.json" "token")

# ================================================================
# 2. BOOKING ISOLATION (IDOR protection)
# ================================================================
echo ""
echo "--- 2. Booking Isolation ---"
code=$(req GET "/api/scripts" "" "$ADM_TK" "$TMP_DIR/scripts.json")
SCRIPT_ID=$(json_get "$TMP_DIR/scripts.json" "items.0.id")
code=$(req GET "/api/resources/rooms" "" "$ADM_TK" "$TMP_DIR/rooms.json")
ROOM_ID=$(json_get "$TMP_DIR/rooms.json" "items.0.id")

code=$(req POST "/api/bookings" "{\"script_id\":\"$SCRIPT_ID\",\"room_id\":\"$ROOM_ID\",\"customer_name\":\"Admin E2E\",\"party_size\":2,\"start_at\":\"2026-07-01T10:00:00Z\",\"end_at\":\"2026-07-01T11:00:00Z\"}" "$ADM_TK" "$TMP_DIR/bk_admin.json")
assert_code "$code" "201" "admin booking created"

code=$(req GET "/api/bookings" "" "$MEM_TK" "$TMP_DIR/bk_mem.json")
assert_code "$code" "200" "member gets bookings"
COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMP_DIR/bk_mem.json')).items.length)")
if [[ "$COUNT" != "0" ]]; then echo "[e2e] FAIL: Member saw $COUNT bookings (expected 0 — IDOR leak)"; exit 1; fi
echo "[e2e] PASS: member booking isolation verified"

# ================================================================
# 3. MASTER DATA LIFECYCLE
# ================================================================
echo ""
echo "--- 3. Master Data Lifecycle ---"

# SKU Rule
code=$(req POST "/api/master/sku-rules" "{\"name\":\"E2E Rule\",\"template\":\"E2E-####\",\"effective_start_at\":\"2026-01-01T00:00:00Z\",\"effective_end_at\":\"2026-12-31T00:00:00Z\"}" "$ADM_TK" "$TMP_DIR/rule.json")
assert_code "$code" "201" "create sku rule with expiry"
assert_file_contains "$TMP_DIR/rule.json" "effective_end_at" "rule has effective_end_at"

# SKU
expiry=$(date -u +"%m/%d/%Y")
code=$(req POST "/api/master/skus" "{\"name\":\"E2E SKU\",\"description\":\"integration test\",\"expiry_date\":\"$expiry\"}" "$ADM_TK" "$TMP_DIR/sku.json")
assert_code "$code" "201" "create sku"
SKU_ID=$(json_get "$TMP_DIR/sku.json" "id")

# Barcode
code=$(req POST "/api/master/skus/$SKU_ID/barcodes" "{\"barcode\":\"9780000000001\",\"symbology\":\"EAN-13\",\"is_primary\":true}" "$ADM_TK" "$TMP_DIR/bc.json")
assert_code "$code" "201" "add barcode"
assert_file_contains "$TMP_DIR/bc.json" "EAN-13" "barcode symbology stored"

# Lot
code=$(req POST "/api/master/skus/$SKU_ID/lots" "{\"lot_number\":\"LOT-E2E-001\",\"batch_attributes\":{\"color\":\"red\"}}" "$ADM_TK" "$TMP_DIR/lot.json")
assert_code "$code" "201" "add lot"
assert_file_contains "$TMP_DIR/lot.json" "LOT-E2E-001" "lot number stored"

# Packaging
code=$(req POST "/api/master/skus/$SKU_ID/packaging" "{\"package_type\":\"box\",\"units_per_package\":12,\"weight_grams\":500}" "$ADM_TK" "$TMP_DIR/pack.json")
assert_code "$code" "201" "add packaging spec"

# Bin
code=$(req POST "/api/master/bins" "{\"warehouse_code\":\"WH1\",\"aisle\":\"A\",\"shelf\":\"S1\",\"bin_code\":\"BIN-E2E-001\"}" "$ADM_TK" "$TMP_DIR/bin.json")
assert_code "$code" "201" "create bin location"

# Carrier
code=$(req POST "/api/master/carriers" "{\"code\":\"E2E-SHIP\",\"name\":\"E2E Carrier\",\"service_levels\":[\"standard\",\"express\"]}" "$ADM_TK" "$TMP_DIR/carrier.json")
assert_code "$code" "201" "create carrier"

# RBAC: Member blocked from master data
code=$(req GET "/api/master/skus" "" "$MEM_TK" "$TMP_DIR/mem_skus.json")
assert_code "$code" "403" "member blocked from master data"

# ================================================================
# 4. CUSTOMER ADMIN + CSV IMPORT + DEDUPE MERGE
# ================================================================
echo ""
echo "--- 4. Customer Admin + CSV + Dedupe ---"

# Create customers
code=$(req POST "/api/master/customers" "{\"full_name\":\"Import Alice\",\"email\":\"import-alice@e2e.test\",\"phone\":\"(555) 100-2001\",\"marketing_email_consent\":true,\"marketing_sms_consent\":false}" "$ADM_TK" "$TMP_DIR/cust1.json")
assert_code "$code" "201" "create customer 1"
C1_ID=$(json_get "$TMP_DIR/cust1.json" "id")

code=$(req POST "/api/master/customers" "{\"full_name\":\"Import Alice Dup\",\"email\":\"import-alice@e2e.test\",\"phone\":\"5551002001\"}" "$ADM_TK" "$TMP_DIR/cust2.json")
assert_code "$code" "201" "create customer 2 (duplicate email)"
C2_ID=$(json_get "$TMP_DIR/cust2.json" "id")

# Dedupe scan should find the pair
code=$(req GET "/api/master/customers/dedupe-scan" "" "$ADM_TK" "$TMP_DIR/dedupe_scan.json")
assert_code "$code" "200" "dedupe scan"
assert_file_contains "$TMP_DIR/dedupe_scan.json" "\"reason\"" "dedupe scan returns matches with reason"

# Dedupe merge
code=$(req POST "/api/master/customers/dedupe-merge" "{\"source_customer_id\":\"$C1_ID\",\"target_customer_id\":\"$C2_ID\"}" "$ADM_TK" "$TMP_DIR/dedupe_merge.json")
assert_code "$code" "200" "dedupe merge"
assert_file_contains "$TMP_DIR/dedupe_merge.json" "\"reason\"" "merge reason returned"

# Verify immutable log records the merge
code=$(req GET "/api/admin/immutable-logs?limit=50" "" "$ADM_TK" "$TMP_DIR/immut_logs.json")
assert_code "$code" "200" "read immutable logs"
assert_file_contains "$TMP_DIR/immut_logs.json" "\"event_type\":\"merge\"" "immutable log contains merge event"
assert_file_contains "$TMP_DIR/immut_logs.json" "\"entity_type\":\"customer\"" "immutable log entity is customer"

# CSV import
cat > "$TMP_DIR/import_test.csv" << 'CSVEOF'
full_name,email,phone,address,notes
"CSV Customer One","csv-one@e2e.test","(555) 200-3001","1 Main St",""
"CSV Customer Two","csv-two@e2e.test","(555) 200-3002","2 Main St","notes here"
CSVEOF
code=$(req POST "/api/master/customers/import-csv" "{\"file_path\":\"$TMP_DIR/import_test.csv\"}" "$ADM_TK" "$TMP_DIR/csv_import.json")
assert_code "$code" "200" "csv import"
CREATED=$(json_get "$TMP_DIR/csv_import.json" "created")
if [[ "$CREATED" -lt 1 ]]; then echo "[e2e] FAIL: CSV import created 0 customers"; exit 1; fi
echo "[e2e] PASS: csv import created $CREATED customer(s)"

# CSV export
code=$(req POST "/api/master/customers/export-csv" "{\"file_path\":\"$TMP_DIR/customers_exported.csv\"}" "$ADM_TK" "$TMP_DIR/csv_export.json")
assert_code "$code" "200" "csv export"
assert_file_contains "$TMP_DIR/customers_exported.csv" "marketing_email_consent" "export includes email consent column"
assert_file_contains "$TMP_DIR/customers_exported.csv" "marketing_sms_consent" "export includes sms consent column"

# ================================================================
# 5. FULL COMMERCE FLOW (inventory -> cart -> preview -> place)
# ================================================================
echo ""
echo "--- 5. Full Commerce Flow ---"

# Inventory setup
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5000}" "$ADM_TK" "$TMP_DIR/inv.json")
assert_code "$code" "201" "set inventory"

# Shipping rate
code=$(req POST "/api/master/shipping-rates" "{\"store_code\":\"MAIN\",\"method\":\"pickup\",\"min_subtotal_cents\":0,\"rate_cents\":0}" "$ADM_TK" "$TMP_DIR/ship.json")
assert_code "$code" "201" "set shipping rate"

# Add to cart
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":1}" "$ADM_TK" "$TMP_DIR/cart_add.json")
assert_code "$code" "201" "add to cart"

# Checkout preview
code=$(req GET "/api/commerce/checkout/preview?store_code=MAIN" "" "$ADM_TK" "$TMP_DIR/preview.json")
assert_code "$code" "200" "checkout preview"
assert_file_contains "$TMP_DIR/preview.json" "subtotal_cents" "preview has subtotal"
assert_file_contains "$TMP_DIR/preview.json" "purchase_limit" "preview shows purchase limit"
assert_file_contains "$TMP_DIR/preview.json" "purchase_limit_status" "preview shows limit status"

# Place order
code=$(req POST "/api/commerce/checkout/place" "{\"store_code\":\"MAIN\",\"delivery_method\":\"pickup\"}" "$ADM_TK" "$TMP_DIR/order.json")
assert_code "$code" "200" "place order"
assert_file_contains "$TMP_DIR/order.json" "total_cents" "order has total"
assert_file_contains "$TMP_DIR/order.json" "subtotal_cents" "order has subtotal"
assert_file_contains "$TMP_DIR/order.json" "shipping_cents" "order has shipping"
assert_file_contains "$TMP_DIR/order.json" "tax_cents" "order has tax"

# ================================================================
# 6. CART MERGE (cross-store)
# ================================================================
echo ""
echo "--- 6. Cart Merge ---"

code=$(req POST "/api/master/inventory" "{\"store_code\":\"EAST\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5000}" "$ADM_TK" "$TMP_DIR/inv_east.json")
assert_code "$code" "201" "set EAST inventory"
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":3}" "$ADM_TK" "$TMP_DIR/cart_main2.json")
assert_code "$code" "201" "add MAIN cart"
code=$(req POST "/api/commerce/carts/EAST/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":2}" "$ADM_TK" "$TMP_DIR/cart_east2.json")
assert_code "$code" "201" "add EAST cart"
code=$(req POST "/api/commerce/carts/merge" "{\"from_store_code\":\"EAST\",\"to_store_code\":\"MAIN\"}" "$ADM_TK" "$TMP_DIR/merge.json")
assert_code "$code" "200" "cart merge cross-store"
assert_file_contains "$TMP_DIR/merge.json" "items" "merge returns items"
MERGED_QTY=$(json_get "$TMP_DIR/merge.json" "items.0.quantity")
if [[ "$MERGED_QTY" -gt 10 ]]; then echo "[e2e] FAIL: merged qty $MERGED_QTY exceeds cap 10"; exit 1; fi
echo "[e2e] PASS: merged qty $MERGED_QTY within cap"

# ================================================================
# 7. PROMOTION STACKING RULES
# ================================================================
echo ""
echo "--- 7. Promotion Stacking ---"

code=$(req POST "/api/master/promotions" "{\"promo_type\":\"threshold\",\"discount_percent\":10,\"threshold_cents\":10000}" "$ADM_TK" "$TMP_DIR/promo_thresh.json")
assert_code "$code" "201" "create threshold promo"
code=$(req POST "/api/master/promotions" "{\"promo_type\":\"coupon\",\"code\":\"E2ECOUPON\",\"discount_percent\":5}" "$ADM_TK" "$TMP_DIR/promo_coupon.json")
assert_code "$code" "201" "create coupon promo"

# Restock
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$SKU_ID\",\"stock_qty\":50,\"unit_price_cents\":5000}" "$ADM_TK" "$TMP_DIR/inv_restock.json")
assert_code "$code" "201" "restock"
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":3}" "$ADM_TK" "$TMP_DIR/cart_promo.json")
assert_code "$code" "201" "add cart for promo test"

# Threshold + coupon should be blocked
code=$(req GET "/api/commerce/checkout/preview?store_code=MAIN&coupon_code=E2ECOUPON&member_pricing=false" "" "$ADM_TK" "$TMP_DIR/preview_block.json")
assert_code "$code" "400" "threshold + coupon blocked"
assert_file_contains "$TMP_DIR/preview_block.json" "threshold discounts must not combine with coupons" "threshold block message"

# Member + coupon should be allowed (below threshold)
code=$(req POST "/api/commerce/carts/MAIN/items" "{\"sku_id\":\"$SKU_ID\",\"quantity\":1}" "$ADM_TK" "$TMP_DIR/cart_memcoup.json")
assert_code "$code" "201" "set 1-item cart for member+coupon"
code=$(req GET "/api/commerce/checkout/preview?store_code=MAIN&coupon_code=E2ECOUPON&member_pricing=true" "" "$ADM_TK" "$TMP_DIR/preview_memcoup.json")
assert_code "$code" "200" "member + coupon allowed"

# ================================================================
# 8. CODING RULE EXPIRY
# ================================================================
echo ""
echo "--- 8. Coding Rule Expiry ---"
code=$(req POST "/api/master/sku-rules" "{\"name\":\"Expiry Rule E2E\",\"template\":\"EXP-####\",\"effective_start_at\":\"2026-01-01T00:00:00Z\",\"effective_end_at\":\"2026-12-31T00:00:00Z\"}" "$ADM_TK" "$TMP_DIR/rule_exp.json")
assert_code "$code" "201" "create rule with expiry"
assert_file_contains "$TMP_DIR/rule_exp.json" "effective_end_at" "rule has expiry date"

# ================================================================
# 9. DELETION REQUEST + 7-DAY RESTORE WINDOW
# ================================================================
echo ""
echo "--- 9. Deletion & Restore Window ---"

# Create a forum section and thread for deletion testing
code=$(req POST "/api/forum/sections" "{\"name\":\"Restore Test Section\",\"description\":\"e2e\"}" "$ADM_TK" "$TMP_DIR/del_section.json")
assert_code "$code" "201" "create forum section for deletion test"
DEL_SECTION_ID=$(json_get "$TMP_DIR/del_section.json" "id")

code=$(req POST "/api/forum/threads" "{\"section_id\":\"$DEL_SECTION_ID\",\"title\":\"Thread To Delete\",\"body\":\"This will be deleted and restored.\"}" "$ADM_TK" "$TMP_DIR/del_thread.json")
assert_code "$code" "201" "create thread for deletion"
DEL_THREAD_ID=$(json_get "$TMP_DIR/del_thread.json" "id")

# Request deletion (sets archived+locked, creates deletion request with 7-day window)
code=$(req POST "/api/forum/thread/$DEL_THREAD_ID/delete-request" "{}" "$ADM_TK" "$TMP_DIR/del_req.json")
assert_code "$code" "200" "request deletion of thread"
DEL_REQ_ID=$(json_get "$TMP_DIR/del_req.json" "id")
assert_file_contains "$TMP_DIR/del_req.json" "restore_deadline" "deletion request has restore deadline"

# List pending deletion requests
code=$(req GET "/api/forum/deletion-requests" "" "$ADM_TK" "$TMP_DIR/del_list.json")
assert_code "$code" "200" "list pending deletion requests"
assert_file_contains "$TMP_DIR/del_list.json" "$DEL_REQ_ID" "pending list contains our deletion request"

# Restore within the 7-day window
code=$(req POST "/api/forum/deletion/$DEL_REQ_ID/restore" "{}" "$ADM_TK" "$TMP_DIR/restore.json")
assert_code "$code" "200" "restore deleted thread"
assert_file_contains "$TMP_DIR/restore.json" "success" "restore returns success"

# Verify restore is recorded in immutable log
code=$(req GET "/api/admin/immutable-logs?limit=10" "" "$ADM_TK" "$TMP_DIR/immut_restore.json")
assert_code "$code" "200" "read immutable logs after restore"
assert_file_contains "$TMP_DIR/immut_restore.json" "\"event_type\":\"restore\"" "immutable log contains restore event"

# Verify already-restored request cannot be restored again
code=$(req POST "/api/forum/deletion/$DEL_REQ_ID/restore" "{}" "$ADM_TK" "$TMP_DIR/restore_dup.json")
assert_code "$code" "400" "double restore blocked"
assert_file_contains "$TMP_DIR/restore_dup.json" "already restored" "double restore error message"

echo ""
echo "========================================="
echo "[e2e] ALL E2E INTEGRATION CHECKS PASSED."
echo "========================================="
