// Reads orders in the JSON shape the frontend uses. Prices, names and the address come
// from the snapshot taken at purchase time, never from today's catalog or profile.
const ORDER_COLUMNS = `
  o.id, o.user_id AS userId, o.status, o.created_at AS createdAt,
  o.customer_name AS customerName, o.delivery_address AS deliveryAddress,
  COALESCE(o.total_cents,
    (SELECT SUM(unit_price_cents * quantity) FROM order_items WHERE order_id = o.id), 0) AS totalCents
`;

function withDetails(db, row) {
  const items = db.prepare(`
    SELECT product_id AS productId, product_name AS name, unit_price_cents AS unitPriceCents, quantity
    FROM order_items WHERE order_id = ? ORDER BY rowid
  `).all(row.id).map((item) => ({ ...item, lineTotalCents: item.unitPriceCents * item.quantity }));
  const payment = db.prepare(`
    SELECT status, amount_cents AS amountCents, card_last4 AS cardLast4
    FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1
  `).get(row.id) ?? null;
  const { userId, ...order } = row;
  return { ...order, currency: "USD", items, payment: payment && { ...payment } };
}

// Newest first. The customer's own history (PDF item 3).
export function listOrdersForUser(db, userId) {
  return db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC`)
    .all(userId).map((row) => withDetails(db, row));
}

export function getOrder(db, id) {
  const row = db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = ?`).get(id);
  return row ? { userId: row.userId, order: withDetails(db, row) } : null;
}
