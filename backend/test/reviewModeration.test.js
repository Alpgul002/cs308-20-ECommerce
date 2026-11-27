import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import request from "supertest";
import { ROLES } from "../src/auth.js";
import { createApp } from "../src/app.js";
import { migrations, runMigrations } from "../src/migrations.js";
import { createTestApp, signInAsStaff, signUpCustomer } from "../test-support/helpers.js";

const productPath = "/api/products/p-101/feedback";
const queuePath = "/api/admin/reviews";

async function addDeliveredPurchase(db, buyer) {
  const { body: { user } } = await buyer.get("/api/auth/me").expect(200);
  const orderId = db.prepare("INSERT INTO orders (user_id, status) VALUES (?, 'delivered')").run(user.id).lastInsertRowid;
  db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    VALUES (?, 'p-101', 'Studio Headphones', 12999, 1)
  `).run(orderId);
  db.prepare("INSERT INTO payments (order_id, amount_cents, status) VALUES (?, 12999, 'completed')").run(orderId);
  return user;
}

test("pending and rejected reviews remain private, while approved reviews and star ratings are public", async (t) => {
  const { db, app } = createTestApp();
  t.after(() => db.close());
  const buyer = await signUpCustomer(app);
  const other = await signUpCustomer(app, { name: "Second Buyer", email: "second-buyer@example.com" });
  const buyerUser = await addDeliveredPurchase(db, buyer);
  await addDeliveredPurchase(db, other);
  const manager = await signInAsStaff(app, db, ROLES.PRODUCT_MANAGER);
  const { body: { user: moderator } } = await manager.get("/api/auth/me").expect(200);

  await buyer.put(productPath + "/rating").send({ value: 5 }).expect(200);
  const { body: { review: first } } = await buyer.post(productPath + "/reviews")
    .send({ body: "Clear audio." }).expect(201);
  const { body: { review: second } } = await other.post(productPath + "/reviews")
    .send({ body: "Second private review." }).expect(201);
  assert.equal(first.status, "pending");
  assert.equal(second.status, "pending");
  await buyer.put(`${productPath}/reviews/${first.id}/like`).send({ liked: true }).expect(404);
  let publicFeedback = (await request(app).get(productPath).expect(200)).body;
  assert.deepEqual(publicFeedback.reviews, []);
  assert.equal(publicFeedback.myReviewStatus, null);
  assert.deepEqual(publicFeedback.rating, { average: 5, count: 1, myRating: null });
  const ownFeedback = (await buyer.get(productPath).expect(200)).body;
  assert.equal(ownFeedback.myReviewStatus, "pending");
  assert.equal(ownFeedback.canReview, false);
  assert.equal(ownFeedback.canRate, true);

  const queue = (await manager.get(queuePath).expect(200).expect("Cache-Control", "no-store")).body;
  assert.deepEqual(queue.reviews.map(({ id }) => id), [first.id, second.id]);
  assert.equal(queue.reviews[0].productName, "Studio Headphones");
  assert.equal(queue.reviews[0].authorId, buyerUser.id);
  assert.equal(queue.reviews[0].body, "Clear audio.");
  assert.equal(queue.reviews[0].moderatedAt, null);

  const approval = (await manager.patch(`${queuePath}/${first.id}`).send({ status: "approved" }).expect(200)).body.review;
  assert.equal(approval.status, "approved");
  assert.equal(approval.moderatedBy, moderator.id);
  assert.ok(Date.parse(approval.moderatedAt));
  await manager.patch(`${queuePath}/${second.id}`).send({ status: "rejected" }).expect(200);
  await manager.get(queuePath).expect(200, { reviews: [], nextAfter: null });

  publicFeedback = (await request(app).get(productPath).expect(200)).body;
  assert.deepEqual(publicFeedback.reviews.map(({ id, body }) => ({ id, body })), [
    { id: first.id, body: "Clear audio." }
  ]);
  assert.deepEqual(publicFeedback.rating, { average: 5, count: 1, myRating: null });
  assert.equal((await other.get(productPath).expect(200)).body.myReviewStatus, "rejected");
  await other.put(`${productPath}/reviews/${second.id}/like`).send({ liked: true }).expect(404);
  await other.put(`${productPath}/reviews/${first.id}/like`).send({ liked: true }).expect(200);
});

test("only a product manager can access the queue and the first valid decision is retained", async (t) => {
  const { db, app } = createTestApp();
  t.after(() => db.close());
  const buyer = await signUpCustomer(app);
  await addDeliveredPurchase(db, buyer);
  const { body: { review } } = await buyer.post(productPath + "/reviews").send({ body: "Good fit." }).expect(201);
  const url = `${queuePath}/${review.id}`;
  const sales = await signInAsStaff(app, db, ROLES.SALES_MANAGER);
  const manager = await signInAsStaff(app, db, ROLES.PRODUCT_MANAGER);
  await request(app).get(queuePath).expect(401);
  await request(app).patch(url).send({ status: "approved" }).expect(401);
  await buyer.get(queuePath).expect(403);
  await buyer.patch(url).send({ status: "approved" }).expect(403);
  await sales.get(queuePath).expect(403);
  await sales.patch(url).send({ status: "approved" }).expect(403);
  await manager.get(queuePath + "?status=unknown").expect(400);
  await manager.get(queuePath + "?after=invalid").expect(400);
  await manager.patch(url).send({ status: "pending" }).expect(400);
  await manager.patch(queuePath + "/99999").send({ status: "approved" }).expect(404);
  const outcomes = await Promise.all([
    manager.patch(url).send({ status: "approved" }),
    manager.patch(url).send({ status: "rejected" })
  ]);
  const committed = outcomes.find((response) => response.status === 200)?.body.review;
  assert.ok(committed);
  const conflict = outcomes.find((response) => response.status === 409);
  assert.equal(conflict?.body.code, "review_already_decided");
  const { body: { reviews } } = await manager.get(`${queuePath}?status=${committed.status}`).expect(200);
  const { id, status, moderatedBy, moderatedAt } = reviews[0];
  assert.deepEqual({ id, status, moderatedBy, moderatedAt }, committed);
});

test("migration queues existing reviews for moderation and preserves ratings and likes", async (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.pragma("foreign_keys = ON");
  runMigrations(db, migrations.filter(({ version }) => version <= 7));
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (91, 'Legacy User', 'legacy@example.com', 'hash', 'product_manager');
    INSERT INTO reviews (id, product_id, user_id, body) VALUES (42, 'p-101', 91, 'Legacy review');
    INSERT INTO review_likes (review_id, user_id) VALUES (42, 91);
    INSERT INTO product_ratings (product_id, user_id, value) VALUES ('p-101', 91, 4);
  `);
  runMigrations(db);
  assert.deepEqual(db.prepare(`
    SELECT body, moderation_status AS status, moderated_by AS moderator, moderated_at AS decidedAt
    FROM reviews WHERE id = 42
  `).get(), { body: "Legacy review", status: "pending", moderator: null, decidedAt: null });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM review_likes WHERE review_id = 42").get().n, 1);
  const { body } = await request(createApp(db)).get(productPath).expect(200);
  assert.deepEqual(body.reviews, []);
  assert.deepEqual(body.rating, { average: 4, count: 1, myRating: null });
});
