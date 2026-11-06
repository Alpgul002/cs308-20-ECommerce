# Architecture & decisions

## Request path

```text
Browser (React / Vite :5173)
    |
    |  GET /api/products , /api/categories
    |  POST /api/cart/validate
    v
Vite development proxy
    |
    v
Node.js / Express API (:4000)
    |
    v
SQLite database (backend/data/store.sqlite)
```

The frontend always loads the catalog from the API; UI filters are applied to the
loaded catalog for instant interaction. The API independently exposes server-side
category/search/sort endpoints for other clients and future pagination. Do not treat
browser calculations as authoritative checkout totals.

## Data model

Schema changes go through versioned migrations in `backend/src/migrations.js`.

- `categories(slug PK, name)`
- `products(id PK, category_slug FK, name, brand, model, serial_number, description,
   stock, price_cents, cost_cents, warranty_months, warranty_status, distributor, popularity,
   image_key, accent, deleted_at)`
- `users(id PK, name, email UNIQUE, tax_id, home_address, password_hash, role, created_at)`
- `sessions(token_hash PK, user_id FK, created_at, expires_at)`

Removing a product sets `deleted_at` and keeps the row, so orders and refunds can still
resolve it and its ID is never reused.

`price_cents` is an integer, never a floating-point money value. Stock is
constrained nonnegative. Seed data is fake demo content; serial numbers are
demo *model identifiers*, not one serial per physical unit.

`POST /api/cart/validate` checks product IDs, unique line items, integer quantities
(1–20), prices, and stock. It DOES NOT reserve stock, process cards, or place orders.
The guest cart is local to the current browser.

## Authentication and authorization

- Passwords are hashed with bcrypt at 12 rounds. The plaintext is never stored.
- A session is a random 32-byte token in an HttpOnly, SameSite=Lax cookie (Secure in
  production). The `sessions` table stores only its SHA-256, and it expires after 7 days.
- `requireRole` checks the role server-side on each request, reading the user fresh from the
  database. Public sign-up only creates customers and ignores any role in the request.
- Login gives one message for a wrong password and an unknown email, runs bcrypt in both
  cases and rate limits failures per IP and email.
- A state-changing request that carries a session cookie must come from an origin in
  `CORS_ORIGIN`.

## Future architecture / constraints from specification

### Authentication and authorization
- Migrate guest cart into the signed-in cart without losing products.

### Checkout and concurrency
- Order creation requires authentication.
- Use atomic stock updates within a DB transaction. Conditional updates must
  verify `stock >= quantity` to prevent overselling across concurrent requests.
- Snapshot unit sale price on each order item; never use today's price to issue
  historical refunds or invoices.
- Use a **mock payment service**: do not store actual credit card numbers or CVVs.
  For any future real integration, use payment tokenization with a compliant provider.
- Create order + delivery tasks; status: processing -> in-transit -> delivered.
- Only processing orders may be cancelled. Only delivered orders may be returned
  subject to the 30-day purchase window; the sales manager approves refunds.

### Roles and workflows
- Ratings/comments require a delivered purchase. Publish rating immediately;
  moderate comment through product-manager approval.
- Product managers: categories, products, inventory, shipping status, moderation.
- Sales managers: price/discounts, wishlist notifications, invoices, reports.
- Support agents: real-time chat for guests/authenticated users, with attachments
  and authenticated-order context.
- Implement your own managerial UI (not an out-of-the-box Django admin screen).
- Generate an invoice for confirmed purchases; display it and email a PDF.
- Test security, input validation, inventory concurrency, and role boundaries.

### Scaling decision
SQLite makes the first increment runnable without Docker or an external database.
The assignment requires concurrency; before simultaneous production-like demo tests,
evaluate moving this schema to PostgreSQL, also suggested by the course. Database
writes must stay transactional either way.

## Known omissions and demo scope

The current increment supports a starter subset of requirements **1, 2, 6, 7, 9**,
the guest-cart portions of **4**, the login backend and connected login/profile UI,
and product add/remove from **12**. No actual order/delivery tracking (#3) or
payment/invoice (#4) exists yet.
