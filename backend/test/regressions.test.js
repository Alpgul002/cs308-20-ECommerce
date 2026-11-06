// One regression test per defect in docs/BUG_REPORTS.md. The IDs match that file.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { getProducts } from "../src/catalog.js";

let db, app;
before(() => {
  db = createDatabase(":memory:");
  app = createApp(db);
});
after(() => db.close());

test("BUG-01 oversized JSON body returns 413, not 500", async () => {
  const response = await request(app).post("/api/cart/validate")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ items: [], pad: "x".repeat(40 * 1024) }));
  assert.equal(response.status, 413);
  assert.ok(response.body.error);
});

test("BUG-02 unsupported body charset returns 415, not 500", async () => {
  const response = await request(app).post("/api/cart/validate")
    .set("Content-Type", "application/json; charset=foo").send("{}");
  assert.equal(response.status, 415);
});

for (const wildcard of ["%", "_", "!"]) {
  test(`BUG-03 search treats ${JSON.stringify(wildcard)} as literal text`, async () => {
    const response = await request(app).get("/api/products").query({ search: wildcard }).expect(200);
    assert.equal(response.body.products.length, 0);
  });
}

test("BUG-03 search still finds text that really contains a wildcard", () => {
  const memory = createDatabase(":memory:");
  memory.prepare("UPDATE products SET description = '100% cotton_case' WHERE id = 'p-101'").run();
  assert.deepEqual(getProducts(memory, { search: "100%" }).map((p) => p.id), ["p-101"]);
  assert.deepEqual(getProducts(memory, { search: "cotton_case" }).map((p) => p.id), ["p-101"]);
  memory.close();
});

test("BUG-04 catalog listing is not cut off at 100 products", () => {
  const memory = createDatabase(":memory:");
  const insert = memory.prepare(`
    INSERT INTO products (id, category_slug, name, brand, model, serial_number, description,
      stock, price_cents, warranty_months, warranty_status, distributor, popularity, image_key, accent)
    VALUES (?, 'audio', ?, 'Brand', 'Model', ?, 'Description', 1, 100, 0, 'Active', 'Dist', 0, 'speaker', 'mint')
  `);
  for (let n = 200; n < 320; n += 1) insert.run(`p-${n}`, `Extra ${n}`, `SER-${n}`);
  assert.equal(getProducts(memory).length, 129);
  memory.close();
});

