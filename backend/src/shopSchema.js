export function createShopTables(db) {
  db.exec(`
    CREATE TABLE carts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      guest_hash TEXT UNIQUE,
      CHECK ((user_id IS NULL) <> (guest_hash IS NULL))
    );
    CREATE TABLE cart_items (
      cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
      PRIMARY KEY (cart_id, product_id)
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX idx_orders_user ON orders(user_id);
    CREATE TABLE order_items (
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (order_id, product_id)
    );
    CREATE TABLE payments (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX idx_payments_order ON payments(order_id);
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (product_id, user_id)
    );
    CREATE TABLE product_likes (
      product_id TEXT NOT NULL REFERENCES products(id),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, user_id)
    );
    CREATE TABLE review_likes (
      review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (review_id, user_id)
    );
  `);
}
