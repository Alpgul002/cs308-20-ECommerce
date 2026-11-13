# Bug reports

Found during SCRUM-13 by testing the backend on commit `195bf0a`
(`feature/SCRUM-11-egemen-frontend`). Each bug was reproduced before it was fixed, and each
has a regression test carrying its ID, so `npm test` fails if it comes back.

| ID | Summary | Severity | Status |
| --- | --- | --- | --- |
| BUG-01 | Oversized JSON body returns 500 | Medium | Fixed |
| BUG-02 | Unsupported body charset returns 500 | Low | Fixed |
| BUG-03 | `%` and `_` in search match every product | Medium | Fixed |
| BUG-04 | Product list silently stops at 100 items | Medium | Fixed |
| BUG-05 | Server claims to be running when its port is busy | Medium | Fixed |
| BUG-06 | Emptied catalog comes back after a restart | High | Fixed |
| BUG-07 | CORS does not allow credentials | High | Fixed |

## BUG-01: Oversized JSON body returns 500

- **Steps:** `POST /api/cart/validate` with a JSON body larger than 32 KB.
- **Expected:** 413, the client sent too much.
- **Actual:** 500 `Unexpected server error`, and the error is logged as a server failure.
- **Cause:** the error handler only recognised malformed JSON. Other body-parser errors reached the generic 500 branch.
- **Fix:** forward the status of errors that body-parser marks as safe to expose (`backend/src/app.js`).

## BUG-02: Unsupported body charset returns 500

- **Steps:** `POST /api/cart/validate` with `Content-Type: application/json; charset=foo`.
- **Expected:** 415.
- **Actual:** 500 `Unexpected server error`.
- **Cause and fix:** same as BUG-01.

## BUG-03: `%` and `_` in search match every product

- **Steps:** `GET /api/products?search=%25` or `?search=_`.
- **Expected:** no results, because no product contains that text. The storefront's own filter treats it literally.
- **Actual:** all 9 products.
- **Cause:** the search text went into `LIKE` unescaped, so these characters acted as wildcards. This was not SQL injection, since the value was a bound parameter.
- **Fix:** escape them and declare `ESCAPE '!'` (`backend/src/catalog.js`).

## BUG-04: Product list silently stops at 100 items

- **Steps:** have 129 products in the table, then `GET /api/products`.
- **Expected:** 129 products. The storefront filters the list it receives, so anything missing cannot be found at all.
- **Actual:** 100 products, with no sign that the list was cut.
- **Cause:** a hard-coded `LIMIT 100`. Adding products through the new API makes this reachable.
- **Fix:** remove the limit. The `p-NNN` ID format caps the catalog below 1000 rows, so the list stays bounded.

## BUG-05: Server claims to be running when its port is busy

- **Steps:** start the API while something else holds port 4000.
- **Expected:** an error message and a non-zero exit code.
- **Actual:** prints `CS308 API running at http://localhost:4000/api/health` and exits with code 0, so nothing is running while the log says it is.
- **Cause:** Express 5 passes listen errors to the `listen` callback, and the callback ignored its argument.
- **Fix:** check the argument, print which port is busy and exit with code 1 (`backend/src/server.js`).

## BUG-06: Emptied catalog comes back after a restart

- **Steps:** delete every row in `products`, then restart the server.
- **Expected:** the catalog stays empty. The comment in the code promised that restarting never resets edited inventory.
- **Actual:** the 9 demo products return.
- **Cause:** seeding ran whenever `products` was empty.
- **Fix:** seeding is now part of the first migration and runs once per database (`backend/src/migrations.js`).

## BUG-07: CORS does not allow credentials

- **Steps:** send a preflight request from `http://localhost:5173`.
- **Expected:** `Access-Control-Allow-Credentials: true`, as cookie-based login requires.
- **Actual:** the header is missing, so a browser calling the API directly would drop the session cookie. Requests through the Vite proxy are same-origin and were not affected. Only one origin could be configured as well.
- **Fix:** `credentials: true` and a comma-separated `CORS_ORIGIN` list (`backend/src/app.js`).

## Known issues, not fixed

These are reported rather than changed because they fall outside SCRUM-13 or need a team decision.

- **The login page is not connected yet.** `frontend/src/App.jsx` still answers every sign-in with "Sign-in is temporarily unavailable". The API is ready; see `docs/SCRUM-13_TEAM_NOTES.md`.
- **The cart subtotal includes unavailable lines.** `validateCart` adds out-of-stock and over-stock quantities to `subtotalCents`. Checkout must not charge this number without deciding how to treat those lines.
- **Tax ID and home address are stored as plain text.** They must stay readable for invoices and delivery, so hashing cannot apply. PDF item 17 lists user accounts as sensitive, so the team should decide whether to encrypt them.
- **The login rate limit lives in memory.** It resets on restart, and it counts per IP and email, so trying one password against many emails is not limited.
- **No `package-lock.json` is committed.** CI and every teammate can install different dependency versions.
- **CI does not run when this branch is pushed.** `.github/workflows/checks.yml` only matches `main` and `feature/**` on push. It does run on pull requests.
