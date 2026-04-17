#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# coverage_extended.sh — Tests for the 28 endpoints not covered by
# critical_invariants.sh or integration_e2e.sh.
# ============================================================================

BASE_URL="${BASE_URL:-https://localhost:3443}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "[ext] ADMIN_PASSWORD env is required"
  exit 1
fi

TMP_DIR="/tmp/task3_api_ext"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

json_get() {
  local file="$1"
  local path="$2"
  node -e "const fs=require('fs');const o=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const p=process.argv[2].split('.');let c=o;for(const k of p){if(!k)continue;c=c?.[k]}if(c===undefined||c===null){process.exit(2)}process.stdout.write(String(c));" "$file" "$path"
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
  if [[ "$got" != "$expect" ]]; then
    echo "[ext] FAIL: $msg expected $expect got $got"
    cat "${5:-/dev/null}" 2>/dev/null || true
    exit 1
  fi
  echo "[ext] PASS: $msg"
}

assert_file_contains() {
  local file="$1" pattern="$2" msg="$3"
  if ! grep -q "$pattern" "$file"; then
    echo "[ext] FAIL: $msg"
    cat "$file"
    exit 1
  fi
  echo "[ext] PASS: $msg"
}

assert_equals() {
  local got="$1" expect="$2" msg="$3"
  if [[ "$got" != "$expect" ]]; then
    echo "[ext] FAIL: $msg expected '$expect' got '$got'"
    exit 1
  fi
  echo "[ext] PASS: $msg"
}

echo "=== Extended Coverage Tests ==="
echo ""

# ================================================================
# 1. AUTH: /api/auth/me and /api/auth/logout
# ================================================================
echo "--- 1. Auth Session Endpoints ---"

code=$(req POST "/api/auth/login" "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/admin_login.json")
assert_code "$code" "200" "admin login"
ADMIN_TOKEN=$(json_get "$TMP_DIR/admin_login.json" "token")

code=$(req POST "/api/auth/login" "{\"username\":\"host\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/host_login.json")
assert_code "$code" "200" "host login"
HOST_TOKEN=$(json_get "$TMP_DIR/host_login.json" "token")
HOST_USER_ID=$(json_get "$TMP_DIR/host_login.json" "user.id")

code=$(req POST "/api/auth/login" "{\"username\":\"member\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/member_login.json")
assert_code "$code" "200" "member login"
MEMBER_TOKEN=$(json_get "$TMP_DIR/member_login.json" "token")

# GET /api/auth/me — returns current user object
code=$(req GET "/api/auth/me" "" "$ADMIN_TOKEN" "$TMP_DIR/auth_me.json")
assert_code "$code" "200" "GET /api/auth/me returns 200"
assert_file_contains "$TMP_DIR/auth_me.json" "\"username\":\"admin\"" "auth/me returns admin username"
assert_file_contains "$TMP_DIR/auth_me.json" "\"role\":\"Administrator\"" "auth/me returns admin role"

# GET /api/auth/me without token → 401
code=$(req GET "/api/auth/me" "" "" "$TMP_DIR/auth_me_notoken.json")
assert_code "$code" "401" "GET /api/auth/me without token returns 401"

# POST /api/auth/logout — create a disposable session and revoke it
code=$(req POST "/api/auth/login" "{\"username\":\"member\",\"password\":\"$ADMIN_PASSWORD\"}" "" "$TMP_DIR/logout_session.json")
assert_code "$code" "200" "login for logout test"
LOGOUT_TOKEN=$(json_get "$TMP_DIR/logout_session.json" "token")

code=$(req POST "/api/auth/logout" "" "$LOGOUT_TOKEN" "$TMP_DIR/logout.json")
assert_code "$code" "200" "POST /api/auth/logout returns 200"
assert_file_contains "$TMP_DIR/logout.json" "\"success\":true" "logout returns success"

# Verify revoked session cannot be reused
code=$(req GET "/api/auth/me" "" "$LOGOUT_TOKEN" "$TMP_DIR/logout_verify.json")
assert_code "$code" "401" "revoked session returns 401"

# ================================================================
# 2. MASTER DATA: SKU Rules, SKU CRUD reads, sub-resources
# ================================================================
echo ""
echo "--- 2. Master Data Read Endpoints ---"

