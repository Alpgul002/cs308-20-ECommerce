# BUG-SCRUM19-01: catalog retry restores stale account and cart state

Reported 2026-11-27 during review of the local, not-yet-published branch merge.
Scope: SCRUM-19 conflict resolution in `frontend/src/App.jsx`.

## Reproduction

1. Open the store as a guest with an empty cart.
2. Add an item, then sign in. Confirm the account and one-item cart are visible.
3. Cause a catalog request to fail, then restore the catalog service.
4. Click **Try again**.

Expected: products recover and the current account/cart remain visible.
Actual in the initial automatic merge: the page became a guest with the startup cart,
even though the server session and server cart remained valid. The bootstrap effect
depended on the catalog retry counter and reapplied its memoized original response.

## Resolution and evidence

Restore one-time account/cart initialization (`[]` dependencies), independent of
catalog retry. Login and cart mutations remain responsible for updating current state.
The browser regression `SCRUM-19 catalog retry preserves the current signed-in account
and bag` reproduced the missing **My profile** button before the fix. After the fix,
it checks restored products, signed-in UI, one-item bag and the actual server cart.
See `SCRUM-19_TEST_RESULTS.md` for the final test run.

This is one integration bug, fixed before publication. A failed first account/cart
load still reports its existing error; it is not represented as a new recovery feature.
