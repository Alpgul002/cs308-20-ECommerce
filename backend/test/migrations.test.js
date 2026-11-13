import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createDatabase } from "../src/db.js";
import { migrations, runMigrations } from "../src/migrations.js";

const LATEST = Math.max(...migrations.map((m) => m.version));

function withTempFile(run) {
  const dir = mkdtempSync(join(tmpdir(), "cs308-db-"));
  try {
    return run(join(dir, "store.sqlite"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The table layout feature/sprint-1-store-foundation creates, with no user_version set.
function createPreMigrationDatabase(file) {
  const old = new Database(file);
  old.exec(`
    CREATE TABLE categories (slug TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      category_slug TEXT NOT NULL REFERENCES categories(slug),
      name TEXT NOT NULL, brand TEXT NOT NULL, model TEXT NOT NULL,
      serial_number TEXT NOT NULL, description TEXT NOT NULL,
      stock INTEGER NOT NULL CHECK(stock >= 0),
      price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
      warranty_months INTEGER NOT NULL, warranty_status TEXT NOT NULL,
      distributor TEXT NOT NULL, popularity INTEGER NOT NULL DEFAULT 0,
      image_key TEXT NOT NULL, accent TEXT NOT NULL
    );
    INSERT INTO categories VALUES ('audio', 'Audio');
    INSERT INTO products VALUES ('p-101', 'audio', 'Edited Name', 'B', 'M', 'S-1', 'D',
      3, 1001, 12, 'Active', 'Dist', 5, 'speaker', 'mint');
  `);
  old.close();
}

test("fresh database reaches the latest schema version", () => {
  const db = createDatabase(":memory:");
  assert.equal(db.pragma("user_version", { simple: true }), LATEST);
  db.close();
});

test("migration versions are unique and ascending", () => {
  const versions = migrations.map((m) => m.version);
  assert.deepEqual(versions, [...new Set(versions)].sort((a, b) => a - b));
});

test("database from before migrations upgrades without losing edited data", () => withTempFile((file) => {
  createPreMigrationDatabase(file);
  const db = createDatabase(file);
  const rows = db.prepare("SELECT name, stock, cost_cents, deleted_at FROM products").all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ name: "Edited Name", stock: 3, cost_cents: 500, deleted_at: null }]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  db.close();
}));

test("reopening an existing database does not reset edited inventory", () => withTempFile((file) => {
  const first = createDatabase(file);
  first.prepare("UPDATE products SET stock = 1 WHERE id = 'p-101'").run();
  first.close();
  const second = createDatabase(file);
  assert.equal(second.prepare("SELECT stock FROM products WHERE id = 'p-101'").get().stock, 1);
  assert.equal(second.prepare("SELECT COUNT(*) AS n FROM products").get().n, 9);
  second.close();
}));

test("BUG-06 an emptied catalog stays empty after a restart", () => withTempFile((file) => {
  const first = createDatabase(file);
  first.prepare("DELETE FROM products").run();
  first.close();
  const second = createDatabase(file);
  assert.equal(second.prepare("SELECT COUNT(*) AS n FROM products").get().n, 0);
  second.close();
}));

test("a failing migration rolls back completely", () => {
  const db = new Database(":memory:");
  const list = [
    { version: 1, up: (d) => d.exec("CREATE TABLE ok (id INTEGER)") },
    { version: 2, up: (d) => { d.exec("CREATE TABLE half (id INTEGER)"); throw new Error("boom"); } }
  ];
  assert.throws(() => runMigrations(db, list), /boom/);
  assert.equal(db.pragma("user_version", { simple: true }), 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('ok', 'half')").get().n, 0);
  db.close();
});

test("database newer than the code is refused with a clear message", () => {
  const db = new Database(":memory:");
  db.pragma(`user_version = ${LATEST + 1}`);
  assert.throws(() => runMigrations(db), /newer than this code/);
  db.close();
});

test("users table rejects unknown roles", () => {
  const db = createDatabase(":memory:");
  assert.throws(() => db.prepare(`
    INSERT INTO users (name, email, password_hash, role) VALUES ('A', 'a@b.co', 'h', 'admin')
  `).run(), /CHECK/);
  db.close();
});

test("customer rows require a tax ID and home address, staff rows do not", () => {
  const db = createDatabase(":memory:");
  assert.throws(() => db.prepare(`
    INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@b.co', 'h')
  `).run(), /CHECK/);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role) VALUES ('P', 'p@b.co', 'h', 'product_manager')
  `).run();
  db.close();
});

test("user emails are unique regardless of case", () => {
  const db = createDatabase(":memory:");
  const insert = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('P', ?, 'h', 'support_agent')");
  insert.run("same@b.co");
  assert.throws(() => insert.run("SAME@B.CO"), /UNIQUE/);
  db.close();
});

test("deleting a user removes their sessions", () => {
  const db = createDatabase(":memory:");
  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO users (name, email, password_hash, role) VALUES ('P', 'p@b.co', 'h', 'support_agent')
  `).run();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('t', ?, 1)").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
  db.close();
});

test("serial numbers are unique among active products only", () => {
  const db = createDatabase(":memory:");
  const copy = db.prepare(`
    INSERT INTO products (id, category_slug, name, brand, model, serial_number, description, stock,
      price_cents, warranty_months, warranty_status, distributor, image_key, accent)
    SELECT ?, category_slug, name, brand, model, serial_number, description, stock,
      price_cents, warranty_months, warranty_status, distributor, image_key, accent
    FROM products WHERE id = 'p-101'
  `);
  assert.throws(() => copy.run("p-500"), /UNIQUE/);
  db.prepare("UPDATE products SET deleted_at = 'now' WHERE id = 'p-101'").run();
  copy.run("p-500");
  db.close();
});
