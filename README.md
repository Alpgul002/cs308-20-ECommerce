# Orbit Store — CS308 Online Store Project

A working starter storefront for **Sabancı University CS308 Software Engineering**.
Developed in two-week Scrum sprints, based on the supplied course-project specification.

## Tech stack (from course suggested list)

- **Frontend:** React + Vite (JavaScript, responsive CSS)
- **Backend:** Node.js + Express (REST API)
- **Database:** SQLite (via better-sqlite3), with persistent local inventory

This is an *initial increment*, not the completed assignment.

## Local setup

Install **Node.js 22 LTS or later** and npm, then clone the repository.

```bash
git clone https://github.com/Alpgul002/cs308-20-ECommerce.git
cd cs308-20-ECommerce
# When the feature branch is not yet merged:
git switch feature/sprint-1-store-foundation

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

## Functional in Sprint 1 starter

- Browse products and categories from the database.
- Search product **names and descriptions**; sort by popularity, name, or price.
- See stock quantities and keep sold-out products searchable but not addable.
- View product detail with **ID, name, model, serial number, description,
  quantity in stock, price, warranty status, distributor**.
- Add/change/remove items in a **guest cart** persisted to browser `localStorage`.
- Check cart price and current inventory using the backend (no stock reservation).
- Responsive frontend, working API, separate tests and documented architecture.
- Backend for registration, login, logout and role checks with hashed passwords and server-side sessions.
- Backend for product managers to add and remove products.

## Important: not built yet

Connecting the login page to the API, orders, stock-decrement transaction,
mock banking, invoice emails/PDF, ratings/comments and approval, wish lists, returns/refunds,
sales/product manager dashboards, and live support chat are **not yet implemented**.
The interface explicitly says checkout is unavailable; it does **not** simulate a successful order.
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
| POST | `/api/cart/validate` | Validate guest cart stock/price; **not checkout** |
| POST | `/api/auth/register` | Create a customer account and sign in |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | End the current session |
| GET | `/api/auth/me` | Current user, 401 when signed out |
| POST | `/api/products` | Add a product (product manager) |
| DELETE | `/api/products/:id` | Remove a product (product manager) |

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
