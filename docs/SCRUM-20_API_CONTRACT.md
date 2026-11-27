# SCRUM-20: Sprint 3 API contract — review draft

Status: prepared from the merged integration sources on 2026-11-27. **Team agreement is pending. This document is not a sign-off or evidence that the whole sprint is complete.** Examples use fictional data and the existing mock bank only.

`SCRUM-20` is the current Jira task for the shared API/error contract. It corresponds to planning item **S3-14**, owned by the former **SCRUM-12 role**. Planning IDs such as **S3-20** are different: S3-20/S3-21/S3-22 describe the former SCRUM-13 role's checkout/payment/order implementation. Their existing implementation and `docs/S3_CHECKOUT_ORDERS_API.md` retain that attribution.

## 1. Shared rules

- Base path: `/api`. JSON bodies use `Content-Type: application/json`; body limit is 32 KB. Send cookies with `credentials: "include"`. Sessions use `orbit_session`; guest carts use `orbit_guest_cart`. Both are HttpOnly, SameSite=Lax and Secure in production. No bearer token is returned in JSON.
- Roles are exactly `customer`, `product_manager`, `sales_manager`, `support_agent`. A missing/expired session normally returns 401; a disallowed authenticated role returns 403. Public registration always creates a customer, regardless of a supplied role.
- Monetary payload fields ending in `Cents` are integers. Current checkout, order and quote currency is `USD`. **Exception:** catalog query parameters `minPrice`/`maxPrice` are decimal dollar strings, converted to cents by the server.
- Product IDs use `p-NNN` for cart writes. Order IDs are positive integers; order lookup accepts 1–10 decimal digits without a leading zero. Database timestamps are UTC ISO strings.
- Auth, cart, orders, feedback, payment history and catalog reads set `Cache-Control: no-store`; checkout sets it after the customer-role guard. A quote does not reserve inventory or create a payment/order.
- Existing `HttpError` responses flatten details into the JSON body: `{ "error": "message", "fields": { ... }, "code": "...", ... }`. `fields`, `code` and other details are optional; do not assume every failure has a code. Unknown routes return 404. Malformed JSON returns 400; oversized bodies return 413; unexpected failures return 500. Cookie-bearing writes from a disallowed Origin return 403.

### Client error adapter

The integrated client retains HTTP status as `error.status`, the message as `error.message`, the parsed error body as `error.details`, and supplied `code`, `fields`, `items`, `totalCents`, `replayed` as direct error properties. Existing abort/timeout behavior is preserved. `frontend/src/scrum20.api.test.js` verifies the adapter; it does not change the wire response. A network error/timeout is an **unknown checkout outcome**, not proof that payment failed.

```json
{
  "error": "Prices changed since you opened checkout. Please review the new total.",
  "code": "price_changed",
  "totalCents": 13999
}
```

This HTTP 409 should become `error.status === 409`, `error.code === "price_changed"`, `error.totalCents === 13999`, with the complete body retained in `error.details`.

## 2. Authentication and guest-cart merge — IMPLEMENTED

| Method and path | Request | Success | Expected failures |
| --- | --- | --- | --- |
| POST `/auth/register` | Registration object below | 201 `{ user, cartAdjustments }`, session cookie | 400 fields; 409 existing email; 429 rate limit |
| POST `/auth/login` | `{ "email": "customer@example.test", "password": "<test-only-password>" }` | 200 `{ user, cartAdjustments }`, new session cookie | 400 fields; 401 invalid credentials; 429 rate limit |
| GET `/auth/me` | No body; authenticated | 200 `{ user }` | 401 |
| POST `/auth/logout` | No body; may be unauthenticated | 200 `{ "ok": true }`, clears session | Shared errors only |

Registration example (the password text is a placeholder, not a credential):

```json
{
  "name": "Demo Customer",
  "email": "customer@example.test",
  "password": "<test-only-password>",
  "taxId": "0000000000",
  "homeAddress": "1 Example Street, Test City"
}
```

