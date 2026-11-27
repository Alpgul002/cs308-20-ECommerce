import { Router } from "express";
import { ROLES } from "./auth.js";
import { HttpError } from "./errors.js";
import { renderInvoicePdf } from "./invoicePdf.js";
import { requireAuth, requireRole } from "./middleware.js";
import { getOrder, listOrdersForUser } from "./orders.js";

// PDF items 11 and 12: product managers handle deliveries and sales managers invoices,
// so both may open any order. Support agents get customer context in a later sprint.
const STAFF_READERS = new Set([ROLES.PRODUCT_MANAGER, ROLES.SALES_MANAGER]);

export function invoiceNumber(orderId) {
  return `INV-${String(orderId).padStart(6, "0")}`;
}

export function createOrderRouter(db) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // A customer only ever sees their own orders. Someone else's order answers 404, not 403,
  // so order IDs cannot be probed for existence.
  function readableOrder(req) {
    const found = /^[1-9][0-9]{0,9}$/.test(req.params.id) ? getOrder(db, Number(req.params.id)) : null;
    const isOwner = found && found.userId === req.user.id;
    if (!isOwner && req.user.role === ROLES.CUSTOMER) throw new HttpError(404, "Order not found.");
    if (!isOwner && !STAFF_READERS.has(req.user.role)) throw new HttpError(403, "You do not have permission to do this.");
    if (!found) throw new HttpError(404, "Order not found.");
    return found.order;
  }

  router.get("/", requireRole(ROLES.CUSTOMER), (req, res) => {
    res.json({ orders: listOrdersForUser(db, req.user.id) });
  });

  router.get("/:id", requireAuth, (req, res) => {
    res.json({ order: readableOrder(req) });
  });

  function readableInvoice(req) {
    const order = readableOrder(req);
    if (order.payment?.status !== "completed") throw new HttpError(404, "This order has no invoice.");
    const { email } = db.prepare("SELECT u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?").get(order.id);
    return {
      number: invoiceNumber(order.id),
      orderId: order.id,
      issuedAt: order.createdAt,
      customer: { name: order.customerName, email },
      deliveryAddress: order.deliveryAddress,
      items: order.items,
      totalCents: order.totalCents,
      currency: order.currency,
      payment: order.payment
    };
  }

  router.get("/:id/invoice", requireAuth, (req, res) => {
    res.json({ invoice: readableInvoice(req) });
  });

  router.get("/:id/invoice.pdf", requireAuth, async (req, res) => {
    const invoice = readableInvoice(req);
    const pdf = await renderInvoicePdf(invoice);
    res.attachment(`${invoice.number}.pdf`).send(pdf);
  });

  return router;
}
