import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestApp } from "../test-support/helpers.js";
import { createDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";

function fixture(t) {
  const context = createTestApp();
  t.after(() => context.db.close());
  return { ...context, api: request(context.app) };
}

test("SCRUM-12: category, description search, price, stock and sort combine in SQLite", async (t) => {
  const { api } = fixture(t);
  const { body } = await api.get("/api/products").query({ category: "audio", search: "wireless", minPrice: "70", maxPrice: "130", inStock: "true", sort: "price-asc" }).expect(200);
  assert.deepEqual(body.products.map((p) => p.id), ["p-103", "p-101"]);
});

test("SCRUM-12: inclusive decimal price boundaries use integer cents", async (t) => {
  const { api } = fixture(t);
  const { body } = await api.get("/api/products?minPrice=129.99&maxPrice=129.99").expect(200);
  assert.deepEqual(body.products.map((p) => p.id), ["p-101"]);
});

test("SCRUM-12: sold-out products are visible unless stock filter is explicitly selected", async (t) => {
  const { api } = fixture(t);
  assert.equal((await api.get("/api/products?search=mirrorless")).body.products.length, 1);
  assert.equal((await api.get("/api/products?search=mirrorless&inStock=true")).body.products.length, 0);
});

for (const query of ["minPrice=-1", "maxPrice=abc", "minPrice=1.001", "minPrice=1e2", "minPrice=Infinity", "minPrice=10000000", "minPrice=20&maxPrice=10", "minPrice=1&minPrice=2", "category=audio&category=wearables", "search=a&search=b", "sort=price-asc&sort=name", "inStock=1", "inStock=true&inStock=false"]) {
  test(`SCRUM-12: rejects malformed filter ${query}`, async (t) => {
    await fixture(t).api.get(`/api/products?${query}`).expect(400);
  });
}

test("SCRUM-12: literal wildcard/injection searches cannot broaden the query", async (t) => {
  const { api } = fixture(t);
  for (const search of ["%", "_", "' OR 1=1 --"]) {
    assert.deepEqual((await api.get("/api/products").query({ search }).expect(200)).body.products, []);
  }
});

test("SCRUM-12: API reads changed price/stock from DB for both list and detail", async (t) => {
  const { db, api } = fixture(t);
  db.prepare("UPDATE products SET price_cents = 1999, stock = 0 WHERE id = 'p-101'").run();
  const detail = await api.get("/api/products/p-101").expect(200);
  assert.equal(detail.body.product.priceCents, 1999);
  assert.equal(detail.body.product.stock, 0);
  assert.equal(detail.headers["cache-control"], "no-store");
  const list = await api.get("/api/products?search=Studio&maxPrice=20").expect(200);
  assert.equal(list.body.products[0].priceCents, 1999);
  assert.equal((await api.get("/api/products?search=Studio&inStock=true")).body.products.length, 0);
});

test("SCRUM-12: soft-deleted product disappears from counts/list and detail returns 404", async (t) => {
  const { db, api } = fixture(t);
  db.prepare("UPDATE products SET deleted_at = '2026-01-01' WHERE id = 'p-101'").run();
  await api.get("/api/products/p-101").expect(404);
  assert.equal((await api.get("/api/products?search=Studio")).body.products.length, 0);
  const categories = (await api.get("/api/categories")).body.categories;
  assert.equal(categories.find((c) => c.slug === "audio").productCount, 2);
});

test("SCRUM-12: filtering does not hide cart items from the stock validation API", async (t) => {
  const { api } = fixture(t);
  await api.get("/api/products?category=photography&inStock=true").expect(200);
  const { body } = await api.post("/api/cart/validate").send({ items: [{ productId: "p-101", quantity: 2 }] }).expect(200);
  assert.equal(body.valid, true);
  assert.equal(body.items[0].productId, "p-101");
  assert.equal(body.subtotalCents, 25998);
});

test("SCRUM-12: changed inventory survives closing/reopening a real SQLite file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orbit-scrum12-"));
  let db;
  try {
    db = createDatabase(join(dir, "store.sqlite"));
    db.prepare("UPDATE products SET price_cents = 1234 WHERE id = 'p-101'").run();
    db.close();
    db = createDatabase(join(dir, "store.sqlite"));
    const api = request(createApp(db));
    assert.equal((await api.get("/api/products/p-101")).body.product.priceCents, 1234);
    assert.equal((await api.get("/api/products?minPrice=12.34&maxPrice=12.34")).body.products[0].id, "p-101");
  } finally { db?.close(); rmSync(dir, { recursive: true, force: true }); }
});
