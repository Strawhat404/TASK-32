# Delivery Acceptance and Project Architecture Audit (Static-Only)

## 1. Verdict
- Overall conclusion: **Partial Pass**

## 2. Scope and Static Verification Boundary
- Reviewed: repository docs, backend routes/middleware/schema/modules, frontend Svelte UI structure, Docker/Caddy/configuration, unit/API test assets.
- Not reviewed: runtime behavior, browser interaction, DB state transitions in a live system, container startup behavior, network/TLS handshake behavior.
- Intentionally not executed: project startup, Docker, tests, external services.
- Manual verification required for: end-to-end runtime flows, TLS certificate trust/install behavior, actual offline operation quality, UI rendering/accessibility.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal mapped: offline-first multi-role platform covering merchandise master data, commerce checkout invariants, booking/resources, forum moderation lifecycle, scoring, local security/privacy controls.
- Main implementation areas mapped: `repo/backend/src/server.js`, backend modules (`auth/security/commerce/scoring/crypto/csv/dlp`), DB schema (`repo/backend/db/init.sql`), frontend role tabs (`repo/frontend/src/App.svelte`, `repo/frontend/src/components/*`), and test assets (`repo/unit_tests`, `repo/API_tests`).
- Primary risk areas identified: sensitive-data handling in logs, retention/compliance semantics, CSV import/export path behavior vs tests/docs, and test coverage realism.

## 4. Section-by-section Review

### 1. Hard Gates

#### 1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: Startup/test/config docs and entry artifacts exist and are statically navigable (`README`, `repo/README`, `.env.example`, `docker-compose`, Caddy, route files, tests).
- Evidence: `README.md:9`, `repo/README.md:3`, `repo/.env.example:1`, `repo/docker-compose.yml:1`, `repo/Caddyfile:1`, `repo/run_tests.sh:1`
- Manual verification: runtime start instructions and test commands were not executed by rule.

#### 1.2 Material deviation from prompt
- Conclusion: **Partial Pass**
- Rationale: Core domains are implemented (commerce, booking/resources, forum, scoring, master data, local auth/TLS). However, privacy/compliance semantics are weakened by sensitive-data logging and incomplete retention behavior.
- Evidence: implemented domains in `repo/backend/src/server.js:312`, `:814`, `:1126`, `:1455`, `:1541`; privacy gaps at `repo/backend/src/server.js:617`, `:1301`

### 2. Delivery Completeness

#### 2.1 Coverage of explicit core requirements
- Conclusion: **Partial Pass**
- Rationale: Most explicit functional requirements are present (roles, coding rules, cart merge, promo rules, checkout checks, booking validation, forum hierarchy/moderation, scoring strategies/rankings, CSV import limit, lockout/idle timeout, encryption/masking).
- Evidence: `repo/frontend/src/App.svelte:17`, `repo/backend/src/coding-rule-utils.js:1`, `repo/backend/src/commerce.js:15`, `repo/backend/src/server.js:922`, `:975`, `:1473`, `:1541`, `:1126`, `repo/backend/src/security.js:1`, `repo/backend/src/crypto-utils.js:20`, `repo/backend/src/csv-utils.js:3`
- Manual verification: actual runtime behavior still requires manual checks.

#### 2.2 End-to-end 0→1 deliverable vs partial/demo
- Conclusion: **Pass**
- Rationale: Full-stack structure is present with backend/frontend/schema/docs/config/tests. Not a single-file demo.
- Evidence: `repo/backend/src/server.js:1`, `repo/frontend/src/App.svelte:1`, `repo/backend/db/init.sql:1`, `repo/README.md:1`, `repo/unit_tests/package.json:1`

### 3. Engineering and Architecture Quality

#### 3.1 Reasonable structure and decomposition
- Conclusion: **Partial Pass**
- Rationale: There is module separation, but major orchestration is concentrated in very large files, increasing coupling and review/maintenance risk.
- Evidence: `repo/backend/src/server.js` has 1721 lines; `repo/frontend/src/App.svelte` has 1303 lines (`wc -l`), with many domain concerns co-located.

#### 3.2 Maintainability/extensibility
- Conclusion: **Partial Pass**
- Rationale: Domain utilities exist (`commerce/scoring/crypto/csv`), but monolithic route/UI files and mixed concerns reduce long-term extensibility and safe change velocity.
- Evidence: `repo/backend/src/commerce.js:1`, `repo/backend/src/scoring.js:1`, `repo/backend/src/server.js:246`, `repo/frontend/src/App.svelte:207`

### 4. Engineering Details and Professionalism

