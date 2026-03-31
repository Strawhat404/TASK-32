# Business Logic & Requirement Questions Log


## 1. Cart merge semantics (latest wins + cap)
- Question: When merging carts (cross-store and same-store), how should conflicts be resolved per line item, and how should the quantity cap be applied?
- My Understanding: For any SKU that exists in both source and target, the line item should use the attributes from the most recently edited version (“latest edit wins”), while quantities should be summed but never exceed the server-enforced cart quantity cap.
- Solution: Implemented merge so that per SKU the “latest_edit_at” line is selected and merged quantity is capped at the configured cap.

## 2. Same-store cart merge safety
- Question: What should happen if the merge endpoint is called with the same store code (source == target)?
- My Understanding: The system must not double-count quantities or create inconsistent “latest edit” behavior.
- Solution: Implemented safe logic for same-store merge so quantities are not duplicated and the result remains consistent.

## 3. Purchase limit meaning (max 2 per customer per day)
- Question: Does “max 2 per customer per day” apply per SKU or across the whole customer across all SKUs?
- My Understanding: The prompt says “per customer per day”, so it should be customer-wide across all cart items, not per SKU.
- Solution: Implemented purchase-limit computation based on the customer’s total purchased quantity for the day across SKUs, and enforced the same logic during both preview and placement.

## 4. Promotion stacking conflicts (threshold vs coupon)
- Question: Can threshold discounts combine with coupons, and how should member pricing combine with coupons?
- My Understanding: Prompt requires at most one coupon combined with member pricing, but threshold discounts must never combine with coupons.
- Solution: Implemented server-side promotion validation:
  - Member + coupon: allowed
  - Threshold + coupon: forbidden (request rejected with clear error)

## 5. Checkout safety guard (>2% price change)
- Question: What is the exact rule for “items changed by more than 2%”, and from which price snapshot should we compare?
- My Understanding: The cart stores a unit price snapshot; final placement must compare the latest unit price to that snapshot and block if the delta exceeds 2%.
- Solution: Enforced a placement-time check that blocks checkout when absolute percentage difference is greater than 2%. (Boundary behavior documented in tests.)

## 6. Checkout concurrency and oversell prevention
- Question: How do we prevent race conditions where multiple checkouts oversell the same inventory?
- My Understanding: We need transactional consistency and row locking over inventory rows during placement.
- Solution: Implemented a transaction with row-level locking during placement to prevent oversell.

## 7. Booking validity (business hours + host schedules + overlap)
- Question: For a booking request, which availability constraints must be satisfied (business hours, host schedules, room/table availability), and how do we detect overlaps?
- My Understanding: Booking must fall within allowed windows, must have matching host schedule/availability, and must not overlap existing confirmed bookings.
- Solution: Added booking validation that rejects:
  - bookings outside business hours
  - bookings without an applicable host schedule/availability
  - overlapping bookings

## 8. Customer deduplication keys + immutable merge logs
- Question: How should deduplication merges decide matches (email vs phone), and how do we preserve non-repudiation?
- My Understanding: Prompt requires merge by exact email OR normalized phone while preserving an immutable change log for dedupe/merge operations.
- Solution: Implemented match logic using email exact match OR normalized phone match; every merge writes an immutable ledger entry.

## 9. Sensitive data encryption and UI masking
- Question: How should sensitive fields be protected at rest and displayed safely in the UI?
- My Understanding: Sensitive data (addresses/notes, etc.) must be encrypted at rest, and the UI should mask by default (e.g., last 4 digits of phone).
- Solution: Encrypt sensitive fields in PostgreSQL and mask sensitive data in frontend responses/lists by default.

## 10. Forum moderation + deletion lifecycle + retention
- Question: What is the correct state model for moderation, and how do deletion requests and retention windows behave?
- My Understanding: Forum moderation must support pinned/featured/locked/archived. Deletion is a reversible 7-day request flow; archived content is purged after 365 days while tombstoned reports follow a long retention policy.
- Solution: Implemented moderation state transitions and a delete-request/restore/retention flow consistent with the specified time windows.

## 11. Scoring missing-value strategies and deterministic grades/rankings
- Question: How should missing-value strategies affect aggregation, and how do we ensure grade/ranking outputs are deterministic?
- My Understanding: Missing values must be handled explicitly using strategies (drop, zero-fill, average-fill). Grades and rankings should be deterministic based on stored thresholds and aggregated scores for a store and date range.
- Solution: Implemented explicit missing-value strategy handling plus deterministic grade mapping and ranking sorting rules.

## 12. Marketing consent (data minimization + export)
- Question: How should marketing consents be captured and retained without violating minimization principles?
- My Understanding: Consent should be stored explicitly via checkboxes and included in export flows as auditable preference fields.
- Solution: Added marketing consent fields to customer records (email + SMS), ensured defaults are false, and included those fields in customer CSV export.