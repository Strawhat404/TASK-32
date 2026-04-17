# Test Coverage Audit

## Project Type Detection
- Declared in README: **fullstack** (`repo/README.md:3`).

## Backend Endpoint Inventory
- Source of truth: `repo/backend/src/server.js` route declarations (`app.<method>(...)`).
- Total unique endpoints (METHOD + PATH): **69**.
- Full endpoint inventory is enumerated in the mapping table below.

## API Test Mapping Table
| Endpoint | Covered | Test Type | Test Files | Evidence |
|---|---|---|---|---|
| `GET /api/health` | yes | true no-mock HTTP | `repo/API_tests/smoke.sh` | `repo/API_tests/smoke.sh:6` |
| `POST /api/auth/login` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh, repo/API_tests/smoke.sh` | `repo/API_tests/coverage_extended.sh:76` |
| `GET /api/auth/me` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:90` |
| `POST /api/auth/logout` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:104` |
| `GET /api/master/sku-rules` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:119` |
| `POST /api/master/sku-rules` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:91` |
| `POST /api/master/skus` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:130` |
| `GET /api/master/skus` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:124` |
| `PATCH /api/master/skus/:id` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:135` |
| `DELETE /api/master/skus/:id` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:166` |
| `POST /api/master/skus/:id/barcodes` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:141` |
| `GET /api/master/skus/:id/barcodes` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:151` |
| `POST /api/master/skus/:id/lots` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:144` |
| `GET /api/master/skus/:id/lots` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:156` |
| `POST /api/master/skus/:id/packaging` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:147` |
| `GET /api/master/skus/:id/packaging` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:161` |
| `GET /api/master/bins` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:171` |
| `POST /api/master/bins` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:116` |
| `GET /api/master/carriers` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:176` |
| `GET /api/master/stores` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:181` |
| `POST /api/master/carriers` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:120` |
| `POST /api/master/inventory` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:229` |
| `POST /api/master/shipping-rates` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:115` |
| `POST /api/master/promotions` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:234` |
| `POST /api/master/customers` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:191` |
| `GET /api/master/customers` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh` | `repo/API_tests/critical_invariants.sh:282` |
| `PATCH /api/master/customers/:id` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh` | `repo/API_tests/critical_invariants.sh:231` |
| `GET /api/master/customers/dedupe-scan` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:240` |
| `POST /api/master/customers/dedupe-merge` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:242` |
| `POST /api/master/customers/:id/delete-request` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:196` |
| `POST /api/master/customers/deletion/:id/restore` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:202` |
| `POST /api/master/customers/retention/run` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:207` |
| `POST /api/master/customers/import-csv` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:164` |
| `POST /api/master/customers/export-csv` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:249` |
| `GET /api/commerce/carts/:storeCode` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:218` |
| `POST /api/commerce/carts/:storeCode/items` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:119` |
| `POST /api/commerce/carts/merge` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:125` |
| `GET /api/commerce/checkout/preview` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:149` |
| `POST /api/commerce/checkout/place` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:174` |
| `POST /api/scoring/calculate` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh` | `repo/API_tests/coverage_extended.sh:231` |
| `GET /api/scoring/ledger/:subjectId` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:235` |
| `GET /api/scoring/grades-rankings` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh` | `repo/API_tests/critical_invariants.sh:325` |
| `POST /api/forum/:entity/:id/delete-request` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:281` |
| `GET /api/forum/deletion-requests` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:287` |
| `POST /api/forum/deletion/:id/restore` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:292` |
| `POST /api/forum/retention/run` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:381` |
| `GET /api/admin/immutable-logs` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/critical_invariants.sh:244` |
| `GET /api/scripts` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:307` |
| `POST /api/scripts` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:251` |
| `PATCH /api/scripts/:id` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:257` |
| `GET /api/resources/rooms` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:312` |
| `POST /api/resources/rooms` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:273` |
| `GET /api/resources/business-hours` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:279` |
| `PUT /api/resources/business-hours` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:284` |
| `GET /api/resources/host-schedules` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:289` |
| `POST /api/resources/host-schedules` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh` | `repo/API_tests/coverage_extended.sh:320` |
| `GET /api/resources/availability` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:294` |
| `GET /api/bookings` | yes | true no-mock HTTP | `repo/API_tests/integration_e2e.sh` | `repo/API_tests/integration_e2e.sh:78` |
| `POST /api/bookings` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:324` |
| `PATCH /api/bookings/:id/status` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:329` |
| `GET /api/forum/sections` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh` | `repo/API_tests/critical_invariants.sh:297` |
| `POST /api/forum/sections` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:350` |
| `GET /api/forum/threads` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:359` |
| `POST /api/forum/threads` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh, repo/API_tests/critical_invariants.sh, repo/API_tests/integration_e2e.sh` | `repo/API_tests/coverage_extended.sh:354` |
| `GET /api/forum/tags` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh` | `repo/API_tests/critical_invariants.sh:307` |
| `GET /api/forum/threads/by-tag/:tag` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh` | `repo/API_tests/critical_invariants.sh:310` |
| `GET /api/forum/threads/:id/posts` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:375` |
| `POST /api/forum/posts` | yes | true no-mock HTTP | `repo/API_tests/coverage_extended.sh` | `repo/API_tests/coverage_extended.sh:364` |
| `PATCH /api/forum/:entity/:id/moderation` | yes | true no-mock HTTP | `repo/API_tests/critical_invariants.sh` | `repo/API_tests/critical_invariants.sh:313` |
SUMMARY	69	69

## API Test Classification
1. True No-Mock HTTP
- `repo/API_tests/smoke.sh`
- `repo/API_tests/critical_invariants.sh`
- `repo/API_tests/integration_e2e.sh`
- `repo/API_tests/coverage_extended.sh`
- Evidence: all use real HTTP `curl` against `BASE_URL` and hit concrete `/api/...` endpoints.

2. HTTP with Mocking
- None found.

3. Non-HTTP (unit/integration without HTTP)
- `repo/unit_tests/*.test.js` (module-level tests using `node:test`).

## Mock Detection Rules Result
- Scan scope: `repo/API_tests`, `repo/unit_tests`.
- Patterns checked: `jest.mock`, `vi.mock`, `sinon.stub`, override/stub/spy patterns.
- Result: **no explicit mocking/stubbing detected**.

## Coverage Summary
- Total endpoints: **69**
- Endpoints with HTTP tests: **69**
- Endpoints with TRUE no-mock HTTP tests: **69**
- HTTP coverage: **100.0%**
- True API coverage: **100.0%**

## Unit Test Summary
### Backend Unit Tests
- Files:
  - `repo/unit_tests/auth.roles.test.js`
  - `repo/unit_tests/backend.security.test.js`
  - `repo/unit_tests/commerce.invariants.test.js`
  - `repo/unit_tests/csv.parser.test.js`
  - `repo/unit_tests/customer.dedupe.test.js`
  - `repo/unit_tests/scoring.lifecycle.test.js`
- Modules covered:
  - auth/roles/security helpers
  - commerce invariants
  - CSV parser/serializer
  - customer dedupe + crypto helpers
  - scoring + coding-rule utility + DLP
- Important backend modules not directly unit-tested (but exercised via HTTP tests):
  - `repo/backend/src/auth.js`
  - `repo/backend/src/db.js`
  - portions of `repo/backend/src/coding-rules.js`

### Frontend Unit Tests (STRICT)
- Frontend test files:
  - `repo/unit_tests/frontend.components.test.js`
  - `repo/unit_tests/frontend.static.test.js`
- Frameworks/tools detected:
  - Node test runner (`node:test`)
  - Svelte compiler (`svelte/compiler`) used to compile `.svelte` components
- Components/modules covered (direct evidence):
  - `repo/frontend/src/lib/constants.js` (imported and asserted)
  - `repo/frontend/src/components/ForumSectionTree.svelte` (prop/structure checks)
  - `repo/frontend/src/components/CommerceTab.svelte` (API/function checks)
  - `repo/frontend/src/components/MasterDataTab.svelte` (API/domain checks)
  - `repo/frontend/src/App.svelte` (imports/constants wiring checks)
  - `repo/frontend/src/main.js` (mount behavior check)
- Important frontend modules not robustly behavior-tested:
  - runtime UI interaction states/events are not executed in browser (no RTL/Playwright/Cypress evidence)
- **Frontend unit tests: PRESENT**

### Cross-Layer Observation
- Coverage is now balanced at API surface level (backend complete) plus explicit frontend module/component static/compile checks.
- Remaining imbalance: no true browser FE↔BE E2E workflow test evidence.

## API Observability Check
- Strong: API tests consistently show method/path, request bodies/params, status codes, and response assertions (`assert_file_contains`, `json_get`) across all route groups.
- Observability verdict: **strong**.

## Tests Check
- Success/failure/edge coverage: broad and explicit across auth, RBAC, booking, forum moderation/deletion lifecycle, master data, commerce, scoring, retention.
- Assertion quality: generally meaningful (status + response content checks).
- `run_tests.sh`:
  - Docker-based API checks are present (`docker compose ...`, then API scripts).
  - No package-manager install instructions are required in the script.
  - Unit tests run locally via `node --test`.

## End-to-End Expectations
- For fullstack, ideal evidence includes real browser FE↔BE E2E.
- Current evidence: strong API E2E + frontend unit/static/compile checks, but no browser automation suite.
- Compensation assessment: strong partial compensation, but still below ideal fullstack E2E bar.

## Test Coverage Score (0–100)
- **93/100**

## Score Rationale
- + Full endpoint HTTP coverage (69/69) with true no-mock route execution.
- + Strong API assertion quality and broad negative-path coverage.
- + Frontend unit/component-level evidence now present.
- - Missing browser-level FE↔BE E2E automation.

## Key Gaps
- No true browser-driven fullstack E2E tests (e.g., Playwright/Cypress) validating rendered UI interactions against live backend.

## Confidence & Assumptions
- Confidence: **high**.
- Assumptions:
  - Endpoint inventory is derived strictly from `repo/backend/src/server.js` route declarations.
  - Coverage matching is strict by METHOD + normalized PATH (query removed, params normalized).
  - Static inspection only; no test execution performed.

## Test Coverage Verdict
- **PASS**

---

# README Audit

## High Priority Issues
- None.

## Medium Priority Issues
- None.

## Low Priority Issues
- No dedicated browser E2E section for frontend user journeys in README (quality improvement, not hard-gate failure).

## Hard Gate Failures
- None.

## Hard Gate Checks (Evidence)
- Project type declared: `repo/README.md:3` (`fullstack`).
- Startup instructions include required command: `docker-compose up --build` at `repo/README.md:63`.
- Access method documented (frontend/backend/proxy URLs): `repo/README.md` Access section.
- Verification method documented with concrete `curl` checks and expected outcomes: `repo/README.md` lines around 78+.
- Environment rules: no runtime install commands (`npm install`, `pip install`, `apt-get`) required.
- Auth present and demo credentials provided with all roles: `repo/README.md` “Demo Credentials & Roles”.

## README Verdict
- **PASS**

---

## Final Verdicts
- Test Coverage Audit: **PASS**
- README Audit: **PASS**
