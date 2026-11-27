# Sprint 3 — Shared integration baseline

This branch combines SCRUM-12's connected catalog with the team's server cart,
checkout/order API, cart merge corrections and delivered-purchase rating API.
The checkout form, order-status management, comment moderation and PDF/email delivery
are still pending. This is an integration baseline, not a completed progress demo.

[SCRUM-19 integration and ownership](docs/SCRUM-19_INTEGRATION.md)

[SCRUM-20 implemented/proposed API contract](docs/SCRUM-20_API_CONTRACT.md)
and [pending team decisions](docs/SCRUM-20_REVIEW_CHECKLIST.md).

```sh
npm ci
npm run dev
```

Node.js 24 önerilir. Mağaza: **http://localhost:5173/**.

**Senin kapsamını ekranda göster:** http://localhost:5173/?scrum12=1
**Demo rehberi:** http://localhost:5173/scrum12.html

[SCRUM-12 geçmiş kapsamı](docs/SCRUM-12_TEAM_NOTES.md) · [Güncel entegrasyon testleri](docs/SCRUM-19_TEST_RESULTS.md) · [API sözleşmesi testleri](docs/SCRUM-20_TEST_RESULTS.md)

Testler: `npm test`, `npm run build`, ardından `npx playwright install chromium` ve `npm run test:e2e`.

Aşağıdaki bölüm temel projenin mevcut özelliklerini açıklar; tamamı SCRUM-12 katkısı değildir.

---
# Orbit Store — CS308 Online Store Project

A working starter storefront for **Sabancı University CS308 Software Engineering**.
Developed in two-week Scrum sprints, based on the supplied course-project specification.

## Tech stack (from course suggested list)

- **Frontend:** React + Vite (JavaScript, responsive CSS)
- **Backend:** Node.js + Express (REST API)
- **Database:** SQLite (via better-sqlite3), with persistent local inventory

This is an *initial increment*, not the completed assignment.

## Local setup

Install **Node.js 22 LTS or later** and npm. Run these commands from the project folder.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` requests to **http://localhost:4000**.
The backend creates and seeds a SQLite file in `backend/data/store.sqlite` on first startup.

No separate SQLite server is required. To customize the API port/database path,
copy `backend/.env.example` to `backend/.env` and edit it. If you change PORT,
also update the Vite proxy target in `frontend/vite.config.js`.

To get one local account per role, set `DEMO_USERS_PASSWORD` in `backend/.env`.
See [SCRUM-13 team notes](docs/SCRUM-13_TEAM_NOTES.md).

> Never commit `.env` files, database files, credentials, or actual customer/payment data.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend + backend together |
| `npm run test` | Run backend and frontend tests |
| `npm run build` | Build the frontend for production |
| `npm run start:api` | Run only the backend |
| `npm run dev --workspace @cs308/frontend` | Run only React |
| `npm run dev --workspace @cs308/backend` | Run only API |

## Implemented in the integrated baseline

- Browse products and categories from the database.
- Search product **names and descriptions**; sort by popularity, name, or price.
- See stock quantities and keep sold-out products searchable but not addable.
- View product detail with **ID, name, model, serial number, description,
  quantity in stock, price, warranty status, distributor**.
- Add, change or remove cart items while signed out. SQLite stores the cart, and an
  HttpOnly cookie identifies it. Sign-in merges the guest cart into the account cart.
- Like products and published reviews after signing in. A paid, delivered purchase permits one review per product.
- Product managers can approve or reject submitted reviews. The product page only shows approved reviews.
- Create orders through the checkout API, with atomic stock changes and idempotent mock payment.
- Read order history and invoice JSON through authorized APIs; submit 1-5 ratings for delivered purchases.
- View your payment records and purchased items under My profile.
- Check cart price and current inventory using the backend (no stock reservation).
- Responsive frontend, working API, separate tests and documented architecture.
- Backend for registration, login, logout and role checks with hashed passwords and server-side sessions.
- Backend for product managers to add and remove products.

## Important: not built yet

The checkout, order-history, star-rating and review moderation screens, delivery status
updates, wish lists, returns/refunds,
sales/product manager dashboards, and live support chat are **not yet implemented**.
The interface explicitly says checkout is unavailable; the backend API is implemented
but has not yet been connected to a checkout screen.
Implement and test these against the requirement list before the progress/final demos.

The progress demo specifically expects features **1, 3, 4, 5, 7, 9**.
See [Architecture](docs/ARCHITECTURE.md), [Sprint Backlog](docs/SPRINT_BACKLOG.md),
[Bug Reports](docs/BUG_REPORTS.md) and [SCRUM-13 team notes](docs/SCRUM-13_TEAM_NOTES.md).

## API overview

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/health` | API health |
| GET | `/api/categories` | Categories with product counts |
| GET | `/api/products?search=&category=&sort=` | Catalog search/filter/sort |
| GET | `/api/products/:id` | Full product detail |
| GET | `/api/cart` | Current guest or account cart |
| PUT / DELETE | `/api/cart/items/:productId` | Set quantity or remove a cart item |
| GET | `/api/products/:id/feedback` | Product likes, reviews and review eligibility |
| POST | `/api/products/:id/feedback/reviews` | Submit a review for approval after a paid, delivered purchase |
| GET | `/api/admin/reviews?status=pending` | Read the review queue (product manager) |
| PATCH | `/api/admin/reviews/:id` | Approve or reject a pending review (product manager) |
| PUT | `/api/products/:id/feedback/like` | Set product like status |
| PUT | `/api/products/:id/feedback/reviews/:reviewId/like` | Set review like status |
| GET | `/api/account/payments` | Signed-in account payment history |
| POST | `/api/cart/validate` | Validate guest cart stock/price; **not checkout** |
| POST | `/api/auth/register` | Create a customer account and sign in |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | End the current session |
| GET | `/api/auth/me` | Current user, 401 when signed out |
| POST | `/api/products` | Add a product (product manager) |
| DELETE | `/api/products/:id` | Remove a product (product manager) |
| POST | `/api/checkout` | Pay for the account cart with the mock bank (customer, `Idempotency-Key` header) |
| GET | `/api/orders` | Signed-in customer's order history |
| GET | `/api/orders/:id` | One order (owner, product or sales manager) |
| GET | `/api/orders/:id/invoice` | Invoice data for one paid order |
| GET | `/api/orders/:id/invoice.pdf` | Download the PDF invoice for a paid order |
| GET | `/api/orders/:id/invoice/email` | Read invoice email status |
| POST | `/api/orders/:id/invoice/email/retry` | Queue another attempt for a failed email |

