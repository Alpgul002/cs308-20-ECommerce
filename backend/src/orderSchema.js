// Migration 5: turns the SCRUM-14 order tables into something checkout can write to.
// Orders keep a snapshot of the total, buyer name and delivery address, so later profile
// or catalog changes never rewrite history (PDF items 3, 4 and 16).
export function addCheckoutColumns(db) {
  db.exec(`
    ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'processing'
      CHECK (status IN ('processing', 'in-transit', 'delivered'));
    ALTER TABLE orders ADD COLUMN total_cents INTEGER CHECK (total_cents IS NULL OR total_cents >= 0);
    ALTER TABLE orders ADD COLUMN customer_name TEXT;
    ALTER TABLE orders ADD COLUMN delivery_address TEXT;
    CREATE INDEX idx_orders_status ON orders(status);

    -- Only the last four digits are kept. The card number and CVC are never stored.
    ALTER TABLE payments ADD COLUMN card_last4 TEXT
      CHECK (card_last4 IS NULL OR card_last4 GLOB '[0-9][0-9][0-9][0-9]');

    -- One row per Idempotency-Key, so a retried or double-clicked payment returns the
    -- first outcome instead of charging again.
    CREATE TABLE checkout_attempts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'declined')),
      order_id INTEGER REFERENCES orders(id),
      decline_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (user_id, idempotency_key),
      CHECK ((outcome = 'approved') = (order_id IS NOT NULL))
    );
  `);
}
