# SCRUM-19: shared Sprint 3 baseline

## Scope and attribution

This work integrates existing teammate branches. It does not claim their cart,
payment, order or rating implementations as Ozan's new implementation.

| Input | Pinned commit | Preserved contribution |
| --- | --- | --- |
| `scrum-12` | `09b03872e02442ec5bfd5b9cc91463af97520a11` | Connected catalog/detail, server filters, URL state, timeout/cancellation, lockfile and tests |
| `feature/s3-25-cart-merge` | `7d02e562073016999ade7bb7429a2b6afd1019a0` | Guest/account cart validation and adjustment notice; includes the checkout/order branch |
| `feature/s3-delivered-ratings` | `e643ba2897e8ee22fe0d833932bbc93f2f5a1b9e` | Paid-and-delivered eligibility and numeric rating API |

Both new feature tips include `feature/s3-checkout-orders` at `cd7e1d8`.
The merge keeps each input as an ancestor, so teammate history remains attributable.
The integration branch does not update `main` or any teammate branch.

## Resolved integration conflicts

- `App.jsx`: keep server filtering and URL product navigation while moving the cart
  to the persistent API; retain login cart adjustments and the shared cart busy state.
  Account/cart bootstrap runs once; a catalog retry cannot restore its stale startup snapshot.
- `ProductDetailsPage.jsx`: preserve refresh, product fields and stock behavior;
  pass user, sign-in callback and cart busy state through `ConnectedProductPage` to feedback.
- `api.js`: retain SCRUM-12 cancellation, timeout and cache handling and the JSON write helper.
- The same application registers catalog, authentication, cart, checkout, orders and feedback.
- Migration 4 remains the shop schema, 5 checkout and 6 ratings in this baseline.
  A concurrent email branch already uses v7; review [its handoff](SPRINT3_CONCURRENT_CHANGES.md)
  with the database owner instead of creating a competing migration or editing existing ones.

## Verification

Run from the repository root with Node.js 24 and npm:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`backend/test/scrum19.integration.test.js` checks upgrading the SCRUM-12 schema and
the combined cart -> checkout -> filtered catalog -> delivered-feedback flow.
`e2e/scrum19.spec.js` checks that URL navigation and product feedback still work with
the database cart, including login merge notices and legacy cart import.
It also verifies that retrying a failed catalog request preserves the current login and bag.
These are integration/browser tests, not new unit-test quota claims.
See `SCRUM-19_TEST_RESULTS.md` for actual run results.

## Remaining dependencies

- SCRUM-21: the teammate's checkout form/confirmation screen is not present.
- SCRUM-24: the actual checkout-success UI refresh cannot be signed off before that screen exists.
- SCRUM-25: delivery updates, moderated comments, PDF and email are still missing for the full demo.
- SCRUM-26: the final demo release remains blocked by those features.
- SCRUM-20: the implemented API can be documented now; team agreement is a separate review step.

The available code is ready for a team review after the checks pass. Do not mark
the entire progress demo complete merely because this integration branch passes its tests.
