#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://localhost:3443}"

echo "[smoke] Checking health endpoint at ${BASE_URL}/api/health"
HEALTH_STATUS=$(curl -sk -o /tmp/task3_health.json -w "%{http_code}" "${BASE_URL}/api/health")
if [[ "${HEALTH_STATUS}" != "200" ]]; then
  echo "[smoke] FAIL: expected 200 from /api/health, got ${HEALTH_STATUS}"
  cat /tmp/task3_health.json || true
  exit 1
fi

echo "[smoke] PASS: health endpoint reachable"

if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  echo "[smoke] Attempting login for admin using ADMIN_PASSWORD env"
  LOGIN_STATUS=$(curl -sk -o /tmp/task3_login.json -w "%{http_code}" \
    -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASSWORD}\"}")

  if [[ "${LOGIN_STATUS}" != "200" ]]; then
    echo "[smoke] FAIL: login expected 200, got ${LOGIN_STATUS}"
    cat /tmp/task3_login.json || true
    exit 1
  fi

  echo "[smoke] PASS: admin login endpoint reachable"
else
  echo "[smoke] SKIP: ADMIN_PASSWORD not provided; login check skipped"
fi
