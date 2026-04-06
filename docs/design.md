# Design Overview

## Goals
- Fully offline runtime behavior.
- One-command startup from `repo/`.
- HTTPS termination at Caddy (`:3443`) with backend isolated to internal network.
- Prompt-critical invariants enforced server-side with automated tests.

## Runtime Topology
- `frontend` (Vite + Svelte + Tailwind) exposed on `https://localhost:5173`.
- `caddy` exposed on `https://localhost:3443`, reverse-proxying backend with mounted local certificate files from `repo/certs/server.crt` and `repo/certs/server.key`.
- `backend` (Fastify + PostgreSQL) not exposed to host ports.
- `db` (PostgreSQL 16) initialized by `backend/db/init.sql`.

## Security and Privacy
- Password verification via Argon2id.
- Login lockout: 5 failures -> 15-minute lock.
- Admin idle timeout: 20 minutes.
- RBAC enforced in backend route pre-handlers.
- AES-256-GCM encryption at rest for sensitive fields (`customers.address_encrypted`, `notes_encrypted`, order shipping address).
- Non-admin masked default customer view (phone last-4 format + masked sensitive fields).
- Immutable append-only logs (`immutable_logs`) for merge, checkout, DLP, and lifecycle actions.

## Master Data and Coding Rules
- CRUD APIs + UI workflows for:
  - SKUs, barcodes, batch/lot attributes, packaging specs.
  - Bin locations and carriers.
  - Customers with dedupe by exact email OR normalized phone.
- Data-driven coding rule engine:
  - Template support (e.g., `SKU-YYYYMM-####`).
  - Effective start/end dates.
  - Deterministic active rule selection by priority/start timestamp.
  - User expiry input `MM/DD/YYYY` normalized to 11:59 PM.

## Commerce Invariants
- Cart intelligence:
  - Cross-store and same-store cart merge.
  - Latest edit wins per line metadata.
  - Quantity sum with server cap.
- Promotions:
  - Threshold message and discount logic applied server-side.
  - Member + coupon allowed.
  - Threshold + coupon blocked server-side.
- Checkout guards:
  - Block if price delta > 2% from snapshot.
  - Block on insufficient stock.
  - Transactional row locking (`SELECT ... FOR UPDATE`) to avoid oversell races.
  - Per-customer daily purchase limit: max 2/day (preview + placement enforcement).
- Logistics + tax:
  - Pickup/local delivery/shipment from local rate tables.
  - Tax from jurisdiction rules tied to store.

## Scoring + Forum Lifecycle + DLP
- Scoring supports weighted aggregation, mapping rules, missing-value strategy (`drop`, `zero-fill`, `average-fill`), multi-round merge, and ledger writes.
- Forum lifecycle supports admin-restorable deletion window (7 days) plus 365-day purges for archived immutable logs and tombstone reports.
- DLP for offline CSV import: regex SSN scan + local malware-signature scan with reject/quarantine immutable logging.

## CSV and Testability
- Customer CSV import/export using local file paths, capped at 20 MB.
- `run_tests.sh` runs unit tests always and API invariants when stack is up and `ADMIN_PASSWORD` is supplied.

## Local TLS Certificate
- The repository contains a local certificate pair under `repo/certs/`:
  - `server.crt`
  - `server.key`
- Caddy mounts these files read-only and uses them for HTTPS on `https://localhost:3443`.
- To trust the certificate locally:
  - Linux desktop: import `repo/certs/server.crt` into the user or system trust store.
  - macOS: open Keychain Access, import `repo/certs/server.crt`, and mark it trusted.
  - Windows: import `repo/certs/server.crt` into `Trusted Root Certification Authorities`.
- Service URLs:
  - Frontend: `https://localhost:5173`
  - Backend health through Caddy: `https://localhost:3443/api/health`
  - Proxied API base: `https://localhost:3443`
