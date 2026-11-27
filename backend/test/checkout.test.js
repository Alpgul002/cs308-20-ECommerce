// S3-21: atomic stock and repeated-payment protection, tested on the checkout service itself.
// The bank is a stub, so each test controls exactly what the payment step does.
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { IDEMPOTENCY_KEY_PATTERN, placeOrder } from "../src/checkout.js";
import { createDatabase } from "../src/db.js";
import { migrations, runMigrations } from "../src/migrations.js";

let db;
beforeEach(() => { db = createDatabase(":memory:"); });
afterEach(() => db.close());

function addCustomer(email = "ayse@example.com") {
  return Number(db.prepare(`
    INSERT INTO users (name, email, tax_id, home_address, password_hash)
    VALUES ('Ayse Yilmaz', ?, '1234567890', 'Orta Mah. 27, Tuzla, Istanbul', 'hash')
  `).run(email).lastInsertRowid);
}

function fillCart(userId, lines) {
  db.prepare("INSERT OR IGNORE INTO carts (user_id) VALUES (?)").run(userId);
  const cartId = db.prepare("SELECT id FROM carts WHERE user_id = ?").get(userId).id;
  const add = db.prepare("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)");
  for (const [productId, quantity] of lines) add.run(cartId, productId, quantity);
}

function bank(result = { approved: true, cardLast4: "4242" }) {
  const calls = [];
  const charge = (request) => {
    calls.push(request);
    if (result instanceof Error) throw result;
    return result;
  };
  return { charge, calls };
}

const declined = { approved: false, declineReason: "Card declined" };
const stockOf = (id) => db.prepare("SELECT stock FROM products WHERE id = ?").get(id).stock;
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const cartSize = (userId) => db.prepare(`
  SELECT COUNT(*) AS n FROM cart_items JOIN carts ON carts.id = cart_items.cart_id WHERE carts.user_id = ?
`).get(userId).n;

function checkout(userId, charge, overrides = {}) {
  return placeOrder(db, {
    userId, idempotencyKey: "key-00000001", customerName: "Ayse Yilmaz",
    deliveryAddress: "Orta Mah. 27, Tuzla, Istanbul", charge, ...overrides
  });
}

function nothingWritten(userId, cartLines) {
  assert.equal(count("orders"), 0);
  assert.equal(count("order_items"), 0);
  assert.equal(count("payments"), 0);
  assert.equal(cartSize(userId), cartLines);
}

test("an approved payment writes order, items, payment, stock and cart together", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 2], ["p-106", 1]]);
  const { charge } = bank();
  const result = checkout(userId, charge);
  assert.equal(result.outcome, "approved");
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(result.orderId);
  assert.equal(order.status, "processing");
  assert.equal(order.total_cents, 2 * 12999 + 5499);
  assert.equal(order.delivery_address, "Orta Mah. 27, Tuzla, Istanbul");
  assert.equal(count("order_items"), 2);
  const payment = db.prepare("SELECT * FROM payments WHERE order_id = ?").get(result.orderId);
  assert.deepEqual([payment.status, payment.amount_cents, payment.card_last4], ["completed", 31497, "4242"]);
  assert.equal(stockOf("p-101"), 17 - 2);
  assert.equal(stockOf("p-106"), 42 - 1);
  assert.equal(cartSize(userId), 0);
});

test("order items keep the name and price of the moment of purchase", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1]]);
  const { orderId } = checkout(userId, bank().charge);
  db.prepare("UPDATE products SET price_cents = 1, name = 'Renamed' WHERE id = 'p-101'").run();
  const item = db.prepare("SELECT product_name, unit_price_cents FROM order_items WHERE order_id = ?").get(orderId);
  assert.deepEqual({ ...item }, { product_name: "Studio Headphones", unit_price_cents: 12999 });
});

test("U16 the charged amount comes from server prices, not from the client", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1]]);
  const { charge, calls } = bank();
  checkout(userId, charge);
  assert.deepEqual(calls, [{ amountCents: 12999 }]);
});

test("a client total that no longer matches the server total stops checkout", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1]]);
  const { charge, calls } = bank();
  assert.throws(() => checkout(userId, charge, { expectedTotalCents: 1 }),
    (error) => error.status === 409 && error.details.code === "price_changed" && error.details.totalCents === 12999);
  assert.equal(calls.length, 0);
  nothingWritten(userId, 1);
});

test("U17 a declined payment writes no order, payment or stock change", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 2]]);
  const { charge, calls } = bank(declined);
  const result = checkout(userId, charge);
  assert.deepEqual({ outcome: result.outcome, declineReason: result.declineReason }, { outcome: "declined", declineReason: "Card declined" });
  assert.equal(calls.length, 1);
  assert.equal(stockOf("p-101"), 17);
  nothingWritten(userId, 1);
});

test("U18 repeating a completed key returns the first order without charging again", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1]]);
  const { charge, calls } = bank();
  const first = checkout(userId, charge);
  fillCart(userId, [["p-102", 1]]); // A new bag must not be bought by the old key.
  const second = checkout(userId, charge);
  assert.equal(second.orderId, first.orderId);
  assert.equal(second.replayed, true);
  assert.equal(calls.length, 1);
  assert.equal(count("orders"), 1);
  assert.equal(stockOf("p-101"), 16);
});

