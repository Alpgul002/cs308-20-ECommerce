import { HttpError } from "./errors.js";

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

function findAttempt(db, userId, idempotencyKey) {
  const row = db.prepare(`
    SELECT outcome, order_id AS orderId, decline_reason AS declineReason
    FROM checkout_attempts WHERE user_id = ? AND idempotency_key = ?
  `).get(userId, idempotencyKey);
  return row ? { outcome: row.outcome, orderId: row.orderId, declineReason: row.declineReason } : null;
}

function readCartLines(db, userId) {
  return db.prepare(`
    SELECT ci.cart_id AS cartId, ci.product_id AS productId, ci.quantity,
           p.name, p.price_cents AS unitPriceCents, p.stock, p.deleted_at IS NULL AS active
    FROM carts c
    JOIN cart_items ci ON ci.cart_id = c.id
    JOIN products p ON p.id = ci.product_id
    WHERE c.user_id = ?
    ORDER BY ci.rowid
  `).all(userId);
}

/**
 * Turns the customer's server-side cart into a paid order, all inside one IMMEDIATE
 * transaction: nobody else can change stock between the check and the write, and any
 * error rolls back stock, order, payment and cart together.
 *
 * charge({ amountCents }) must return { approved, cardLast4, declineReason }. It runs
 * before anything is written, so a declined payment never touches stock or orders.
 * The mock bank is synchronous; a real, asynchronous bank would need authorize/capture.
 */
export function placeOrder(db, { userId, idempotencyKey, customerName, deliveryAddress, expectedTotalCents, charge }) {
  return db.transaction(() => {
    // A retry with the same key returns the first outcome and never charges again.
    const previous = findAttempt(db, userId, idempotencyKey);
    if (previous) return { ...previous, replayed: true };

    const lines = readCartLines(db, userId);
    if (!lines.length) throw new HttpError(400, "Your bag is empty.");

    const unavailable = lines.filter((line) => !line.active || line.stock < line.quantity);
    if (unavailable.length) {
      throw new HttpError(409, "Some items are no longer available in the requested quantity.", undefined, {
        code: "stock_changed",
        items: unavailable.map((line) => ({
          productId: line.productId, name: line.name, requested: line.quantity, available: line.active ? line.stock : 0
        }))
      });
    }

    // The amount always comes from today's catalog prices, never from the client.
    const totalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
    if (expectedTotalCents !== undefined && expectedTotalCents !== totalCents) {
      throw new HttpError(409, "Prices changed since you opened checkout. Please review the new total.", undefined, {
        code: "price_changed", totalCents
      });
    }

    const recordAttempt = db.prepare(`
      INSERT INTO checkout_attempts (user_id, idempotency_key, outcome, order_id, decline_reason) VALUES (?, ?, ?, ?, ?)
    `);
    const payment = charge({ amountCents: totalCents });
    if (!payment.approved) {
      recordAttempt.run(userId, idempotencyKey, "declined", null, payment.declineReason);
      return { outcome: "declined", orderId: null, declineReason: payment.declineReason, replayed: false };
    }

    const takeStock = db.prepare(`
      UPDATE products SET stock = stock - ? WHERE id = ? AND deleted_at IS NULL AND stock >= ?
    `);
    for (const line of lines) {
      // Guarded write: even if something changed the row, stock can never go below zero.
      if (takeStock.run(line.quantity, line.productId, line.quantity).changes !== 1) {
        throw new HttpError(409, "Some items are no longer available in the requested quantity.", undefined, {
          code: "stock_changed"
        });
      }
    }

    const orderId = Number(db.prepare(`
      INSERT INTO orders (user_id, status, total_cents, customer_name, delivery_address)
      VALUES (?, 'processing', ?, ?, ?)
    `).run(userId, totalCents, customerName, deliveryAddress).lastInsertRowid);
    const addItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?)
    `);
    for (const line of lines) addItem.run(orderId, line.productId, line.name, line.unitPriceCents, line.quantity);
    db.prepare(`
      INSERT INTO payments (order_id, amount_cents, status, card_last4) VALUES (?, ?, 'completed', ?)
    `).run(orderId, totalCents, payment.cardLast4 ?? null);
    db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(lines[0].cartId);
    recordAttempt.run(userId, idempotencyKey, "approved", orderId, null);
    return { outcome: "approved", orderId, declineReason: null, replayed: false };
  }).immediate();
}
