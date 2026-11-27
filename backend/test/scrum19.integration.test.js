import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import request from "supertest";
import { migrations, runMigrations } from "../src/migrations.js";
import { createApp } from "../src/app.js";
import { createTestApp, validCustomer } from "../test-support/helpers.js";

const payment = {
  cardNumber: "4242424242424242", cardHolder: "Integration Customer",
  expiryMonth: 12, expiryYear: new Date().getUTCFullYear() + 2, cvc: "123"
};

test("SCRUM-19 upgrades a v3 catalog without losing product edits and mounts every combined router", async () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  try {
    runMigrations(db, migrations.filter(({ version }) => version <= 3));
    db.prepare("UPDATE products SET price_cents = 12345, stock = 3 WHERE id = 'p-101'").run();
    runMigrations(db);
    const app = createApp(db);
    assert.equal(db.pragma("user_version", { simple: true }), migrations.at(-1).version);
    const detail = await request(app).get("/api/products/p-101").expect(200);
    assert.equal(detail.body.product.priceCents, 12345);
    assert.equal(detail.body.product.stock, 3);
    await request(app).get("/api/cart").expect(200, { items: [] });
    const feedback = await request(app).get("/api/products/p-101/feedback").expect(200);
    assert.deepEqual(feedback.body.rating, { average: null, count: 0, myRating: null });
    await request(app).get("/api/orders").expect(401);
    await request(app).get("/api/admin/reviews").expect(401);
    await request(app).post("/api/checkout").send({}).expect(401);
  } finally { db.close(); }
});

test("SCRUM-19 merged cart checkout updates SCRUM-12 filters and enables ratings only after delivery", async () => {
  const { app, db } = createTestApp();
  const customer = request.agent(app);
  try {
    db.prepare("UPDATE products SET stock = 2 WHERE id = 'p-101'").run();
    await customer.put("/api/cart/items/p-101").send({ quantity: 2 }).expect(200);
    await customer.post("/api/auth/register").send(validCustomer()).expect(201);
    await customer.get("/api/cart").expect(200, { items: [{ productId: "p-101", quantity: 2 }] });
    const query = "/api/products?search=wireless&category=audio&minPrice=100&maxPrice=130&inStock=true&sort=price-asc";
    const before = await customer.get(query).expect(200);
    assert.deepEqual(before.body.products.map(({ id }) => id), ["p-101"]);
    const purchase = await customer.post("/api/checkout").set("Idempotency-Key", "scrum19-combined-flow")
      .send({ payment, expectedTotalCents: 25998 }).expect(201);
    await customer.get("/api/cart").expect(200, { items: [] });
    const filtered = await customer.get(query).expect(200);
    assert.deepEqual(filtered.body.products, []);
    const searchable = await customer.get(query.replace("inStock=true", "inStock=false")).expect(200);
    assert.equal(searchable.body.products[0].stock, 0);
    await customer.put("/api/products/p-101/feedback/rating").send({ value: 4 }).expect(403);

    // Delivery administration is not implemented yet. This is a test fixture,
    // not evidence of a working delivery UI/API.
    db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(purchase.body.order.id);
    await customer.put("/api/products/p-101/feedback/rating").send({ value: 4 }).expect(200);
    const feedback = await customer.get("/api/products/p-101/feedback").expect(200);
    assert.deepEqual(feedback.body.rating, { average: 4, count: 1, myRating: 4 });
    const invoice = await customer.get(`/api/orders/${purchase.body.order.id}/invoice`).expect(200);
    assert.equal(invoice.body.invoice.totalCents, purchase.body.order.totalCents);
  } finally { db.close(); }
});
