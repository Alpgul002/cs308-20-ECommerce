export function addReviewModeration(db) {
  db.exec(`
    ALTER TABLE reviews ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (moderation_status IN ('pending', 'approved', 'rejected'));
    ALTER TABLE reviews ADD COLUMN moderated_by INTEGER REFERENCES users(id);
    ALTER TABLE reviews ADD COLUMN moderated_at TEXT CHECK (
      (moderation_status = 'pending' AND moderated_by IS NULL AND moderated_at IS NULL)
      OR (moderation_status IN ('approved', 'rejected') AND moderated_by IS NOT NULL AND moderated_at IS NOT NULL)
    );
    CREATE INDEX idx_reviews_moderation_status ON reviews(moderation_status, id);
    CREATE INDEX idx_reviews_public_product ON reviews(product_id, id) WHERE moderation_status = 'approved';
  `);
}