Name: trimmed 2–100 characters; address: trimmed 5–300; tax ID: 10–11 digits. Password: at least 8 characters and at most 72 UTF-8 bytes. Email is trimmed/lowercased, must match the implementation's basic email pattern, and is at most 254 characters. Login requires a nonempty password. Public user objects exclude password/hash and tax ID:

```json
{
  "user": {
    "id": 1, "name": "Demo Customer", "email": "customer@example.test",
    "role": "customer", "homeAddress": "1 Example Street, Test City"
  },
  "cartAdjustments": [
    {
      "productId": "p-101", "name": "Example Headphones",
      "requestedQuantity": 5, "quantity": 3, "reason": "stock"
    }
  ]
}
```

Login/register merge the guest cart into the account cart in the session transaction, then clear the guest cookie. Overlapping quantities are **added**, capped by stock and 20 per product. Account lines have priority at the 40-line cap. Removed products and zero-stock lines are dropped. Adjustments report only reduced/removed quantities; reason is `stock`, `removed`, `bag_limit` or `item_limit`. An unchanged merge returns `[]`. Display adjustments and fetch `/cart` after login; the auth response does not contain the resulting cart. Default limits are 10 failed logins per IP+email/15 minutes and 30 registrations per IP/hour; server configuration can override them.

Sources: `backend/src/auth.js`, `authRoutes.js`, `cartRoutes.js`, `middleware.js`. Existing cart/merge ownership: former SCRUM-14 role, planning S3-25.

## 3. Server cart and quote — IMPLEMENTED

Cart routes work for guests and authenticated users; authenticated users use their own account cart. All successful cart mutations return the complete current `{ items }`, with no price fields.

| Method and path | Request | Success | Expected failures |
| --- | --- | --- | --- |
| GET `/cart` | No body | 200 `{ "items": [] }` or cart below | Shared errors |
| PUT `/cart/items/p-101` | `{ "quantity": 2 }` | 200 cart | 400 bad ID/quantity; 404 missing/deleted product; 409 stock/40-line limit |
| DELETE `/cart/items/p-101` | No body | 200 cart; absent line is harmless | Shared errors |
| POST `/cart/import` | Cart object below | 200 cart | 400 invalid items |
| POST `/cart/validate` | Cart object below | 200 quote, even if unavailable | 400 invalid items |

```json
{ "items": [{ "productId": "p-101", "quantity": 2 }] }
```

`items` accepts 0–40 distinct `p-NNN` IDs; quantity must be an integer 1–20. Use DELETE, not quantity 0. Import is for legacy local carts: it keeps the larger of existing quantity and the stock-capped imported quantity; **it does not add quantities**. Missing/removed or excess new lines are skipped, and no adjustments array is returned by import. Inspect the returned cart.

Quote example:

```json
{
  "valid": true,
  "items": [{
    "productId": "p-101", "name": "Example Headphones", "quantity": 2,
    "stock": 3, "available": true, "reason": null,
    "unitPriceCents": 12999, "lineTotalCents": 25998
  }],
  "subtotalCents": 25998,
  "currency": "USD"
}
```

A missing-product quote line has `available: false`, `reason: "Product not found"`, `unitPriceCents: null`, `lineTotalCents: 0`, and omits `name`/`stock`. Other unavailable reasons are `Out of stock` and `Insufficient stock`. A quote validates the supplied lines; checkout independently reads the authenticated user's **server** cart.

Sources: `backend/src/cartRoutes.js`, `catalog.js`, `app.js`.

## 4. Checkout and replay — IMPLEMENTED BACKEND

Only a `customer` can POST `/checkout`. The payment processor is currently a synchronous mock. The request does not take item lines, a user ID or an authoritative charge amount.

```http
POST /api/checkout
Content-Type: application/json
Idempotency-Key: demo-checkout-0001
```

```json
{
  "payment": {
    "cardNumber": "4242424242424242", "cardHolder": "Demo Customer",
    "expiryMonth": 12, "expiryYear": 2030, "cvc": "123"
  },
  "deliveryAddress": "1 Example Street, Test City",
  "expectedTotalCents": 25998
}
```

