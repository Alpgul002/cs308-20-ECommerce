# CS308 Sprint Backlog (working plan)

The course uses **2-week overlapping sprints** and expects a release each
other week. Progress demo (Week 11) requires features **1, 3, 4, 5, 7, 9**;
final demo requires all features. This is an initial team plan, not a claim
that unchecked items are complete.

## Sprint 1 — Foundation and catalog

- [x] S1-01 Select stack and document local setup.
- [x] S1-02 Initialize GitHub repository and feature-branch workflow.
- [x] S1-03 Create Node/Express backend skeleton.
- [x] S1-04 Create SQLite schema with product properties.
- [x] S1-05 Seed representative categories and electronics products.
- [x] S1-06 Build health, category, product list, and detail API.
- [x] S1-07 Add server-side search, sorting, and category filtering.
- [x] S1-08 Create responsive React storefront.
- [x] S1-09 Build category search/filter/sorting controls.
- [x] S1-10 Build detailed product view and live stock labels.
- [x] S1-11 Implement persistent guest cart and quantity controls.
- [x] S1-12 Validate cart prices/availability against backend.
- [x] S1-13 Add initial automated tests and project documentation.
- [ ] S1-14 Verify clean npm installation on each teammate's computer.
- [ ] S1-15 Review accessibility, keyboard navigation, and mobile widths.
- [ ] S1-16 Run sprint review/retro and log discovered defects.

## Sprint 2 — Customers, checkout, and order delivery

- [ ] S2-01 Design customer, orders, order-items, and delivery schema.
- [x] S2-02 Implement registration with password hashing and validation (backend).
- [x] S2-03 Implement login/logout and secure server-side sessions (backend).
- [ ] S2-04 Implement guest-cart migration after login.
- [ ] S2-05 Implement transactional checkout with stock decrement.
- [ ] S2-06 Add mock bank payment response (no real card storage).
- [ ] S2-07 Generate order receipt/invoice after confirmed payment.
- [ ] S2-08 Generate invoice PDF and email to registered customer.
- [ ] S2-09 Build order history and order-status UI.
- [ ] S2-10 Test concurrent checkouts with last remaining stock.
- [x] S2-11 Add versioned database migrations (SCRUM-13).
- [x] S2-12 Add server-side role checks for the four roles (SCRUM-13).
- [x] S2-13 Add product-manager product add/remove endpoints (SCRUM-13).
- [x] S2-14 Add login, role and product API tests (SCRUM-13).
- [x] S2-15 Report and fix backend defects, see BUG_REPORTS.md (SCRUM-13).
- [ ] S2-16 Connect the login page to the login API.

## Sprint 3 — Progress demo completion

- [ ] S3-01 Build delivered-purchase-only ratings endpoint/UI.
- [ ] S3-02 Build comment submission and moderation queue.
- [ ] S3-03 Implement visible approved comments and immediate star ratings.
- [ ] S3-04 Implement customer profile page with name/email/address.
- [ ] S3-05 Add wishlist schema and browsing interaction.
- [ ] S3-06 Add product-manager stock/order-status controls.
- [ ] S3-07 Verify progress demo features 1, 3, 4, 5, 7, 9 end-to-end.
- [ ] S3-08 Report and triage reproducible defects from integration tests.

## Sprint 4 — Role-specific dashboards and refunds

- [ ] S4-01 Implement sales-manager price and discount tools.
- [ ] S4-02 Implement wishlist discount notifications.
- [ ] S4-03 Add invoice filtering and PDF export for sales manager.
- [ ] S4-04 Implement sales revenue/profit charts and date ranges.
- [ ] S4-05 Complete product-manager category/product inventory actions.
- [ ] S4-06 Implement cancellation and selective refund requests.
- [ ] S4-07 Add sales approval, restocking, and refund notification.
- [ ] S4-08 Add authorization tests for every manager endpoint.

## Sprint 5 — Support and final hardening

- [ ] S5-01 Build real-time support chat for guests/customers.
- [ ] S5-02 Support file attachments with size/type validation.
- [ ] S5-03 Add support-agent conversation queue/claiming.
- [ ] S5-04 Show authorized order/cart/customer context to agents.
- [ ] S5-05 Add security regression tests and load/concurrency checks.
- [ ] S5-06 Perform full demo rehearsal and cross-browser tests.
- [ ] S5-07 Complete bug reports and check accessibility issues.
- [ ] S5-08 Complete release docs and final demo acceptance checklist.

## Grading-related tracking

The PDF lists, **per demo**: at least 5 substantive commits *per member*,
25 new unit tests, 5 new bug reports, and 30 sprint backlog items.
Those are minima, not incentives for meaningless commits/tests. Keep issues,
tests, and actual work evidence tied to real requirements.