#### 4.1 Error handling, logging, validation, API design
- Conclusion: **Partial Pass**
- Rationale: Validation and status handling exist in many places; however sensitive fields can be persisted in immutable logs in plaintext and retention targeting is inconsistent with actual forum log writes.
- Evidence: validation examples `repo/backend/src/server.js:279`, `:537`, `:979`; sensitive log risk `repo/backend/src/server.js:617`; retention deletion query `repo/backend/src/server.js:1301`; forum immutable writes `repo/backend/src/server.js:1239`, `:1272`

#### 4.2 Product-level organization vs demo-level
- Conclusion: **Pass**
- Rationale: The repository resembles a product scaffold with infra, schema, modules, role-aware UI, and test assets.
- Evidence: `repo/docker-compose.yml:1`, `repo/Caddyfile:1`, `repo/backend/db/init.sql:1`, `repo/frontend/src/components/CommerceTab.svelte:1`, `repo/API_tests/critical_invariants.sh:1`

### 5. Prompt Understanding and Requirement Fit

#### 5.1 Business-goal and constraint fit
- Conclusion: **Partial Pass**
- Rationale: Business flows largely match prompt semantics, but compliance/privacy constraints are not fully met (sensitive logging, retention semantics, non-identifying score-summary expectation not explicit in storage model).
- Evidence: scoring stores raw `subject_id` (`repo/backend/db/init.sql:393`) and rankings return it (`repo/backend/src/server.js:1189`); sensitive logging at `repo/backend/src/server.js:617`.

### 6. Aesthetics (frontend)

#### 6.1 Visual/interaction quality and fit
- Conclusion: **Cannot Confirm Statistically**
- Rationale: Static code shows coherent styling hierarchy and interaction feedback patterns, but no runtime rendering validation was performed.
- Evidence: `repo/frontend/src/App.svelte:710`, `repo/frontend/src/components/CommerceTab.svelte:139`, `repo/frontend/src/components/MasterDataTab.svelte:285`, `repo/frontend/src/index.css:5`
- Manual verification: required for actual visual polish, responsiveness, and interactive affordances in browser.

## 5. Issues / Suggestions (Severity-Rated)

### Blocker / High

1. **Severity: Blocker**
- Title: Sensitive customer updates are logged to immutable storage without sanitization/encryption
- Conclusion: **Fail**
- Evidence: `repo/backend/src/server.js:617` (logs raw update payload `p`), with customer update accepting plaintext `address`/`notes` (`repo/backend/src/server.js:612`, `:613`).
- Impact: Violates privacy/security requirement intent for sensitive fields; immutable logs can become a long-lived sensitive-data sink.
- Minimum actionable fix: sanitize immutable log payload for customer updates (drop or redact `address`, `notes`, phone/email where not required), or encrypt logged sensitive values before insertion.

2. **Severity: High**
- Title: Forum retention policy implementation does not align with actual forum log write path
- Conclusion: **Fail**
- Evidence: retention deletes from `audit_logs` with `entity_type LIKE 'forum_%'` (`repo/backend/src/server.js:1301`), but forum lifecycle writes use `immutableLog` (`repo/backend/src/server.js:1239`, `:1272`), and `audit()` usage is not forum-centric (`repo/backend/src/server.js:265`, `:305`).
- Impact: Required 365-day forum-log purge semantics are likely ineffective/incomplete.
- Minimum actionable fix: define one authoritative forum-log storage path and apply retention to that path with explicit archived criteria and auditable purge behavior.

3. **Severity: High**
- Title: CSV import/export path handling is inconsistent with provided API tests and likely breaks expected local-file usage
- Conclusion: **Fail**
- Evidence: backend forces `safePath = /tmp/<basename>` for import/export (`repo/backend/src/server.js:740`, `:800`), while tests expect nested paths to be honored (`repo/API_tests/integration_e2e.sh:164`, `repo/API_tests/critical_invariants.sh:249`).
- Impact: On-demand import/export workflows and test scripts are unreliable; acceptance evidence quality is reduced.
- Minimum actionable fix: validate paths are under an allowlisted root (e.g., `/tmp`) while preserving subdirectories; update docs/tests to same contract.

4. **Severity: High**
- Title: Score reporting remains identifying despite requirement intent for non-identifying aggregate preservation
- Conclusion: **Partial Fail**
- Evidence: `scoring_adjustment_ledger.subject_id` stores raw subject identifier (`repo/backend/db/init.sql:393`) and rankings return it directly (`repo/backend/src/server.js:1203`).
- Impact: Privacy/compliance intent for non-identifying retained score summaries is not clearly satisfied.
- Minimum actionable fix: introduce anonymized/aggregated reporting artifacts for retention/reporting outputs and restrict identifying exports by role/policy.

### Medium / Low

