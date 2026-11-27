import { HttpError } from "./errors.js";

export function invoiceNumber(orderId) {
  return `INV-${String(orderId).padStart(6, "0")}`;
}

export function invoiceForOrder(db, order) {
  if (order?.payment?.status !== "completed") throw new HttpError(404, "This order has no invoice.");
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