# GET /api/master/sku-rules
code=$(req GET "/api/master/sku-rules" "" "$ADMIN_TOKEN" "$TMP_DIR/sku_rules.json")
assert_code "$code" "200" "GET /api/master/sku-rules"
assert_file_contains "$TMP_DIR/sku_rules.json" "\"items\"" "sku-rules returns items array"

# GET /api/master/skus (admin success path)
code=$(req GET "/api/master/skus" "" "$ADMIN_TOKEN" "$TMP_DIR/skus_list.json")
assert_code "$code" "200" "GET /api/master/skus as admin"
assert_file_contains "$TMP_DIR/skus_list.json" "\"items\"" "skus list returns items array"

# Create a test SKU for PATCH/DELETE and sub-resource reads
expiry=$(date -u +"%m/%d/%Y")
code=$(req POST "/api/master/skus" "{\"name\":\"ExtTest SKU\",\"description\":\"for extended tests\",\"expiry_date\":\"$expiry\"}" "$ADMIN_TOKEN" "$TMP_DIR/ext_sku.json")
assert_code "$code" "201" "create test SKU"
EXT_SKU_ID=$(json_get "$TMP_DIR/ext_sku.json" "id")

# PATCH /api/master/skus/:id
code=$(req PATCH "/api/master/skus/$EXT_SKU_ID" "{\"name\":\"ExtTest SKU Renamed\",\"description\":\"updated\"}" "$ADMIN_TOKEN" "$TMP_DIR/sku_patch.json")
assert_code "$code" "200" "PATCH /api/master/skus/:id"
patched_name=$(json_get "$TMP_DIR/sku_patch.json" "name")
assert_equals "$patched_name" "ExtTest SKU Renamed" "SKU name updated"

# Add sub-resources for read tests
code=$(req POST "/api/master/skus/$EXT_SKU_ID/barcodes" "{\"barcode\":\"EXT-BC-001\",\"symbology\":\"EAN-13\",\"is_primary\":true}" "$ADMIN_TOKEN" "$TMP_DIR/ext_bc.json")
assert_code "$code" "201" "add barcode for read test"

code=$(req POST "/api/master/skus/$EXT_SKU_ID/lots" "{\"lot_number\":\"LOT-EXT-001\",\"batch_attributes\":{\"color\":\"blue\"}}" "$ADMIN_TOKEN" "$TMP_DIR/ext_lot.json")
assert_code "$code" "201" "add lot for read test"

code=$(req POST "/api/master/skus/$EXT_SKU_ID/packaging" "{\"package_type\":\"box\",\"units_per_package\":6,\"weight_grams\":250}" "$ADMIN_TOKEN" "$TMP_DIR/ext_pack.json")
assert_code "$code" "201" "add packaging for read test"

# GET /api/master/skus/:id/barcodes
code=$(req GET "/api/master/skus/$EXT_SKU_ID/barcodes" "" "$ADMIN_TOKEN" "$TMP_DIR/barcodes_list.json")
assert_code "$code" "200" "GET /api/master/skus/:id/barcodes"
assert_file_contains "$TMP_DIR/barcodes_list.json" "EXT-BC-001" "barcodes list contains created barcode"

# GET /api/master/skus/:id/lots
code=$(req GET "/api/master/skus/$EXT_SKU_ID/lots" "" "$ADMIN_TOKEN" "$TMP_DIR/lots_list.json")
assert_code "$code" "200" "GET /api/master/skus/:id/lots"
assert_file_contains "$TMP_DIR/lots_list.json" "LOT-EXT-001" "lots list contains created lot"

# GET /api/master/skus/:id/packaging
code=$(req GET "/api/master/skus/$EXT_SKU_ID/packaging" "" "$ADMIN_TOKEN" "$TMP_DIR/packaging_list.json")
assert_code "$code" "200" "GET /api/master/skus/:id/packaging"
assert_file_contains "$TMP_DIR/packaging_list.json" "\"package_type\":\"box\"" "packaging list contains created spec"

# DELETE /api/master/skus/:id
code=$(req DELETE "/api/master/skus/$EXT_SKU_ID" "" "$ADMIN_TOKEN" "$TMP_DIR/sku_delete.json")
assert_code "$code" "200" "DELETE /api/master/skus/:id"
assert_file_contains "$TMP_DIR/sku_delete.json" "\"success\":true" "SKU delete returns success"