5. **Severity: Medium**
- Title: Documentation/spec and authorization semantics diverge for sensitive commerce setup endpoints
- Conclusion: **Partial Fail**
- Evidence: API spec marks inventory/shipping/promotion setup as admin (`docs/api-spec.md:40`, `:41`, `:42`), while implementation allows broader staff roles (`repo/backend/src/server.js:474`, `:493`, `:510`, with `STAFF_ROLES` at `:34`).
- Impact: Privilege boundary ambiguity; operational risk if least-privilege was intended.
- Minimum actionable fix: align role matrix across docs and code; tighten preHandlers if admin-only is intended.

6. **Severity: Medium**
- Title: Monolithic backend/frontend files increase architectural and change-risk debt
- Conclusion: **Partial Fail**
- Evidence: `repo/backend/src/server.js` (1721 lines), `repo/frontend/src/App.svelte` (1303 lines).
- Impact: Harder reasoning/testing/refactoring; higher regression risk for future changes.
- Minimum actionable fix: split routes by domain modules and decompose App into feature slices with shared services/stores.

7. **Severity: Low**
- Title: Internal docs are inconsistent on frontend protocol
- Conclusion: **Partial Fail**
- Evidence: design doc says frontend `http://localhost:5173` (`docs/design.md:10`, `:72`) while README states `https://localhost:5173` (`repo/README.md:38`).
- Impact: Verification confusion.
- Minimum actionable fix: harmonize docs to one canonical access model.

## 6. Security Review Summary

- Authentication entry points: **Pass**
  - Evidence: login/me/logout routes and token-hash sessions (`repo/backend/src/server.js:248`, `:260`, `:262`; `repo/backend/src/auth.js:71`, `:103`, `:159`).
  - Notes: lockout and admin idle timeout are implemented (`repo/backend/src/security.js:1`, `repo/backend/src/auth.js:49`, `:127`).

- Route-level authorization: **Partial Pass**
  - Evidence: many routes use `authenticate` + `authorize(...)` (`repo/backend/src/server.js:269`, `:621`, `:1126`, `:1319`, `:1528`, `:1665`).
  - Concern: role-scope ambiguity on pricing/promo/inventory setup (`repo/backend/src/server.js:474`, `:493`, `:510`).

- Object-level authorization: **Partial Pass**
  - Evidence: booking list restricts non-managers to own bookings (`repo/backend/src/server.js:1462`), scoring ledger has subject-based check (`repo/backend/src/server.js:1168`).
  - Concern: many mutable endpoints operate by arbitrary IDs without finer ownership/store scoping.

- Function-level authorization: **Partial Pass**
  - Evidence: admin-only immutable logs and deletion restore endpoints (`repo/backend/src/server.js:1248`, `:1257`, `:1319`).
  - Concern: sensitive setup functions may be broader than intended (`repo/backend/src/server.js:474`, `:493`, `:510`).

- Tenant / user data isolation: **Partial Pass**
  - Evidence: cart/checkout bound to `request.user.id` (`repo/backend/src/server.js:817`, `:983`), booking visibility filtered for non-managers (`repo/backend/src/server.js:1463`).
  - Concern: global customer/master data remain broadly visible to staff roles by design; this may be acceptable but increases blast radius.

- Admin / internal / debug protection: **Pass**
  - Evidence: admin immutable logs endpoint protected by admin role prehandler (`repo/backend/src/server.js:1319`).

## 7. Tests and Logging Review

- Unit tests: **Partial Pass**
  - Evidence: utility-focused tests exist for security/roles/commerce/scoring/csv/dedupe (`repo/unit_tests/backend.security.test.js:1`, `auth.roles.test.js:1`, `commerce.invariants.test.js:1`, `scoring.lifecycle.test.js:1`, `csv.parser.test.js:1`, `customer.dedupe.test.js:1`).
  - Gap: no direct route-handler unit coverage for auth/session/RBAC/object-level failures.

- API/integration tests: **Partial Pass**
  - Evidence: smoke + critical invariants + e2e shell scripts (`repo/API_tests/smoke.sh:1`, `critical_invariants.sh:1`, `integration_e2e.sh:1`).
  - Gap: scripts include path-contract inconsistencies versus backend import/export behavior, reducing trustworthiness of claimed coverage (`repo/backend/src/server.js:740`, `:800`; `repo/API_tests/integration_e2e.sh:164`; `repo/API_tests/critical_invariants.sh:249`).

- Logging categories / observability: **Partial Pass**
  - Evidence: Fastify logger enabled (`repo/backend/src/server.js:31`), audit + immutable logs used (`repo/backend/src/auth.js:166`, `repo/backend/src/server.js:86`).
  - Gap: retention policy/log taxonomy mismatch for forum logs (`repo/backend/src/server.js:1301`, `:1239`).

