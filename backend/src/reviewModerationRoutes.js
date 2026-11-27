import { Router } from "express";
import { ROLES } from "./auth.js";
import { HttpError } from "./errors.js";
import { requireRole } from "./middleware.js";

const DECISIONS = new Set(["approved", "rejected"]);
const PAGE_SIZE = 50;

function reviewId(value) {
  const id = typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id)) throw new HttpError(400, "Invalid review ID.");
  return id;
}

export function createReviewModerationRouter(db) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireRole(ROLES.PRODUCT_MANAGER));

  router.get("/", (req, res) => {
    const { status = "pending", after } = req.query;
    if (status !== "pending" && !DECISIONS.has(status)) {
      throw new HttpError(400, "Choose pending, approved, or rejected reviews.");
    }
    const rows = db.prepare(`
      SELECT r.id, r.product_id AS productId, p.name AS productName,
        r.user_id AS authorId, u.name AS author, r.body, r.created_at AS createdAt,
        r.moderation_status AS status, r.moderated_by AS moderatedBy, r.moderated_at AS moderatedAt
      FROM reviews r
      JOIN products p ON p.id = r.product_id
      JOIN users u ON u.id = r.user_id
      WHERE r.moderation_status = ? AND r.id > ?
      ORDER BY r.id LIMIT ?
    `).all(status, after === undefined ? 0 : reviewId(after), PAGE_SIZE + 1);
    const reviews = rows.slice(0, PAGE_SIZE);
    res.json({ reviews, nextAfter: rows.length > PAGE_SIZE ? reviews.at(-1).id : null });
  });

  router.patch("/:id", (req, res) => {
    const id = reviewId(req.params.id);
    const status = req.body?.status;
    if (!DECISIONS.has(status)) throw new HttpError(400, "Choose approved or rejected.");
    const review = db.prepare(`
      UPDATE reviews
      SET moderation_status = ?, moderated_by = ?, moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND moderation_status = 'pending'
      RETURNING id, moderation_status AS status, moderated_by AS moderatedBy, moderated_at AS moderatedAt
    `).get(status, req.user.id, id);
    if (!review) {
      if (!db.prepare("SELECT 1 FROM reviews WHERE id = ?").get(id)) {
        throw new HttpError(404, "Review not found.");
      }
      throw new HttpError(409, "This review has already been decided.", undefined, {
        code: "review_already_decided"
      });
    }
    res.json({ review });
  });

  return router;
}
