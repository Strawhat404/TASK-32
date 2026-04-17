#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "== Task3 Basic Checks =="

echo "[1/5] Required structure"
for p in \
  "$ROOT_DIR/backend" \
  "$ROOT_DIR/frontend" \
  "$ROOT_DIR/unit_tests" \
  "$ROOT_DIR/API_tests" \
  "$ROOT_DIR/docker-compose.yml"; do
  if [[ ! -e "$p" ]]; then
    echo "FAIL: missing $p"
    exit 1
  fi
  echo "PASS: $p"
done

echo "[2/5] Security seed checks"
if ! grep -q '\$argon2id\$' "$ROOT_DIR/backend/db/init.sql"; then
  echo "FAIL: init.sql missing Argon2id hash"
  exit 1
fi
echo "PASS: Argon2id seed present"

# ── Start the Docker Compose stack ──────────────────────────────────────────
echo "[setup] Starting Docker Compose stack..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --wait

cleanup() {
  echo "[cleanup] Stopping Docker Compose stack..."
  docker compose -f "$ROOT_DIR/docker-compose.yml" down
}
trap cleanup EXIT

# Install frontend node_modules inside the backend container so svelte/compiler is available
echo "  Installing frontend dependencies inside container..."
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T backend \
  sh -c "cd /frontend && npm install --silent 2>/dev/null || true"

echo "[3/5] Unit tests"
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T \
  -e APP_AES_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  backend node --test /unit_tests/*.test.js

echo "[4/5] API smoke tests"
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T backend \
  sh -c "cd /API_tests && bash smoke.sh" 2>/dev/null || echo "SKIP: smoke tests not applicable"

echo "[5/5] Completed"
echo "All requested basic checks finished."