`Idempotency-Key` is mandatory, 8–100 ASCII letters/digits/`-`/`_`, unique per intentional attempt. `deliveryAddress` is optional and defaults to the current profile address; its final trimmed value must be 5–300 characters. `expectedTotalCents` is optional but should always be sent by the UI after review; when supplied it must be a safe integer and match the current server total. The server does not use it to set prices.

Card number: string, spaces/hyphens removed, 12–19 digits passing Luhn. Holder: 2–100 trimmed characters. Month: integer 1–12; year: integer 2000–2100 and not expired by UTC month. CVC: string of 3–4 digits. Only the last four digits are stored. Use the documented test cards, never a real card: `4242424242424242` approves, `4000000000000002` declines, `4000000000009995` returns insufficient funds. Keep example expiry dates current in tests.

| Status | Response | Client interpretation |
| --- | --- | --- |
| 201 | `{ order, replayed: false }` | New paid order; cart emptied, stock reduced |
| 200 | `{ order, replayed: true }` | Previously approved attempt; no second charge/order |
| 400 | `{ error, fields? }` | Bad key/card/address/total type, or empty cart |
| 401 / 403 | `{ error }` | Sign-in required / non-customer |
| 402 | `{ error, code: "payment_declined", replayed }` | Decline saved for this key; cart/stock/orders unchanged |
| 409 | `{ error, code: "stock_changed", items? }` | Review current stock; `items` may be absent on a guarded-write conflict |
| 409 | `{ error, code: "price_changed", totalCents }` | Review changed price before another attempt |
| 503 | `{ error }` | Current mock transaction failed and rolled back; retry same attempt/key |

Approved response:

```json
{
  "order": {
    "id": 1, "status": "processing", "createdAt": "2026-11-27T12:00:00.000Z",
    "customerName": "Demo Customer", "deliveryAddress": "1 Example Street, Test City",
    "totalCents": 25998, "currency": "USD",
    "items": [{
      "productId": "p-101", "name": "Example Headphones",
      "unitPriceCents": 12999, "quantity": 2, "lineTotalCents": 25998
    }],
    "payment": { "status": "completed", "amountCents": 25998, "cardLast4": "4242" }
  },
  "replayed": false
}
```

Stock-error example:

```json
{
  "error": "Some items are no longer available in the requested quantity.",
  "code": "stock_changed",
  "items": [{ "productId": "p-101", "name": "Example Headphones", "requested": 2, "available": 1 }]
}
```

### Safe client attempt lifecycle

1. Await cart writes and auth merge, fetch the server cart, validate it, and display the total. Create one key with `crypto.randomUUID()` when the customer explicitly pays. Disable repeat submission while the request is pending.
2. Keep the key for that attempt until its outcome is resolved. A timeout, connection loss or response-parsing failure must not generate a new key or claim that no order exists. Retry the same key and valid original request; after session expiry, sign into the **same account** first.
3. To survive refresh, persist only non-card attempt metadata such as key, account ID and start time. Never persist the card number or CVC. Check `/orders` after recovery; if a retry requires payment data, request re-entry rather than storing it. If the key is lost or the account changes, reconcile the old order outcome before initiating a new payment.
4. On a received 201/200, show that order and refresh `/cart`, catalog list and open product detail. On a received 402, show the decline; a deliberate corrected payment uses a **new** key. A retry with the old key keeps returning the saved decline. On a received 409, re-fetch/review the cart and changed price/stock; use a new key for the newly confirmed attempt.

Implementation limits: lookup is by `(user_id, idempotency_key)`; the request body has no fingerprint. **Address/card validation occurs before replay lookup**, so replay still needs a valid request. Once an approved/declined result exists, changed valid input with the same key returns that result instead of submitting a new purchase. Do not reuse a key for a different cart/payment intention. Replayed approval reads the saved order by ID; it is not a byte-for-byte cached HTTP response. The mock's synchronous transaction assumptions must be redesigned before adding a real asynchronous payment provider.