# GET /api/master/bins
code=$(req GET "/api/master/bins" "" "$ADMIN_TOKEN" "$TMP_DIR/bins_list.json")
assert_code "$code" "200" "GET /api/master/bins"
assert_file_contains "$TMP_DIR/bins_list.json" "\"items\"" "bins list returns items array"

# GET /api/master/carriers
code=$(req GET "/api/master/carriers" "" "$ADMIN_TOKEN" "$TMP_DIR/carriers_list.json")
assert_code "$code" "200" "GET /api/master/carriers"
assert_file_contains "$TMP_DIR/carriers_list.json" "\"items\"" "carriers list returns items array"

# GET /api/master/stores
code=$(req GET "/api/master/stores" "" "$ADMIN_TOKEN" "$TMP_DIR/stores_list.json")
assert_code "$code" "200" "GET /api/master/stores"
assert_file_contains "$TMP_DIR/stores_list.json" "\"items\"" "stores list returns items array"

# ================================================================
# 3. CUSTOMER DELETE-REQUEST, RESTORE, RETENTION
# ================================================================
echo ""
echo "--- 3. Customer Deletion Lifecycle ---"

code=$(req POST "/api/master/customers" "{\"full_name\":\"Delete Test Customer\",\"email\":\"del-test@ext.test\",\"phone\":\"(555) 999-0001\"}" "$ADMIN_TOKEN" "$TMP_DIR/del_customer.json")
assert_code "$code" "201" "create customer for deletion test"
DEL_CUST_ID=$(json_get "$TMP_DIR/del_customer.json" "id")

# POST /api/master/customers/:id/delete-request
code=$(req POST "/api/master/customers/$DEL_CUST_ID/delete-request" "{}" "$ADMIN_TOKEN" "$TMP_DIR/cust_del_req.json")
assert_code "$code" "200" "POST /api/master/customers/:id/delete-request"
CUST_DEL_REQ_ID=$(json_get "$TMP_DIR/cust_del_req.json" "id")
assert_file_contains "$TMP_DIR/cust_del_req.json" "restore_deadline" "customer deletion has restore deadline"

# POST /api/master/customers/deletion/:id/restore
code=$(req POST "/api/master/customers/deletion/$CUST_DEL_REQ_ID/restore" "{}" "$ADMIN_TOKEN" "$TMP_DIR/cust_restore.json")
assert_code "$code" "200" "POST /api/master/customers/deletion/:id/restore"
assert_file_contains "$TMP_DIR/cust_restore.json" "\"success\":true" "customer restore returns success"

# POST /api/master/customers/retention/run
code=$(req POST "/api/master/customers/retention/run" "{}" "$ADMIN_TOKEN" "$TMP_DIR/cust_retention.json")
assert_code "$code" "200" "POST /api/master/customers/retention/run"
assert_file_contains "$TMP_DIR/cust_retention.json" "purged_deleted_content" "retention run returns purge count"

# ================================================================
# 4. COMMERCE: Cart GET
# ================================================================
echo ""
echo "--- 4. Commerce Cart Read ---"

# GET /api/commerce/carts/:storeCode
code=$(req GET "/api/commerce/carts/MAIN" "" "$ADMIN_TOKEN" "$TMP_DIR/cart_get.json")
assert_code "$code" "200" "GET /api/commerce/carts/:storeCode"
assert_file_contains "$TMP_DIR/cart_get.json" "\"quantity_cap\"" "cart GET returns quantity_cap"

# ================================================================
# 5. SCORING: Ledger
# ================================================================
echo ""
echo "--- 5. Scoring Ledger ---"

# Create a scoring entry so the ledger has data
code=$(req POST "/api/master/inventory" "{\"store_code\":\"MAIN\",\"sku_id\":\"$(json_get "$TMP_DIR/admin_login.json" "user.id")\",\"stock_qty\":1,\"unit_price_cents\":100}" "$ADMIN_TOKEN" "$TMP_DIR/ignore.json" 2>/dev/null || true)

