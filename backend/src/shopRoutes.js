import { Router } from "express";
import { getProduct } from "./catalog.js";
import { HttpError } from "./errors.js";
import { requireAuth } from "./middleware.js";

export function createShopRouter(db) {
  const router = Router();

  function canReview(productId, userId) {
    return db.prepare(`
      SELECT 1 FROM orders
      JOIN order_items ON order_items.order_id = orders.id
      WHERE orders.user_id = ? AND order_items.product_id = ?
      AND EXISTS (SELECT 1 FROM payments WHERE order_id = orders.id AND status = 'completed')
    `).get(userId, productId) !== undefined;
  }

  router.use("/products/:id/feedback", (req, res, next) => {
    if (!getProduct(db, req.params.id)) throw new HttpError(404, "Product not found.");
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/products/:id/feedback", (req, res) => {
    const productId = req.params.id;
    const userId = req.user?.id ?? null;
    const productLikes = db.prepare(`
      SELECT count(*) AS likes, coalesce(max(user_id = ?), 0) AS liked
      FROM product_likes WHERE product_id = ?
    `).get(userId, productId);
    const reviews = db.prepare(`
      SELECT r.id, r.body, r.created_at AS createdAt, u.name AS author,
        (SELECT count(*) FROM review_likes WHERE review_id = r.id) AS likes,
        EXISTS (SELECT 1 FROM review_likes WHERE review_id = r.id AND user_id = ?) AS liked
      FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ? ORDER BY r.id DESC
    `).all(userId, productId);
    const existing = db.prepare("SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?")
      .get(productId, userId);
    res.json({ ...productLikes, reviews, canReview: Boolean(userId && !existing && canReview(productId, userId)) });
  });

  router.post("/products/:id/feedback/reviews", requireAuth, (req, res) => {
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body || body.length > 2000) throw new HttpError(400, "Enter a review of 1 to 2,000 characters.");
    const productId = req.params.id;
    const userId = req.user.id;
    db.transaction(() => {
      if (!canReview(productId, userId)) throw new HttpError(403, "You can review products you have purchased.");
      const result = db.prepare(`
        INSERT INTO reviews (product_id, user_id, body) VALUES (?, ?, ?)
        ON CONFLICT (product_id, user_id) DO NOTHING
      `).run(productId, userId, body);
      if (!result.changes) throw new HttpError(409, "You have already reviewed this product.");
    }).immediate();
    res.status(201).json({ ok: true });
  });

  router.put("/products/:id/feedback/like", requireAuth, (req, res) => {
    if (typeof req.body?.liked !== "boolean") throw new HttpError(400, "Send a boolean liked value.");
    const sql = req.body.liked
      ? "INSERT OR IGNORE INTO product_likes (product_id, user_id) VALUES (?, ?)"
      : "DELETE FROM product_likes WHERE product_id = ? AND user_id = ?";
    db.prepare(sql).run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  router.put("/products/:id/feedback/reviews/:reviewId/like", requireAuth, (req, res) => {
    if (typeof req.body?.liked !== "boolean") throw new HttpError(400, "Send a boolean liked value.");
    const review = db.prepare("SELECT id FROM reviews WHERE id = ? AND product_id = ?")
      .get(req.params.reviewId, req.params.id);
    if (!review) throw new HttpError(404, "Review not found.");
    const sql = req.body.liked
      ? "INSERT OR IGNORE INTO review_likes (review_id, user_id) VALUES (?, ?)"
      : "DELETE FROM review_likes WHERE review_id = ? AND user_id = ?";
    db.prepare(sql).run(review.id, req.user.id);
    res.json({ ok: true });
  });

  router.get("/account/payments", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    const payments = db.prepare(`
      SELECT p.id, p.order_id AS orderId, p.amount_cents AS amountCents,
        p.currency, p.status, p.created_at AS createdAt
      FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE o.user_id = ? ORDER BY p.created_at DESC, p.id DESC
    `).all(req.user.id);
    const items = db.prepare(`
      SELECT product_id AS productId, product_name AS name,
        unit_price_cents AS unitPriceCents, quantity
      FROM order_items WHERE order_id = ? ORDER BY product_name
    `);
    res.json({ payments: payments.map((payment) => ({ ...payment, items: items.all(payment.orderId) })) });
  });

  return router;
}
