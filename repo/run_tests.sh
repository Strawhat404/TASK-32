#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
export APP_AES_KEY="${APP_AES_KEY:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"

echo "== Task3 Basic Checks =="

echo "[1/5] Required structure"
for path in \
  "$ROOT_DIR/backend" \
  "$ROOT_DIR/frontend" \
  "$ROOT_DIR/unit_tests" \
  "$ROOT_DIR/API_tests" \
  "$ROOT_DIR/docker-compose.yml"; do
  if [[ ! -e "$path" ]]; then
    echo "FAIL: missing $path"
    exit 1
  fi
  echo "PASS: $path"
done

echo "[2/5] Security seed checks"
if ! grep -q '\$argon2id\$' "$ROOT_DIR/backend/db/init.sql"; then
  echo "FAIL: init.sql missing Argon2id hash"
  exit 1
fi
echo "PASS: Argon2id seed present"

echo "[3/5] Unit tests"
node --test "$ROOT_DIR/unit_tests"/*.test.js

echo "[4/5] API smoke tests (requires running stack)"
if docker compose -f "$ROOT_DIR/docker-compose.yml" ps --status running 2>/dev/null | grep -q backend; then
  "$ROOT_DIR/API_tests/smoke.sh"
  if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
    "$ROOT_DIR/API_tests/critical_invariants.sh"
    "$ROOT_DIR/API_tests/integration_e2e.sh"
  else
    echo "SKIP: critical API invariants require ADMIN_PASSWORD env"
  fi
else
  echo "SKIP: stack not running. Start with: cd repo && docker compose up --build"
fi

echo "[5/5] Completed"
echo "All requested basic checks finished."