code=$(req POST "/api/scoring/calculate" "{\"subject_id\":\"ext-test-subject\",\"round_key\":\"r1\",\"store_code\":\"MAIN\",\"strategy\":\"drop\",\"metrics\":{\"a\":80},\"weights\":{\"a\":1.0},\"previous_round_scores\":[]}" "$ADMIN_TOKEN" "$TMP_DIR/score_ext.json")
assert_code "$code" "201" "create scoring entry for ledger test"

# GET /api/scoring/ledger/:subjectId
code=$(req GET "/api/scoring/ledger/ext-test-subject" "" "$ADMIN_TOKEN" "$TMP_DIR/ledger.json")
assert_code "$code" "200" "GET /api/scoring/ledger/:subjectId"
assert_file_contains "$TMP_DIR/ledger.json" "\"items\"" "ledger returns items array"
assert_file_contains "$TMP_DIR/ledger.json" "ext-test-subject" "ledger contains the test subject"

# Scoring ledger IDOR: member cannot access another user's ledger
code=$(req GET "/api/scoring/ledger/ext-test-subject" "" "$MEMBER_TOKEN" "$TMP_DIR/ledger_idor.json")
assert_code "$code" "403" "member blocked from other user's scoring ledger"

# ================================================================
# 6. SCRIPTS: Create and Update Status
# ================================================================
echo ""
echo "--- 6. Scripts CRUD ---"

# POST /api/scripts
code=$(req POST "/api/scripts" "{\"title\":\"Ext Test Script\",\"description\":\"Extended test\",\"difficulty\":3,\"duration_minutes\":60,\"min_party_size\":2,\"max_party_size\":6,\"required_props\":[],\"status\":\"active\",\"tags\":[\"test\"]}" "$ADMIN_TOKEN" "$TMP_DIR/script_create.json")
assert_code "$code" "201" "POST /api/scripts"
EXT_SCRIPT_ID=$(json_get "$TMP_DIR/script_create.json" "id")
assert_file_contains "$TMP_DIR/script_create.json" "\"title\":\"Ext Test Script\"" "script created with correct title"

# PATCH /api/scripts/:id (status update)
code=$(req PATCH "/api/scripts/$EXT_SCRIPT_ID" "{\"status\":\"paused\"}" "$ADMIN_TOKEN" "$TMP_DIR/script_patch.json")
assert_code "$code" "200" "PATCH /api/scripts/:id"
patched_status=$(json_get "$TMP_DIR/script_patch.json" "status")
assert_equals "$patched_status" "paused" "script status updated to paused"

# RBAC: member cannot create scripts
code=$(req POST "/api/scripts" "{\"title\":\"Blocked\",\"description\":\"x\",\"difficulty\":1,\"duration_minutes\":30,\"min_party_size\":1,\"max_party_size\":2,\"required_props\":[],\"status\":\"active\",\"tags\":[]}" "$MEMBER_TOKEN" "$TMP_DIR/script_member.json")
assert_code "$code" "403" "member blocked from creating scripts"

# ================================================================
# 7. RESOURCES: Rooms, Business Hours, Host Schedules, Availability
# ================================================================
echo ""
echo "--- 7. Resources Management ---"

# POST /api/resources/rooms
code=$(req POST "/api/resources/rooms" "{\"name\":\"Ext Test Room\",\"room_type\":\"room\",\"capacity\":8}" "$ADMIN_TOKEN" "$TMP_DIR/room_create.json")
assert_code "$code" "201" "POST /api/resources/rooms"
EXT_ROOM_ID=$(json_get "$TMP_DIR/room_create.json" "id")
assert_file_contains "$TMP_DIR/room_create.json" "\"name\":\"Ext Test Room\"" "room created with correct name"

# GET /api/resources/business-hours
code=$(req GET "/api/resources/business-hours" "" "$ADMIN_TOKEN" "$TMP_DIR/biz_hours.json")
assert_code "$code" "200" "GET /api/resources/business-hours"
assert_file_contains "$TMP_DIR/biz_hours.json" "\"items\"" "business-hours returns items array"

