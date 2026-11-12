import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createTestApp, signUpCustomer, validCustomer } from "../test-support/helpers.js";

test("guest cart persists in SQLite, stays private, and merges into the account at sign-in", async (t) => {
  const { app, db } = createTestApp();
  t.after(() => db.close());
  const account = await signUpCustomer(app);
  const guest = request.agent(app);
  const itemUrl = "/api/cart/items/p-101";
  await account.put(itemUrl).send({ quantity: 1 }).expect(200);
  const created = await guest.put(itemUrl).send({ quantity: 2 }).expect(200);
  const cookie = created.headers["set-cookie"].find((value) => value.startsWith("orbit_guest_cart="));
  assert.match(cookie, /HttpOnly/);
  assert.notEqual(db.prepare("SELECT guest_hash FROM carts WHERE user_id IS NULL").get().guest_hash,
    cookie.split(/[=;]/)[1]);
  await guest.get("/api/cart").expect(200, { items: [{ productId: "p-101", quantity: 2 }] });
  await request(app).get("/api/cart").expect(200, { items: [] });
  await guest.delete(itemUrl).set("Origin", "https://another.example").expect(403);
  const { email, password } = validCustomer();
  await guest.post("/api/auth/login").send({ email, password }).expect(200);
  await guest.get("/api/cart").expect(200, { items: [{ productId: "p-101", quantity: 3 }] });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM carts WHERE user_id IS NULL").get().n, 0);
  await guest.post("/api/auth/logout").expect(200);
  await guest.get("/api/cart").expect(200, { items: [] });
  await account.delete(itemUrl).expect(200, { items: [] });
});

test("browser cart import can be retried without doubling quantities", async (t) => {
  const { app, db } = createTestApp();
  t.after(() => db.close());
  const guest = request.agent(app);
  const cart = { items: [{ productId: "p-101", quantity: 2 }] };
  await guest.post("/api/cart/import").send(cart).expect(200, cart);
  await guest.post("/api/cart/import").send(cart).expect(200, cart);
});

test("reviews require a completed purchase of that product and payment history is private", async (t) => {
  const { app, db } = createTestApp();
  t.after(() => db.close());
  const buyer = await signUpCustomer(app);
  const other = await signUpCustomer(app, { email: "other@example.com" });
  const path = "/api/products/p-101/feedback";
  const review = { body: "Works well." };
  await request(app).post(path + "/reviews").send(review).expect(401);
  await buyer.post(path + "/reviews").send(review).expect(403);
  const { body: { user } } = await buyer.get("/api/auth/me").expect(200);
  const orderId = db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(user.id).lastInsertRowid;
  db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    VALUES (?, 'p-101', 'Original product name', 12999, 1)
  `).run(orderId);
  db.prepare("INSERT INTO payments (order_id, amount_cents, status) VALUES (?, 12999, 'pending')").run(orderId);
  await buyer.post(path + "/reviews").send(review).expect(403);
  db.prepare("UPDATE payments SET status = 'completed' WHERE order_id = ?").run(orderId);
  await other.post(path + "/reviews").send(review).expect(403);
  await buyer.post("/api/products/p-102/feedback/reviews").send(review).expect(403);
  await buyer.post(path + "/reviews").send(review).expect(201);
  await buyer.post(path + "/reviews").send(review).expect(409);

  await other.put(path + "/like").send({ liked: true }).expect(200);
  await other.put(path + "/like").send({ liked: true }).expect(200);
  let feedback = (await other.get(path).expect(200)).body;
  assert.equal(feedback.likes, 1);
  assert.equal(feedback.liked, 1);
  const reviewLike = path + "/reviews/" + feedback.reviews[0].id + "/like";
  await other.put(reviewLike.replace("p-101", "p-102")).send({ liked: true }).expect(404);
  await other.put(reviewLike).send({ liked: true }).expect(200);
  feedback = (await request(app).get(path).expect(200)).body;
  assert.equal(feedback.reviews[0].likes, 1);
  assert.equal(feedback.reviews[0].liked, 0);
  await other.put(reviewLike).send({ liked: false }).expect(200);
  await other.put(path + "/like").send({ liked: false }).expect(200);
  feedback = (await request(app).get(path).expect(200)).body;
  assert.equal(feedback.likes, 0);
  assert.equal(feedback.reviews[0].likes, 0);

  await request(app).get("/api/account/payments").expect(401);
  await other.get("/api/account/payments").expect(200, { payments: [] });
  const { body: { payments } } = await buyer.get("/api/account/payments").expect(200);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].status, "completed");
  assert.equal(payments[0].amountCents, 12999);
  assert.equal(payments[0].items[0].name, "Original product name");
});
