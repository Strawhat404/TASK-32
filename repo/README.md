# VaultRoom Commerce & Experience

> **Project type:** `fullstack`

## Architecture

```
                         ┌───────────────────┐
                         │    Caddy (TLS)     │
                         │  :3443  /  :5173   │
                         └────┬─────────┬─────┘
                              │         │
              ┌───────────────▼──┐  ┌───▼──────────────┐
              │   Backend API    │  │     Frontend      │
              │  Node / Fastify  │  │   Svelte / Vite   │
              │    :3000         │  │     :5173         │
              └────────┬─────────┘  └──────────────────┘
                       │
              ┌────────▼─────────┐
              │   PostgreSQL 16  │
              │     :5432        │
              └──────────────────┘
```

**Data flow:** Browser &rarr; Caddy reverse proxy (TLS termination) &rarr; Backend API &rarr; PostgreSQL. The frontend is a Svelte SPA that communicates with the backend via `/api/*` endpoints proxied through Caddy or accessed directly at `:3000`.

**Key design decisions:**
- All sensitive customer fields (address, notes) are AES-256 encrypted at rest.
- Immutable audit logs record every mutation (create, update, delete, merge, checkout).
- 7-day soft-delete windows for both customers and forum content before permanent purge.
- Session tokens are SHA-256 hashed before storage; raw tokens never persist.

## Tech Stack

| Layer          | Technology              |
|----------------|-------------------------|
| Frontend       | Svelte, Vite, Tailwind  |
| Backend        | Node.js, Fastify        |
| Database       | PostgreSQL 16           |
| Reverse Proxy  | Caddy (TLS)             |
| Auth           | Argon2id + Bearer token |
| Encryption     | AES-256-CBC at rest     |

## Quick Start

### 1. Configure secrets

From the `repo/` directory:

```bash
cp .env.example .env   # then edit .env with your own secrets
```

### 2. Generate TLS certificates (first run only)

```bash
./certs/generate_certs.sh
```

### 3. Start the stack

```bash
docker-compose up --build
```

Or using the modern CLI form:

```bash
docker compose up --build
```

### 4. Verify the system is running

Once the stack is healthy, run these checks to confirm everything works:

```bash
# Health check — should return {"status":"ok", ...}
curl -sk https://localhost:3443/api/health

# Login as admin — should return {"token":"...", "user":{...}}
curl -sk -X POST https://localhost:3443/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your ADMIN_PASSWORD>"}'

# Verify session — use the token from above
curl -sk https://localhost:3443/api/auth/me \
  -H "Authorization: Bearer <token>"
# Expected: {"user":{"id":"...","username":"admin","role":"Administrator",...}}
```

Frontend verification: open [http://localhost:5173](http://localhost:5173) in a browser, log in with the admin credentials below, and confirm the dashboard loads with all seven tabs visible.

## Secrets

All secrets are injected via the `.env` file. **No default secrets are hardcoded in `docker-compose.yml`.**

Required variables in `.env`:

| Variable            | Purpose                                           |
|---------------------|---------------------------------------------------|
| `POSTGRES_PASSWORD` | PostgreSQL database password                      |
| `DB_PASSWORD`       | Backend database connection password              |
| `APP_AES_KEY`       | AES-256 key for at-rest encryption (64 hex chars) |
| `ADMIN_PASSWORD`    | Bootstrap password for all seeded user accounts   |

## Demo Credentials & Roles

All seeded accounts use the password set by `ADMIN_PASSWORD` in `.env`.

| Username    | Role              | Access Scope                                                        |
|-------------|-------------------|---------------------------------------------------------------------|
| `admin`     | Administrator     | Full access: all tabs, all endpoints, audit logs, customer PII      |
| `host`      | Store Manager     | Scripts, resources, bookings, forum, scoring, commerce, master data |
| `clerk`     | Inventory Clerk   | Scripts, resources, master data                                     |
| `moderator` | Moderator         | Forum only (moderation: pin, lock, archive, feature, delete)        |
| `member`    | Customer/Member   | Bookings, forum (read/post), scoring (own), commerce (shop)         |

### Authorization Model

```
Endpoint group            Required role(s)
─────────────────────────────────────────────────────────────────
/api/admin/*              Administrator
/api/master/customers/    Administrator (dedupe, delete, restore, retention, CSV)
  dedupe-*, delete-*,
  retention/*, import/export
/api/master/*             Administrator, Store Manager, Inventory Clerk
/api/forum/moderation     Administrator, Moderator
/api/forum/delete-*       Administrator, Moderator
/api/forum/retention/*    Administrator
/api/scripts (write)      Administrator, Store Manager
/api/resources (write)    Administrator, Store Manager
/api/bookings/status      Administrator, Store Manager
/api/scoring/calculate    Administrator, Store Manager, Inventory Clerk
/api/commerce/*           Any authenticated user
/api/bookings (read)      Any authenticated (own bookings only unless admin/manager)
/api/forum (read/post)    Any authenticated user
/api/scoring/ledger       Any authenticated (own data only unless admin)
```

### Security Features

- **Password hashing:** Argon2id (seeded accounts re-hashed on startup from `ADMIN_PASSWORD`).
- **Account lockout:** 5 failed attempts triggers 15-minute lockout.
- **Admin idle timeout:** Administrator sessions auto-revoke after 20 minutes of inactivity.
- **Session TTL:** All sessions expire after 8 hours.
- **IDOR protection:** Non-admin users see only their own bookings; sensitive customer fields masked for non-admin.
- **Encryption at rest:** Customer address and notes are AES-256-CBC encrypted in the database.
- **Immutable audit trail:** Every mutation is recorded in append-only `immutable_logs`.
- **DLP scanning:** CSV imports are scanned for SSN patterns and malware signatures before processing.
- **7-day deletion window:** Soft-deletes for customers and forum content with restore capability before permanent purge.

## Access

| Service          | URL                                      | Notes                     |
|------------------|------------------------------------------|---------------------------|
| Frontend (dev)   | http://localhost:5173                    | Svelte SPA                |
| Backend API      | http://localhost:3000                    | Direct (no TLS)           |
| Caddy → Backend  | https://localhost:3443                   | TLS-terminated proxy      |
| Caddy → Frontend | https://localhost:5173 (via Caddy)       | TLS-terminated proxy      |

## Testing

### Run all tests

```bash
cd repo && ./run_tests.sh
```

### Run with full API coverage (requires running stack + password)

```bash
ADMIN_PASSWORD=<your_password> ./run_tests.sh
```

### Test suites

| Suite                       | Type          | What it covers                                             |
|-----------------------------|---------------|------------------------------------------------------------|
| `unit_tests/*.test.js`      | Unit          | Auth/roles, security, commerce invariants, scoring, CSV, crypto, frontend |
| `API_tests/smoke.sh`        | API smoke     | Health endpoint, admin login                               |
| `API_tests/critical_invariants.sh` | API   | Business rules: cart merge, promotions, variance, limits, RBAC |
| `API_tests/integration_e2e.sh`     | API E2E | Full workflows: auth, CRUD, commerce, booking, forum       |
| `API_tests/coverage_extended.sh`   | API    | Remaining endpoints: CRUD reads, status updates, retention  |