Checkout and order details: [docs/S3_CHECKOUT_ORDERS_API.md](docs/S3_CHECKOUT_ORDERS_API.md).

Successful login and registration return `cartAdjustments` alongside `user`. If a guest
cart was merged, each adjusted line includes `productId`, `name`, `requestedQuantity`,
`quantity` (zero when removed), and a `reason`: `stock`, `removed`, `item_limit`, or
`bag_limit`. The storefront shows these changes after sign-in.

Migration 4 adds `orders`, `order_items` and `payments`, and checkout (migration 5) now
fills them. Product names and unit prices are kept in `order_items` for history, and a
completed payment is recorded when the order has been paid. The history screen shows an
empty state until the signed-in account has payment records.

Query sorts: `popular`, `price-asc`, `price-desc`, and `name`.

Example:
```bash
curl "http://localhost:4000/api/products?search=wireless&sort=price-asc"
curl -X POST http://localhost:4000/api/cart/validate \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"p-101","quantity":2}]}'
```

## Team workflow

Create a feature branch per story, add tests, open a pull request, and review before
merging into `main`. Do not push unfinished development directly to `main`.
Meaningful commit history, bug reports, sprint backlog items, and unit tests matter
for course grading. Each team member should be able to explain the code they contributed.

*The source document permits AI assistance but requires students to understand and verify it.*

## S3-28 and S3-29 feedback contract

Migration 6 adds product ratings while preserving existing reviews. Feedback requires an
order belonging to the signed-in user that contains the product, has status
`delivered`, and has a completed payment for that same order. New comments and every
rating update use the shared eligibility rule.

`GET /api/products/:id/feedback` includes:

- `eligibility: { eligible, reason }`, where reason is `sign_in_required`,
  `purchase_required`, `delivery_required`, or null.
- `canReview` and `reviewReason` (also `already_reviewed` for an existing comment).
- `myReviewStatus` for the signed-in user's own review, or `null`.
- `canRate` and `rating: { average, count, myRating }`. An unrated product returns
  `{ average: null, count: 0, myRating: null }`.

`PUT /api/products/:id/feedback/rating` accepts `{ "value": 4 }` and returns
`{ rating: { average, count, myRating } }`. Values must be integers from 1 to 5.
One row per user/product is inserted or updated, so retries and edits preserve the count.
Public averages include ratings immediately, independently of comments and likes.

Product feedback displays the API's eligibility reason. Star forms and summary displays
remain integration points for S3-05 and S3-09. Live delivery verification depends on
S3-23; tests set order states in isolated databases. Migration 6 must be coordinated with
the S3-31 schema owner before integration with other new migrations.
