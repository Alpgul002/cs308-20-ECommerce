# SCRUM-15 — database integration and customer profile

## Branch and baseline

- Working branch: `feature/scrum15`
- Base branch: `scrum13-backend`
- Runtime: Node.js + Express 5, SQLite via `better-sqlite3`, React + Vite.
- Local database: `backend/data/store.sqlite` (ignored by Git).

## Database decisions

The existing database layer is retained. `backend/src/db.js` creates the local data
directory, enables SQLite foreign keys and WAL mode, and runs versioned migrations.
Schema history remains in `backend/src/migrations.js`, tracked with
`PRAGMA user_version`. Existing migration history must not be rewritten.

No schema migration is needed for the customer profile: the current `users` table
already stores `name`, `email`, and `home_address`. The API maps those database
columns to the safe JSON user object (`name`, `email`, `homeAddress`) and never
returns password hashes or tax IDs.

Continue to add schema changes only by appending the next migration. Keep money in
integer cents, timestamps in ISO 8601 text, and local SQLite files out of Git.

## Login and profile integration

- The frontend checks `GET /api/auth/me` on startup to restore an existing session.
- Sign in posts to `POST /api/auth/login`; the HttpOnly session cookie is used for
  subsequent requests.
- The profile screen displays the signed-in user's name, email address, and home
  address, matching CS308 requirement 14.
- Sign out posts to `POST /api/auth/logout`, which revokes the server-side session.

The profile is intentionally read-only in this increment. The course specification
requires customers to view these fields; it does not require profile editing.

## Verification

- Backend unit and API tests: `npm run test --workspace @cs308/backend`
- Full workspace tests: `npm test`
- Frontend production build: `npm run build --workspace @cs308/frontend`
- `backend/test/profile.test.js` checks that a registered customer profile and its
  session remain available after the same SQLite file is closed and reopened, and
  that private fields are not exposed by the profile API.