# PUT /api/resources/business-hours
code=$(req PUT "/api/resources/business-hours" "{\"items\":[{\"weekday\":2,\"open_time\":\"08:00\",\"close_time\":\"20:00\",\"is_closed\":false}]}" "$ADMIN_TOKEN" "$TMP_DIR/biz_hours_put.json")
assert_code "$code" "200" "PUT /api/resources/business-hours"
assert_file_contains "$TMP_DIR/biz_hours_put.json" "\"success\":true" "business-hours upsert returns success"

# GET /api/resources/host-schedules
code=$(req GET "/api/resources/host-schedules" "" "$ADMIN_TOKEN" "$TMP_DIR/host_schedules.json")
assert_code "$code" "200" "GET /api/resources/host-schedules"
assert_file_contains "$TMP_DIR/host_schedules.json" "\"items\"" "host-schedules returns items array"

# GET /api/resources/availability
code=$(req GET "/api/resources/availability" "" "$ADMIN_TOKEN" "$TMP_DIR/availability.json")
assert_code "$code" "200" "GET /api/resources/availability"
assert_file_contains "$TMP_DIR/availability.json" "\"rooms\"" "availability returns rooms"
assert_file_contains "$TMP_DIR/availability.json" "\"business_hours\"" "availability returns business_hours"
assert_file_contains "$TMP_DIR/availability.json" "\"host_schedules\"" "availability returns host_schedules"

# ================================================================
# 8. BOOKINGS: Status Update
# ================================================================
echo ""
echo "--- 8. Booking Status Update ---"

# Create a booking first (need valid script, room, business hours, host schedule)
SCRIPT_ID=$(json_get "$(req GET "/api/scripts" "" "$ADMIN_TOKEN" "$TMP_DIR/scripts_for_bk.json" && echo "$TMP_DIR/scripts_for_bk.json")" "" 2>/dev/null || true)
code=$(req GET "/api/scripts" "" "$ADMIN_TOKEN" "$TMP_DIR/scripts_for_bk.json")
assert_code "$code" "200" "list scripts for booking"
BK_SCRIPT_ID=$(json_get "$TMP_DIR/scripts_for_bk.json" "items.0.id")

code=$(req GET "/api/resources/rooms" "" "$ADMIN_TOKEN" "$TMP_DIR/rooms_for_bk.json")
assert_code "$code" "200" "list rooms for booking"
BK_ROOM_ID=$(json_get "$TMP_DIR/rooms_for_bk.json" "items.0.id")

# Set up Tuesday business hours and host schedule for the booking
code=$(req PUT "/api/resources/business-hours" "{\"items\":[{\"weekday\":2,\"open_time\":\"08:00\",\"close_time\":\"22:00\",\"is_closed\":false}]}" "$ADMIN_TOKEN" "$TMP_DIR/bk_hours.json")
assert_code "$code" "200" "set business hours for booking test"

code=$(req POST "/api/resources/host-schedules" "{\"host_user_id\":\"$HOST_USER_ID\",\"room_id\":\"$BK_ROOM_ID\",\"weekday\":2,\"start_time\":\"08:00\",\"end_time\":\"22:00\",\"is_available\":true}" "$ADMIN_TOKEN" "$TMP_DIR/bk_schedule.json")
assert_code "$code" "201" "set host schedule for booking test"

# Create a booking on a Tuesday
code=$(req POST "/api/bookings" "{\"script_id\":\"$BK_SCRIPT_ID\",\"room_id\":\"$BK_ROOM_ID\",\"customer_name\":\"Status Test\",\"party_size\":2,\"start_at\":\"2026-06-02T10:00:00Z\",\"end_at\":\"2026-06-02T11:00:00Z\"}" "$ADMIN_TOKEN" "$TMP_DIR/bk_for_status.json")
assert_code "$code" "201" "create booking for status test"
BK_ID=$(json_get "$TMP_DIR/bk_for_status.json" "id")

# PATCH /api/bookings/:id/status
code=$(req PATCH "/api/bookings/$BK_ID/status" "{\"status\":\"confirmed\"}" "$ADMIN_TOKEN" "$TMP_DIR/bk_status.json")
assert_code "$code" "200" "PATCH /api/bookings/:id/status to confirmed"
bk_status=$(json_get "$TMP_DIR/bk_status.json" "status")
assert_equals "$bk_status" "confirmed" "booking status updated to confirmed"

