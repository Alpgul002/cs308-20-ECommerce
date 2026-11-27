# BUG-SCRUM20-01: API client drops checkout error details

- Reported: 2026-11-27
- Scope: SCRUM-20, shared frontend API adapter
- Priority: high for connecting checkout; existing backend errors remain correct
- Reproduced source: API adapter retained unchanged in SCRUM-19 commit `1ddde21a76a7a533b50a8fe3218631b05a2d4e02`
- Files: `frontend/src/api.js`, `frontend/src/scrum20.api.test.js`

## Reproduction

1. Supply a real-shaped HTTP 409 response containing `error`, `code: "stock_changed"`
   and per-product `items` to `fetchJson` (the unit test mocks transport only).
2. Catch the thrown error in the caller.
3. Inspect `error.code`, `error.items` and `error.details`.

Expected: callers can distinguish stock, price, validation and payment-decline failures
and show the affected product/field without parsing English prose.
Actual: the client retained only message and HTTP status; the structured fields were undefined.
The same loss affected changed totals and saved-versus-replayed bank declines.

## Fix and regression checks

Preserve the parsed response under `details` and explicitly copy `code`, `fields`,
`items`, `totalCents`, `replayed`. Do not copy arbitrary keys onto Error: the HTTP
status, message, name and stack remain authoritative. Keep timeout/cancellation and
network-failure handling intact.

Before the fix, all six new adapter regression cases failed. The post-fix result
is recorded in `SCRUM-20_TEST_RESULTS.md`. This is **one bug report**, not six bugs.
The future checkout screen still needs to consume these fields; this change does
not complete SCRUM-21 or prove the full browser checkout flow.