Sources/credit: former SCRUM-13 role, planning S3-20/S3-21, `backend/src/checkoutRoutes.js`, `checkout.js`, `bank.js`, `orderSchema.js`.

## 5. Orders, invoice JSON and payment history — IMPLEMENTED

| Method and path | Access | 200 response | Expected failures |
| --- | --- | --- | --- |
| GET `/orders` | Customer only | `{ "orders": [order] }`, newest timestamp then ID first | 401/403 |
| GET `/orders/1` | Authenticated owner, product manager or sales manager | `{ "order": order }` | 401; foreign customer/missing order 404; non-owner support agent 403 |
| GET `/orders/1/invoice` | Same as order detail; latest payment must be completed | `{ "invoice": invoice }` | Same as detail; no completed payment 404 |
| GET `/account/payments` | Any authenticated user, own records only | `{ "payments": [paymentRecord] }` | 401 |

`order` is the object in the checkout example. Legacy orders can have null customer/address fields, and `payment` can be null. Status values in the schema are `processing`, `in-transit`, `delivered`; checkout creates `processing`. **There is currently no HTTP operation to advance the status.**

Invoice response example:

```json
{
  "invoice": {
    "number": "INV-000001", "orderId": 1, "issuedAt": "2026-11-27T12:00:00.000Z",
    "customer": { "name": "Demo Customer", "email": "customer@example.test" },
    "deliveryAddress": "1 Example Street, Test City",
    "items": [{ "productId": "p-101", "name": "Example Headphones", "unitPriceCents": 12999, "quantity": 2, "lineTotalCents": 25998 }],
    "totalCents": 25998, "currency": "USD",
    "payment": { "status": "completed", "amountCents": 25998, "cardLast4": "4242" }
  }
}
```

Order name/address/product names/prices are purchase-time snapshots. Invoice email is currently read from the user's present database record, **not snapshotted**. This endpoint returns JSON, not PDF or email-delivery status.

Payment-history response example (this older endpoint has a different item shape):

```json
{
  "payments": [{
    "id": 1, "orderId": 1, "amountCents": 25998, "currency": "USD", "status": "completed",
    "createdAt": "2026-11-27T12:00:00.000Z",
    "items": [{ "productId": "p-101", "name": "Example Headphones", "unitPriceCents": 12999, "quantity": 2 }]
  }]
}
```

Payment history does not include order delivery status, `cardLast4` or `lineTotalCents`. Schema payment statuses are `pending`, `completed`, `failed`, `refunded`; current checkout only creates completed payment rows. A declined attempt does not create a failed payment row.

Sources/credit: order/invoice JSON, former SCRUM-13 role (planning S3-22), `orderRoutes.js`, `orders.js`; older payment history, former SCRUM-14 role, `shopRoutes.js`.

## 6. Product feedback — IMPLEMENTED, moderation still absent

For an existing active product, GET `/products/p-101/feedback` is public. Missing/deleted products return 404. Example for a signed-in customer with an eligible delivered purchase and no previous review:

```json
{
  "likes": 0, "liked": 0, "reviews": [],
  "eligibility": { "eligible": true, "reason": null },
  "canReview": true, "reviewReason": null, "canRate": true,
  "rating": { "average": null, "count": 0, "myRating": null }
}
```

`liked` is currently numeric 0/1, including on review records. Each review is `{ "id": 1, "body": "Useful product.", "createdAt": "2026-11-27T12:00:00.000Z", "author": "Demo Customer", "likes": 0, "liked": 0 }`; reviews are newest ID first. Eligibility reasons are `sign_in_required`, `purchase_required`, `delivery_required` or null. Eligible means the user has an order containing this product with status `delivered` and a completed payment. Existing review changes `canReview` to false and `reviewReason` to `already_reviewed`.

