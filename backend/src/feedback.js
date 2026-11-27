// Shared by comment and rating writes so both enforce the same purchase rule.
export function feedbackEligibility(db, productId, userId) {
  if (!userId) return { eligible: false, reason: "sign_in_required" };
  const purchases = db.prepare(`
    SELECT o.status,
      EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'completed') AS paid
    FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.user_id = ? AND i.product_id = ?
  `).all(userId, productId);
  if (purchases.some((order) => order.paid && order.status === "delivered")) {
    return { eligible: true, reason: null };
  }
  if (purchases.some((order) => order.paid)) return { eligible: false, reason: "delivery_required" };
  return { eligible: false, reason: "purchase_required" };
}

export function ratingSummary(db, productId, userId) {
  const summary = db.prepare(`
    SELECT avg(value) AS average, count(*) AS count FROM product_ratings WHERE product_id = ?
  `).get(productId);
  const mine = db.prepare("SELECT value FROM product_ratings WHERE product_id = ? AND user_id = ?")
    .get(productId, userId);
  return { ...summary, myRating: mine?.value ?? null };
}

export function addProductRatings(db) {
  db.exec(`
    CREATE TABLE product_ratings (
      product_id TEXT NOT NULL REFERENCES products(id),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      value INTEGER NOT NULL CHECK (typeof(value) = 'integer' AND value BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (product_id, user_id)
    );
  `);
}