test("repeating a declined key returns the decline without asking the bank again", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1]]);
  const { charge, calls } = bank(declined);
  checkout(userId, charge);
  const again = checkout(userId, charge);
  assert.deepEqual([again.outcome, again.replayed], ["declined", true]);
  assert.equal(calls.length, 1);
});

test("a new key after a decline can complete the purchase", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1]]);
  checkout(userId, bank(declined).charge);
  const result = checkout(userId, bank().charge, { idempotencyKey: "key-00000002" });
  assert.equal(result.outcome, "approved");
  assert.equal(count("orders"), 1);
});

test("idempotency keys belong to one customer only", () => {
  const ayse = addCustomer();
  const mert = addCustomer("mert@example.com");
  fillCart(ayse, [["p-101", 1]]);
  fillCart(mert, [["p-102", 1]]);
  const first = checkout(ayse, bank().charge);
  const second = checkout(mert, bank().charge);
  assert.notEqual(second.orderId, first.orderId);
  assert.equal(second.replayed, false);
});

test("more than the stock is refused with the line that caused it, before the bank is called", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1], ["p-108", 6]]);
  const { charge, calls } = bank();
  assert.throws(() => checkout(userId, charge), (error) => {
    assert.equal(error.status, 409);
    assert.deepEqual(error.details.items, [{ productId: "p-108", name: "Creative Tablet", requested: 6, available: 5 }]);
    return true;
  });
  assert.equal(calls.length, 0);
  assert.equal(stockOf("p-101"), 17);
  nothingWritten(userId, 2);
});

test("a product removed after it was put in the bag cannot be bought", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-105", 1]]);
  db.prepare("UPDATE products SET deleted_at = 'now' WHERE id = 'p-105'").run();
  assert.throws(() => checkout(userId, bank().charge),
    (error) => error.status === 409 && error.details.items[0].available === 0);
});

test("an empty bag cannot be checked out", () => {
  const userId = addCustomer();
  assert.throws(() => checkout(userId, bank().charge), (error) => error.status === 400);
});

test("the last unit can be sold only once, and stock never goes negative", () => {
  const ayse = addCustomer();
  const mert = addCustomer("mert@example.com");
  db.prepare("UPDATE products SET stock = 1 WHERE id = 'p-107'").run();
  fillCart(ayse, [["p-107", 1]]);
  fillCart(mert, [["p-107", 1]]);
  assert.equal(checkout(ayse, bank().charge).outcome, "approved");
  assert.throws(() => checkout(mert, bank().charge), (error) => error.status === 409);
  assert.equal(stockOf("p-107"), 0);
  assert.equal(count("orders"), 1);
});

test("a failure in the middle of writing the order rolls everything back", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 2]]);
  db.exec("CREATE TRIGGER break_items BEFORE INSERT ON order_items BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
  assert.throws(() => checkout(userId, bank().charge), /disk full/);
  assert.equal(stockOf("p-101"), 17);
  nothingWritten(userId, 1);
  assert.equal(count("checkout_attempts"), 0); // The same key can be retried.
});

test("an unreachable bank leaves no trace and the key can be retried", () => {
  const userId = addCustomer();
  fillCart(userId, [["p-101", 1]]);
  assert.throws(() => checkout(userId, bank(new Error("timeout")).charge), /timeout/);
  nothingWritten(userId, 1);
  assert.equal(checkout(userId, bank().charge).outcome, "approved");
});

test("idempotency keys must be 8 to 100 safe characters", () => {
  for (const good of ["key-00000001", "0b6f9c1e-6f5e-4c8e-9d3a-1f2e3d4c5b6a", "A".repeat(100)]) {
    assert.ok(IDEMPOTENCY_KEY_PATTERN.test(good), good);
  }
  for (const bad of ["", "short", "A".repeat(101), "has space 123", "semi;colon12"]) {
    assert.ok(!IDEMPOTENCY_KEY_PATTERN.test(bad), bad);
  }
});

test("an attempt row cannot claim approval without an order", () => {
  const userId = addCustomer();
  assert.throws(() => db.prepare(`
    INSERT INTO checkout_attempts (user_id, idempotency_key, outcome) VALUES (?, 'key-00000001', 'approved')
  `).run(userId), /CHECK/);
});

test("migration 5 keeps SCRUM-14 orders and marks them processing", () => {
  const legacy = new Database(":memory:");
  legacy.pragma("foreign_keys = ON");
  runMigrations(legacy, migrations.filter((m) => m.version <= 4));
  const userId = legacy.prepare(`
    INSERT INTO users (name, email, tax_id, home_address, password_hash) VALUES ('A', 'a@b.co', '1234567890', 'Addr 1', 'h')
  `).run().lastInsertRowid;
  legacy.prepare("INSERT INTO orders (user_id) VALUES (?)").run(userId);
  runMigrations(legacy);
  assert.equal(legacy.pragma("user_version", { simple: true }), 5);
  assert.equal(legacy.prepare("SELECT status FROM orders").get().status, "processing");
  legacy.close();
});
