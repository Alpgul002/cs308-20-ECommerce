import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { feedbackEligibility, ratingSummary } from "../src/feedback.js";
import { createTestApp, signUpCustomer } from "../test-support/helpers.js";
import { createDatabase } from "../src/db.js";
import { migrations, runMigrations } from "../src/migrations.js";

function eligibilityFor(purchases) {
  return feedbackEligibility({
    prepare: () => ({ all: () => purchases })
  }, "p-101", 1);
}

test("feedback requires a signed-in buyer", () => {
  assert.deepEqual(feedbackEligibility(null, "p-101", null),
    { eligible: false, reason: "sign_in_required" });
});

test("completed payment before delivery does not permit feedback", () => {
  for (const status of ["processing", "in-transit"]) {
    assert.deepEqual(eligibilityFor([{ paid: 1, status }]),
      { eligible: false, reason: "delivery_required" });
  }
});

test("delivered order requires completed payment", () => {
  assert.equal(eligibilityFor([{ paid: 0, status: "delivered" }]).eligible, false);
  assert.equal(eligibilityFor([{ paid: 1, status: "delivered" }]).eligible, true);
});

test("any delivered paid purchase qualifies even alongside newer pending orders", () => {
  assert.equal(eligibilityFor([
    { paid: 1, status: "processing" }, { paid: 1, status: "delivered" }
  ]).eligible, true);
});

test("no purchase produces a purchase requirement", () => {
  assert.deepEqual(eligibilityFor([]), { eligible: false, reason: "purchase_required" });
});

async function purchase(db, agent, status = "delivered") {
  const { body: { user } } = await agent.get("/api/auth/me").expect(200);
  const id = db.prepare("INSERT INTO orders (user_id, status) VALUES (?, ?)").run(user.id, status).lastInsertRowid;
  db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    VALUES (?, 'p-101', 'Headphones', 12999, 1)
  `).run(id);
  db.prepare("INSERT INTO payments (order_id, amount_cents, status) VALUES (?, 12999, 'completed')").run(id);
  return { userId: user.id, orderId: id };
}

test("rating API enforces purchase identity, product, payment and delivery on every write", async (t) => {
  const { db, app } = createTestApp();
  t.after(() => db.close());
  const path = "/api/products/p-101/feedback";
  const buyer = await signUpCustomer(app);
  const other = await signUpCustomer(app, { email: "other-rating@example.com" });
  await request(app).put(path + "/rating").send({ value: 5 }).expect(401);
  assert.equal((await buyer.get(path)).body.eligibility.reason, "purchase_required");
  await buyer.put(path + "/rating").send({ value: 5 }).expect(403);
  const { orderId } = await purchase(db, buyer, "processing");
  for (const status of ["processing", "in-transit"]) {
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
    const feedback = (await buyer.get(path).expect(200)).body;
    assert.equal(feedback.canRate, false);
    assert.equal(feedback.canReview, false);
    assert.equal(feedback.reviewReason, "delivery_required");
    await buyer.put(path + "/rating").send({ value: 5 }).expect(403);
    await buyer.post(path + "/reviews").send({ body: "Too early." }).expect(403);
  }
  db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(orderId);
  await other.put(path + "/rating").send({ value: 5 }).expect(403);
  await buyer.put("/api/products/p-102/feedback/rating").send({ value: 5 }).expect(403);
  await buyer.put(path + "/rating").send({ value: 5 }).expect(200);
  await buyer.post(path + "/reviews").send({ body: "Received and tested." }).expect(201);
  assert.equal((await buyer.get(path)).body.canRate, true);
  assert.equal((await buyer.get(path)).body.reviewReason, "already_reviewed");
  db.prepare("UPDATE payments SET status = 'refunded' WHERE order_id = ?").run(orderId);
  await buyer.put(path + "/rating").send({ value: 1 }).expect(403);
});

test("rating updates preserve count, public averages are immediate and likes stay independent", async (t) => {
  const { db, app } = createTestApp();
  t.after(() => db.close());
  const buyer = await signUpCustomer(app);
  const other = await signUpCustomer(app, { email: "second-rating@example.com" });
  await purchase(db, buyer);
  await purchase(db, other);
  const path = "/api/products/p-101/feedback";
  assert.deepEqual((await request(app).get(path)).body.rating,
    { average: null, count: 0, myRating: null });
  for (const value of [0, 6, 1.5, "5", null, true]) {
    await buyer.put(path + "/rating").send({ value }).expect(400);
  }
  await buyer.put(path + "/rating").send({ value: 5 }).expect(200);
  await other.put(path + "/rating").send({ value: 2 }).expect(200);
  assert.deepEqual((await request(app).get(path)).body.rating,
    { average: 3.5, count: 2, myRating: null });
  await buyer.put(path + "/rating").send({ value: 3 }).expect(200);
  await buyer.put(path + "/rating").send({ value: 3 }).expect(200);
  assert.deepEqual((await buyer.get(path)).body.rating,
    { average: 2.5, count: 2, myRating: 3 });
  assert.equal(db.prepare("SELECT count(*) AS n FROM reviews").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM product_likes").get().n, 0);
});

test("migration 6 preserves existing reviews and ratings across reruns", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());
  // Recreate the schema at v5 to exercise the real upgrade.
  db.exec("DROP TABLE product_ratings");
  db.pragma("user_version = 5");
  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES ('Manager','migration@test','hash','product_manager')").run();
  db.prepare("INSERT INTO reviews (product_id,user_id,body) VALUES ('p-101',1,'Existing review')").run();
  runMigrations(db);
  assert.equal(db.prepare("SELECT body FROM reviews").get().body, "Existing review");
  db.prepare("INSERT INTO product_ratings (product_id,user_id,value) VALUES ('p-101',1,4)").run();
  runMigrations(db);
  assert.deepEqual(ratingSummary(db, "p-101", 1), { average: 4, count: 1, myRating: 4 });
  assert.equal(db.pragma("user_version", { simple: true }), Math.max(...migrations.map(m => m.version)));
  assert.throws(() => db.prepare("UPDATE product_ratings SET value = 2.5").run());
});

test("ratings survive database close and reopen", async (t) => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const folder = mkdtempSync(join(tmpdir(), "orbit-rating-"));
  const file = join(folder, "store.sqlite");
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  let db = createDatabase(file);
  try {
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES ('Manager','persist@test','hash','product_manager')").run();
    db.prepare("INSERT INTO product_ratings (product_id,user_id,value) VALUES ('p-101',1,5)").run();
  } finally {
    db.close();
  }
  db = createDatabase(file);
  try {
    assert.deepEqual(ratingSummary(db, "p-101", 1), { average: 5, count: 1, myRating: 5 });
  } finally {
    db.close();
  }
});