| Method and path | Request | Success | Expected failures |
| --- | --- | --- | --- |
| PUT `/products/p-101/feedback/rating` | `{ "value": 5 }` | 200 `{ "rating": { "average": 5, "count": 1, "myRating": 5 } }` | 400 noninteger/outside 1–5; 401; 403 ineligible; 404 product |
| POST `/products/p-101/feedback/reviews` | `{ "body": "Useful product." }` | 201 `{ "ok": true }` | 400 empty/>2000 trimmed characters; 401; 403 ineligible; 404 product; 409 already reviewed |
| PUT `/products/p-101/feedback/like` | `{ "liked": true }` | 200 `{ "ok": true }` | 400 nonboolean; 401; 404 product |
| PUT `/products/p-101/feedback/reviews/1/like` | `{ "liked": false }` | 200 `{ "ok": true }` | 400 nonboolean; 401; 404 product/review |

All writes require authentication; rating/review writes additionally check purchase eligibility, not a separate customer-role guard. Likes require no purchase. One rating exists per user/product: another PUT updates it without increasing count. Ratings appear immediately; average is arithmetic, not rounded by the server. **Current review POST/GET publish comments immediately. There is no pending/approval status or moderator endpoint yet.** Do not describe this as completed moderation.

Sources/credit: former SCRUM-14 role, planning S3-28/S3-29, `shopRoutes.js`, `feedback.js`, `shopSchema.js`.

## 7. Catalog — IMPLEMENTED

GET `/categories` returns 200 `{ "categories": [{ "slug": "audio", "name": "Audio", "productCount": 1 }] }`. Counts include active products regardless of stock. GET `/products` returns `{ "products": [product] }`; GET `/products/p-101` returns `{ "product": product }` or 404. All are public and exclude soft-deleted products.

```http
GET /api/products?search=headphones&category=audio&sort=price-asc&minPrice=10.00&maxPrice=200&inStock=true
```

Search: at most 100 characters, trimmed literal name/description substring; `%`, `_`, `!` are escaped. Category: `all` (default) or 1–30 lowercase letters/hyphens. Sort: `popular` (default), `price-asc`, `price-desc`, `name`. `inStock`: string `true`/`false`, default false. Prices: 1–7 digits, optionally 1–2 decimal places, nonnegative, minimum ≤ maximum. Invalid filters return 400. Unknown well-formed categories yield an empty list. Filtering and sorting happen on the server; no pagination is currently applied.

Public product example:

```json
{
  "product": {
    "id": "p-101", "name": "Example Headphones", "brand": "Demo Brand", "model": "DEMO-1",
    "serialNumber": "DEMO-0001", "description": "Example audio product.", "stock": 3,
    "priceCents": 12999, "warrantyMonths": 24, "warrantyStatus": "Active",
    "distributor": "Demo Distributor", "popularity": 90,
    "imageKey": "headphones", "accent": "violet", "categorySlug": "audio", "categoryName": "Audio"
  }
}
```

The nine required business fields are ID, name, model, serial number, description, stock, price, warranty status and distributor. `popularity` is the stored catalog metric; checkout does not increment it, and ratings do not replace it. Current sort expressions are popularity descending/name ascending, price ascending or descending/name ascending, and name case-insensitive ascending. Do not claim a further equal-name tie-break unless it is added and tested during regression work.

Existing manager operations: POST `/products` is product-manager-only, returning 201 `{ product }` plus `Location`; DELETE `/products/:id` is product-manager-only, returning 200 `{ "deleted": true, "id": "p-101" }` or 404. Both return 401/403 on authorization failure. Creation accepts the public product fields except server-assigned `id`, `popularity`, `categoryName`; optional `costCents` defaults to half price rounded down and is returned only in the creation response. Required strings, numeric ranges, existing category and art values are validated in `productAdmin.js`; invalid input is 400 with fields, duplicate active serial/exhausted IDs is 409. There is no general update route.

