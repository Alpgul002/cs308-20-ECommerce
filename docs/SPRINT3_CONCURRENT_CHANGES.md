# Concurrent team changes observed on 2026-11-27

These branches appeared while SCRUM-19/20 verification was in progress. They remain
outside this pinned baseline; no claim of their runtime or email-delivery verification
is made here. They should be reviewed in the next integration, not reimplemented.

| Branch and head | Read-only finding |
| --- | --- |
| `feature/s3-26-invoice-pdf` at `c15236e14325035e794a7d09f17135a7a32a6526` | Adds PDF generation/protected download route/tests and a payment-history PDF link above the checkout branch |
| `feature/s3-27-invoice-email` at `d1d184f8cc5c2edf1ca8c989fe3f8ebf01ccbe92` | Includes PDF and delivered-rating ancestry; adds email queue/worker/status/retry and migration v7; does not include the cart-merge sibling |

Email routes there are `/api/orders/:id/invoice/email` and
`/api/orders/:id/invoice/email/retry`. The earlier proposed `/invoice-email` routes
in this contract must be reconciled with the existing implementation before use.
Migration **v7 is already occupied**. The database owner must coordinate the next
unused version and preserve both cart-merge and email behavior in the next merge.

Both branches retain the prior `App.jsx` checkout placeholder. Neither supplies the
missing checkout submission/confirmation screen. Therefore SCRUM-21 and the full
checkout-success UI acceptance in SCRUM-24 remain pending.

This coordination note is part of SCRUM-20. It is not a third completed Jira task
and does not claim the newly arrived teammate implementations as Ozan's contribution.
