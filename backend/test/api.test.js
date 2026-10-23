import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";

let db, app;
before(() => {
  db = createDatabase(":memory:");
  app = createApp(db);
});
after(() => db.close());

test("GET /api/health reports healthy", async () => {
  const response = await request(app).get("/api/health").expect(200);
  assert.equal(response.body.status, "ok");
});
test("GET /api/categories returns categories", async () => {
  const response = await request(app).get("/api/categories").expect(200);
  assert.equal(response.body.categories.length, 4);
});
test("GET /api/products returns products", async () => {
  const response = await request(app).get("/api/products").expect(200);
  assert.equal(response.body.products.length, 9);
});
test("GET /api/products applies category filter", async () => {
  const response = await request(app).get("/api/products?category=photography").expect(200);
  assert.equal(response.body.products.length, 1);
});
test("GET /api/products rejects unknown sort option", async () =>
  request(app).get("/api/products?sort=DROP").expect(400));
test("GET /api/products/:id returns a product", async () => {
  const response = await request(app).get("/api/products/p-101").expect(200);
  assert.equal(response.body.product.name, "Studio Headphones");
});
test("GET /api/products/:id returns 404 for unknown ID", async () =>
  request(app).get("/api/products/bad").expect(404));
test("POST /api/cart/validate accepts a valid cart", async () => {
  const response = await request(app).post("/api/cart/validate")
    .send({ items: [{ productId: "p-101", quantity: 2 }] }).expect(200);
  assert.equal(response.body.subtotalCents, 25998);
});
test("POST /api/cart/validate flags insufficient stock", async () => {
  const response = await request(app).post("/api/cart/validate")
    .send({ items: [{ productId: "p-108", quantity: 20 }] }).expect(200);
  assert.equal(response.body.valid, false);
});
test("POST /api/cart/validate rejects missing items", async () =>
  request(app).post("/api/cart/validate").send({}).expect(400));
test("POST /api/cart/validate rejects invalid quantities", async () =>
  request(app).post("/api/cart/validate").send({ items: [{ productId: "p-101", quantity: -1 }] }).expect(400));
test("POST /api/cart/validate rejects duplicated IDs", async () =>
  request(app).post("/api/cart/validate").send({ items: [{ productId: "p-101", quantity: 1 }, { productId: "p-101", quantity: 1 }] }).expect(400));
test("malformed JSON produces safe 400 response", async () =>
  request(app).post("/api/cart/validate").set("Content-Type", "application/json").send("{bad").expect(400));
test("missing route returns 404", async () =>
  request(app).get("/api/not-a-real-route").expect(404));