Sources: `backend/src/app.js`, `catalog.js`, `catalogFilters.js`, `productAdminRoutes.js`, `productAdmin.js`. Existing catalog/filter integration credit: former SCRUM-12 role; product administration/authentication changes: former SCRUM-13 role; catalog foundation and database work retain their existing Git history attribution.

## 8. PROPOSED — NOT IMPLEMENTED; owners must agree before use

These names and payloads are review proposals, **not callable contracts**. None of these features is supplied by this document. The current server has no matching implementation; an authenticated caller generally receives 404. Prefixes/roles/errors must be confirmed by the listed former role owners and recorded against actual Jira tasks.

| Proposed endpoint | Proposed request and success | Proposed access/errors | Former role owner / planning item |
| --- | --- | --- | --- |
| GET `/admin/deliveries` | 200 `{ "orders": [] }` using order detail fields including address/items | Product manager; 401/403 | SCRUM-13 / S3-23; UI SCRUM-10 / S3-06 |
| PATCH `/orders/1/status` | `{ "status": "in-transit" }` → 200 `{ "orderId": 1, "status": "in-transit", "deliveredAt": null }` | Product manager; 400 bad value, 401/403, 404 missing, 409 `invalid_order_transition` | SCRUM-13 / S3-23 |
| GET `/orders/1/invoice.pdf` | 200 `application/pdf`, download named `INV-000001.pdf` | Same access as invoice JSON; 401/403/404 | SCRUM-14 / S3-26; access coordination SCRUM-13 / S3-22 |
| GET `/orders/1/invoice-email` | 200 `{ "orderId": 1, "status": "pending", "attempts": 0, "lastAttemptAt": null, "sentAt": null }` | Customer owner or sales manager; 401/403/404 | SCRUM-14 / S3-27 |
| POST `/orders/1/invoice-email/retry` | No body → 202 `{ "orderId": 1, "status": "pending" }`; never calls checkout | Customer owner or sales manager; 401/403/404; 409 `email_job_active` | SCRUM-14 / S3-27 |
| GET `/admin/reviews?status=pending` | 200 `{ "reviews": [] }`, including review ID/product/author/body/status/creation time | Product manager; 400 bad status, 401/403 | SCRUM-14 / S3-30; UI SCRUM-11 / S3-10 |
| PATCH `/admin/reviews/1` | `{ "status": "approved" }` → 200 `{ "review": { "id": 1, "status": "approved", "moderatedBy": 2, "moderatedAt": "2026-11-27T12:00:00.000Z" } }` | Product manager; 400 bad status, 401/403/404, 409 `review_already_decided` | SCRUM-14 / S3-30 |

Proposed delivery rules: only `processing → in-transit → delivered`, record delivery time, reject reverse/skipped transitions. Proposed mail states: `pending`, `sent`, `failed`; retry only a failed job and rate-limit independently of payment. A provider message ID must not expose credentials. Proposed moderation: new comments become `pending`; public GET returns only approved comments; POST then returns 201 `{ "review": { "id": 1, "status": "pending" } }`. This is a deliberate future change to today's `{ ok: true }` response, requiring client updates. Rating visibility stays immediate. Migration of existing reviews and exact mail authorization/idempotency are unresolved decisions, not silently assumed policies.

## 9. Schema and sign-off boundary

Current schema is **v6**: v4 cart/order/payment/review tables, v5 checkout/order snapshots/idempotency, v6 product ratings. The next migration number is **7**; coordinate its reservation with the former SCRUM-15 database role and do not edit historical migrations. Delivery timestamps, email jobs and moderation fields are not present yet.

The checkout team's original API document is retained. Its stale next-migration and delivered-eligibility notes now reflect the merged v6/rating behavior, and its invoice notes disclose the current live email lookup. These documentation corrections do not reassign implementation credit.

SCRUM-20 can be described as a prepared and verified contract proposal once adapter checks pass. Its “agreed by the team” criterion remains open until owners confirm the implemented and proposed interfaces. This work does not complete SCRUM-21 checkout UI integration, SCRUM-25 full demo tests or SCRUM-26 release.
