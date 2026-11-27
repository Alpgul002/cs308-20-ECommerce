# SCRUM-20: review and completion notes

Updated 2026-11-27. **Contract and client adapter prepared for team review. Team agreement is pending.** The completed checks below establish technical evidence, not approval of proposed interfaces or Jira completion.

## Scope and attribution

The contract documents implemented request/response/status/role behavior, cents/USD, cart adjustments, structured errors and replay limits. Delivery transitions, PDF/email and moderation are separately labeled proposals. The adapter fix preserves structured server errors without allowing payload fields to overwrite Error identity or HTTP status.

Actual Jira **SCRUM-20** is the shared contract task (planning **S3-14**, former SCRUM-12 role). The existing checkout implementation remains the former SCRUM-13 role's planning **S3-20/S3-21/S3-22** contribution. Current artifacts: [API contract](SCRUM-20_API_CONTRACT.md), [adapter bug report](SCRUM-20_BUG_REPORT.md), `frontend/src/api.js`, `frontend/src/scrum20.api.test.js`.

## Technical verification

- [x] Compared the contract with the merged auth/cart, checkout/orders, invoice JSON, feedback, catalog/filter and migration sources. Documented actual popularity/tie ordering, live invoice-email lookup, immediate unmoderated reviews and validation-before-replay.
- [x] Reviewed the adapter whitelist and full error body under `details`; verified the new six regression cases and existing seven API-helper cases within the **36 passing frontend tests**. Existing timeout, cancellation and network handling remain covered.
- [x] **305 backend tests passed**: 303 existing merged tests plus two SCRUM-19 integration tests. Relevant suites cover checkout outcomes/replay/conflicts/rollback, cart merge/import, order/invoice ownership, ratings and catalog filters.
- [x] Verified upgrade to schema v6 through the integration test. The concurrently published email branch already uses v7; its integration is not covered by that test.
- [x] Corrected the original checkout API document's stale migration/rating notes and disclosed the current live email lookup, retaining implementation credit.
- [x] Final **16-test browser rerun passed**, including the catalog-retry/cart-session regression added after review.
- [x] Final production build passed after that fix.
- [x] Integration source is pinned below; the SCRUM-20 publication revision is the commit containing this file.

The reviewer identified a merged bootstrap dependency that could restore stale cart/user state when retrying the catalog. Its correction and added browser regression are tracked with SCRUM-19. The final 16-test run verifies that regression; the earlier 15-test pass is not used as evidence for it.

## Decisions for the team

- [ ] Obtain team agreement on the implemented shared contract.
- [ ] Agree on the proposed endpoint names, payloads, permissions and migration policies below.
- [ ] Review and integrate the existing email migration v7; jointly allocate the next unused version before new schema work.

| Decision | Review owner (former role) | State |
| --- | --- | --- |
| Accept implemented cart/auth merge shape and explain reductions in the UI | SCRUM-14 backend; SCRUM-10/SCRUM-11 frontend | Pending |
| Accept structured errors and same-key retry behavior, including validation before replay and absence of request fingerprinting | SCRUM-13 backend; SCRUM-10 checkout form; SCRUM-12 integration | Pending |
| Choose exact delivery list/status routes, role policy and allowed transitions | SCRUM-13 backend; SCRUM-10 UI | Pending |
| Choose PDF and mail job routes, retry policy/access, and live versus snapshotted invoice email | SCRUM-14 invoice/mail; SCRUM-13 access API | Pending |
| Choose moderation response change and migration policy for existing reviews; keep ratings independent | SCRUM-14 backend; SCRUM-11 manager UI; SCRUM-10 customer UI | Pending |
| Integrate existing email schema v7 and allocate later versions without collisions | SCRUM-15 database role with affected backend owners | Pending |

Record the actual current Jira links for these owners/tasks during review; former role labels and planning IDs are not current Jira issue numbers.

## Remaining dependencies and honest status

The integrated backend has real checkout/order APIs, cart merge and delivered-purchase ratings. Its frontend has no checkout form/submission flow yet. Delivery transitions, PDF/mail and comment moderation are not included in this baseline. PDF/mail branches appeared during verification and remain separate, as recorded in [concurrent changes](SPRINT3_CONCURRENT_CHANGES.md). A proposed schema, a fixture that marks an order delivered, or an API-only purchase test does not complete a whole browser demo.

Current status: **“Contract and adapter verified against the integrated backend/frontend/browser checks and prepared for team review. Team agreement pending.”** SCRUM-20's team-agreement criterion remains open; this work does not complete SCRUM-21, SCRUM-24, the full demo or release.

No reviewer confirmation is recorded below.

## Evidence and sign-off record

| Field | Value |
| --- | --- |
| Integration tree/commit | Tree `617e7af8e1467336e14427abef9720156f7658ce`; commit `1ddde21a76a7a533b50a8fe3218631b05a2d4e02` |
| Publication revision | See the SCRUM-20 commit containing this file on `feature/ozan-scrum19-20` |
| Adapter checks | 6 new regression cases + 7 existing API-helper cases passed |
| Backend suite | 305 passed: 303 existing + 2 new integration tests |
| Frontend suite | 36 passed, including the adapter cases above |
| Final browser suite | 16 passed |
| Final production build | Passed |
| Contract reviewer confirmations | None recorded |
| Approved proposed interfaces | None recorded |
| Unresolved disagreements/changes | See decision table |
| Jira completion decision | Pending actual acceptance evidence |
