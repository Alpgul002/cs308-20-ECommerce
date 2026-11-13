import { seedCatalog } from "./seed.js";

// Schema history, tracked with SQLite's PRAGMA user_version.
// Rules: never edit a migration that is already merged. To change the schema,
// append a new entry with the next version number.
export const migrations = [
  {
    version: 1,
    name: "catalog",
    up(db) {
      // IF NOT EXISTS: databases created before migrations existed already have these tables.
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          slug TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          category_slug TEXT NOT NULL REFERENCES categories(slug),
          name TEXT NOT NULL,
          brand TEXT NOT NULL,
          model TEXT NOT NULL,
          serial_number TEXT NOT NULL,
          description TEXT NOT NULL,
          stock INTEGER NOT NULL CHECK(stock >= 0),
          price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
          warranty_months INTEGER NOT NULL,
          warranty_status TEXT NOT NULL,
          distributor TEXT NOT NULL,
          popularity INTEGER NOT NULL DEFAULT 0,
          image_key TEXT NOT NULL,
          accent TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_slug);
        CREATE INDEX IF NOT EXISTS idx_products_popularity ON products(popularity);
      `);
      if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) seedCatalog(db);
    }
  },
  {
    version: 2,
    name: "users-and-sessions",
    up(db) {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          tax_id TEXT,
          home_address TEXT,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'customer'
            CHECK (role IN ('customer', 'sales_manager', 'product_manager', 'support_agent')),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          CHECK (role <> 'customer' OR (tax_id IS NOT NULL AND home_address IS NOT NULL))
        );
        -- Only a SHA-256 of the session token is stored, so a leaked database cannot be replayed.
        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX idx_sessions_user ON sessions(user_id);
        CREATE INDEX idx_sessions_expires ON sessions(expires_at);
      `);
    }
  },
  {
    version: 3,
    name: "product-cost-and-soft-delete",
    up(db) {
      // Removed products keep their row: orders, invoices and refunds must still resolve
      // them, and their IDs must never be handed out again (guest carts store product IDs).
      db.exec(`
        ALTER TABLE products ADD COLUMN cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0);
        ALTER TABLE products ADD COLUMN deleted_at TEXT;
        UPDATE products SET cost_cents = price_cents / 2;
        CREATE UNIQUE INDEX idx_products_serial_active ON products(serial_number) WHERE deleted_at IS NULL;
      `);
    }
  }
];

export function runMigrations(db, list = migrations) {
  const latest = Math.max(...list.map((migration) => migration.version));
  // IMMEDIATE takes the write lock first, so two processes cannot apply the same migration.
  db.transaction(() => {
    const current = db.pragma("user_version", { simple: true });
    if (current > latest) {
      throw new Error(`Database schema v${current} is newer than this code (v${latest}). ` +
        "Pull the latest code, or delete backend/data/store.sqlite to start fresh.");
    }
    for (const migration of list) {
      if (migration.version <= current) continue;
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    }
  }).immediate();
}