code=$(req PATCH "/api/bookings/$BK_ID/status" "{\"status\":\"completed\"}" "$ADMIN_TOKEN" "$TMP_DIR/bk_status2.json")
assert_code "$code" "200" "PATCH /api/bookings/:id/status to completed"
bk_status2=$(json_get "$TMP_DIR/bk_status2.json" "status")
assert_equals "$bk_status2" "completed" "booking status updated to completed"

# RBAC: member cannot update booking status
code=$(req PATCH "/api/bookings/$BK_ID/status" "{\"status\":\"cancelled\"}" "$MEMBER_TOKEN" "$TMP_DIR/bk_status_member.json")
assert_code "$code" "403" "member blocked from updating booking status"

# ================================================================
# 9. FORUM: Thread listing, Posts CRUD, Retention
# ================================================================
echo ""
echo "--- 9. Forum Thread/Post Endpoints ---"

# Create a section and thread for testing
code=$(req POST "/api/forum/sections" "{\"name\":\"Ext Coverage Section\",\"description\":\"for extended tests\"}" "$ADMIN_TOKEN" "$TMP_DIR/ext_section.json")
assert_code "$code" "201" "create section for forum tests"
EXT_SECTION_ID=$(json_get "$TMP_DIR/ext_section.json" "id")

code=$(req POST "/api/forum/threads" "{\"section_id\":\"$EXT_SECTION_ID\",\"title\":\"Ext Test Thread\",\"body\":\"Testing thread listing\"}" "$ADMIN_TOKEN" "$TMP_DIR/ext_thread.json")
assert_code "$code" "201" "create thread for listing test"
EXT_THREAD_ID=$(json_get "$TMP_DIR/ext_thread.json" "id")

# GET /api/forum/threads?section_id=...
code=$(req GET "/api/forum/threads?section_id=$EXT_SECTION_ID" "" "$ADMIN_TOKEN" "$TMP_DIR/threads_list.json")
assert_code "$code" "200" "GET /api/forum/threads by section"
assert_file_contains "$TMP_DIR/threads_list.json" "\"Ext Test Thread\"" "thread listing contains created thread"

# POST /api/forum/posts — create a top-level post
code=$(req POST "/api/forum/posts" "{\"thread_id\":\"$EXT_THREAD_ID\",\"body\":\"First reply in ext test\"}" "$ADMIN_TOKEN" "$TMP_DIR/post_create.json")
assert_code "$code" "201" "POST /api/forum/posts (top-level)"
EXT_POST_ID=$(json_get "$TMP_DIR/post_create.json" "id")
assert_file_contains "$TMP_DIR/post_create.json" "\"body\":\"First reply in ext test\"" "post body stored correctly"

# POST /api/forum/posts — create a reply to the post
code=$(req POST "/api/forum/posts" "{\"thread_id\":\"$EXT_THREAD_ID\",\"parent_post_id\":\"$EXT_POST_ID\",\"body\":\"Nested reply\"}" "$MEMBER_TOKEN" "$TMP_DIR/post_reply.json")
assert_code "$code" "201" "POST /api/forum/posts (nested reply)"
assert_file_contains "$TMP_DIR/post_reply.json" "\"parent_post_id\":\"$EXT_POST_ID\"" "nested reply has correct parent"

# GET /api/forum/threads/:id/posts
code=$(req GET "/api/forum/threads/$EXT_THREAD_ID/posts" "" "$ADMIN_TOKEN" "$TMP_DIR/posts_list.json")
assert_code "$code" "200" "GET /api/forum/threads/:id/posts"
assert_file_contains "$TMP_DIR/posts_list.json" "\"First reply in ext test\"" "posts list contains top-level post"
assert_file_contains "$TMP_DIR/posts_list.json" "\"Nested reply\"" "posts list contains nested reply"

# POST /api/forum/retention/run
code=$(req POST "/api/forum/retention/run" "{}" "$ADMIN_TOKEN" "$TMP_DIR/forum_retention.json")
assert_code "$code" "200" "POST /api/forum/retention/run"
assert_file_contains "$TMP_DIR/forum_retention.json" "purged_deleted_content" "forum retention returns purge count"

echo ""
echo "============================================="
echo "[ext] ALL EXTENDED COVERAGE CHECKS PASSED."
echo "============================================="