- Sensitive-data leakage risk in logs/responses: **Fail**
  - Evidence: immutable log on customer update persists raw payload potentially including plaintext `address`/`notes` (`repo/backend/src/server.js:617`, `:612`, `:613`).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist: yes, Node built-in test runner (`repo/run_tests.sh:31`; `repo/unit_tests/package.json:1`).
- API/integration tests exist: yes, shell/curl scripts (`repo/run_tests.sh:35`, `:37`, `:38`; `repo/API_tests/*.sh`).
- Test entry points: `repo/run_tests.sh`, direct `node --test` and API shell scripts.
- Documentation provides test command: yes (`repo/README.md:29`).

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Login lockout + admin idle timeout | `repo/unit_tests/backend.security.test.js:10` | Threshold/timeout constants and pure-function checks (`:11-13`, `:26-29`) | basically covered | No route-level auth/session expiry integration checks | Add API-level tests for repeated failed login -> `423`, admin idle timeout revocation path |
| Role alias mapping | `repo/unit_tests/auth.roles.test.js:5` | `roleMatches` / `roleLabelFor` assertions (`:13-17`) | basically covered | No full route matrix verification per role | Add route authorization matrix tests for critical endpoints |
| Cart merge, promo, price variance, purchase limit logic | `repo/unit_tests/commerce.invariants.test.js:10` | latest-edit + cap (`:13-17`), promo conflict (`:37-46`), >2% rule (`:50-57`) | sufficient (logic-level) | No concurrent checkout race test in automated suite | Add integration test simulating parallel checkout attempts for same stock |
| Checkout invariants API | `repo/API_tests/critical_invariants.sh:169` | >2% blocked, stock blocked, purchase-limit checks (`:175-218`) | basically covered | Depends on runtime stack; unauthenticated/404 paths sparse | Add explicit 401/404/invalid payload status tests for checkout endpoints |
| CSV parse + DLP utilities | `repo/unit_tests/csv.parser.test.js:6`, `repo/unit_tests/scoring.lifecycle.test.js:34` | parser and DLP function checks (`csv:8-27`, `scoring:35-37`) | basically covered | Import/export route path contract not validated against backend sanitation | Add API test asserting accepted nested path behavior or documented rejection behavior |
| Customer dedupe rules | `repo/unit_tests/customer.dedupe.test.js:7`, `repo/API_tests/critical_invariants.sh:240` | email/normalized-phone rule checks and merge flow | basically covered | No negative object-level auth cases around customer update/delete routes | Add API tests for unauthorized customer mutation attempts |
| Forum moderation + restore window | `repo/API_tests/integration_e2e.sh:280` | deletion request + restore + duplicate restore blocked (`:281-304`) | basically covered | Retention 365-day purge semantics not meaningfully asserted | Add retention scenario tests with controllable timestamps and log-table assertions |
| Booking isolation | `repo/API_tests/integration_e2e.sh:66` | member sees zero admin bookings (`:78-82`) | sufficient (single scenario) | No tests for status-change authorization edge cases | Add 403/404 tests for booking status changes by disallowed roles |
| Scoring grade/rankings | `repo/API_tests/critical_invariants.sh:320`, `repo/unit_tests/scoring.lifecycle.test.js:20` | deterministic grade and order assertions (`critical:327-332`) | basically covered | No tests for non-identifying reporting constraint | Add tests for anonymized reporting output contract |

### 8.3 Security Coverage Audit
- Authentication: **Basically covered** by utility tests and login checks, but route-level failure-mode depth is limited.
- Route authorization: **Insufficient** for full role matrix; some 403 tests exist but not exhaustive for high-risk endpoints.
- Object-level authorization: **Insufficient**; booking isolation has one positive case, broader object-level mutation controls are not thoroughly tested.
- Tenant/data isolation: **Insufficient**; cart and booking scenarios exist, but customer/master data exposure and multi-role access boundaries are not comprehensively tested.
- Admin/internal protection: **Basically covered** via immutable logs access in API tests, but negative tests for unauthenticated access are limited.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Major logic invariants are covered in utility/API scripts, but uncovered authorization/privacy/retention risks remain. Current tests could still pass while severe defects remain undetected (especially sensitive-data logging and retention-policy mismatches).

## 9. Final Notes
- This report is strictly static; runtime correctness claims were not made.
- High-severity findings are concentrated in privacy/compliance and verification reliability, not in the existence of core domain features.
- The most urgent remediation path is: sanitize sensitive immutable logs, correct retention target semantics, and align CSV path contract across backend/tests/docs.
