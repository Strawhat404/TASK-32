# API Specification

Base URL (proxied): `https://localhost:3443`

Local URLs:
- Frontend UI: `http://localhost:5173`
- API/health via Caddy: `https://localhost:3443/api/health`
- TLS certificate files mounted into Caddy:
  - `repo/certs/server.crt`
  - `repo/certs/server.key`
- Trust/install note:
  - import `repo/certs/server.crt` into the local OS/browser trust store to avoid browser certificate warnings.

## Auth
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

## Health
- `GET /api/health`

## Master Data
- Coding rules:
  - `GET /api/master/sku-rules` (admin)
  - `POST /api/master/sku-rules` (admin)
- SKU + related:
  - `GET /api/master/skus`
  - `POST /api/master/skus` (admin, generates code via active rule)
  - `PATCH /api/master/skus/:id` (admin)
  - `DELETE /api/master/skus/:id` (admin)
  - `GET|POST /api/master/skus/:id/barcodes`
  - `GET|POST /api/master/skus/:id/lots`
  - `GET|POST /api/master/skus/:id/packaging`
- Locations/carriers:
  - `GET|POST /api/master/bins`
  - `GET|POST /api/master/carriers`
- Stores and pricing setup:
  - `GET /api/master/stores`
  - `POST /api/master/inventory` (admin)
  - `POST /api/master/shipping-rates` (admin)
  - `POST /api/master/promotions` (admin)
- Customers + dedupe + CSV:
  - `GET|POST|PATCH /api/master/customers`
  - `GET /api/master/customers/dedupe-scan` (admin)
  - `POST /api/master/customers/dedupe-merge` (admin)
  - `POST /api/master/customers/import-csv` (admin, local file <=20MB)
  - `POST /api/master/customers/export-csv` (admin)

## Commerce
- Cart:
  - `GET /api/commerce/carts/:storeCode`
  - `POST /api/commerce/carts/:storeCode/items`
  - `POST /api/commerce/carts/merge`
- Checkout:
  - `GET /api/commerce/checkout/preview`
  - `POST /api/commerce/checkout/place`

Checkout enforcement semantics:
- purchase limit `max 2 per customer per day` shown in preview and enforced at placement.
- purchase-limit computation is customer-wide across all order item quantities on `CURRENT_DATE`, not per SKU.
- price-change guard (>2%) enforced at placement.
- stock sufficiency enforced at placement.
- row-locking transaction prevents oversell race conditions.

Promotion semantics:
- member + coupon combinable.
- threshold + coupon forbidden.

## Scoring
- `POST /api/scoring/calculate`
- `GET /api/scoring/ledger/:subjectId`

## Forum
- Existing moderation endpoints remain.
- Lifecycle additions:
  - `POST /api/forum/:entity/:id/delete-request`
  - `POST /api/forum/deletion/:id/restore` (admin)
  - `POST /api/forum/retention/run` (admin)

## Admin Audit
- `GET /api/admin/immutable-logs` (admin)

## Error Model
- `400` validation/invariant failure.
- `401` auth/session failures.
- `403` RBAC denial.
- `404` missing entities.
- `423` account lock.
