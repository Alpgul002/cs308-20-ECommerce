import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { ROLES } from "../src/auth.js";
import { isValidCartInput } from "../src/catalog.js";
import { createDatabase } from "../src/db.js";
import { ACCENTS, IMAGE_KEYS } from "../src/productAdmin.js";
import { normalizeCart } from "../../frontend/src/cart.js";
import { FAST_ROUNDS, createTestApp, signInAsStaff, signUpCustomer } from "../test-support/helpers.js";

let db, app, manager;
beforeEach(async () => {
  ({ db, app } = createTestApp());
  manager = await signInAsStaff(app, db, ROLES.PRODUCT_MANAGER);
});
afterEach(() => db.close());

let serial = 0;
function validProduct(overrides = {}) {
  serial += 1;
  return {
    name: "Travel Router",
    brand: "Core",
    model: "TR-1",
    serialNumber: `TRV-${serial}`,
    description: "Pocket-sized router for hotels and trains.",
    stock: 12,
    priceCents: 4999,
    warrantyMonths: 24,
    warrantyStatus: "Active",
    distributor: "Core Computer Systems",
    categorySlug: "computing",
    imageKey: "laptop",
    accent: "blue",
    ...overrides
  };
}

const addProduct = (overrides) => manager.post("/api/products").send(validProduct(overrides));
const rowCount = () => db.prepare("SELECT COUNT(*) AS n FROM products").get().n;

// ---- Permissions -------------------------------------------------------------------------

test("guests cannot add or remove products", async () => {
  await request(app).post("/api/products").send(validProduct()).expect(401);
  await request(app).delete("/api/products/p-101").expect(401);
  assert.equal(rowCount(), 9);
});

test("a forged session cookie cannot add products", async () => {
  await request(app).post("/api/products").set("Cookie", "orbit_session=forged").send(validProduct()).expect(401);
});

test("customers cannot add or remove products", async () => {
  const customer = await signUpCustomer(app);
  await customer.post("/api/products").send(validProduct()).expect(403);
  await customer.delete("/api/products/p-101").expect(403);
  await request(app).get("/api/products/p-101").expect(200);
});

for (const role of [ROLES.SALES_MANAGER, ROLES.SUPPORT_AGENT]) {
  test(`${role} cannot add or remove products`, async () => {
    const staff = await signInAsStaff(app, db, role);
    await staff.post("/api/products").send(validProduct()).expect(403);
    await staff.delete("/api/products/p-101").expect(403);
    await request(app).get("/api/products/p-101").expect(200);
  });
}

test("permission is checked before input, so outsiders learn nothing about validation", async () => {
  await request(app).post("/api/products").send({}).expect(401);
  const customer = await signUpCustomer(app);
  await customer.post("/api/products").send({}).expect(403);
});

test("removing a product from a foreign origin is blocked", async () => {
  await manager.delete("/api/products/p-101").set("Origin", "https://evil.example").expect(403);
  await request(app).get("/api/products/p-101").expect(200);
});

test("signing out takes the permission away", async () => {
  await manager.post("/api/auth/logout").expect(200);
  await manager.post("/api/products").send(validProduct()).expect(401);
});

// ---- Adding ------------------------------------------------------------------------------

test("product manager adds a product and gets it back", async () => {
  const response = await addProduct({ name: "  Travel Router  " }).expect(201);
  assert.equal(response.body.product.id, "p-110");
  assert.equal(response.body.product.name, "Travel Router");
  assert.equal(response.headers.location, "/api/products/p-110");
});

test("an added product has exactly the fields the storefront renders", async () => {
  const seeded = await request(app).get("/api/products/p-101").expect(200);
  const added = await addProduct().expect(201);
  const { costCents, ...publicFields } = added.body.product;
  assert.equal(typeof costCents, "number");
  assert.deepEqual(Object.keys(publicFields).sort(), Object.keys(seeded.body.product).sort());
});

test("an added product appears in list, detail, search and category counts", async () => {
  const { body } = await addProduct({ name: "Unique Zebra Router" }).expect(201);
  const list = await request(app).get("/api/products").expect(200);
  assert.ok(list.body.products.some((p) => p.id === body.product.id));
  await request(app).get(`/api/products/${body.product.id}`).expect(200);
  const search = await request(app).get("/api/products").query({ search: "zebra" }).expect(200);
  assert.equal(search.body.products.length, 1);
  const { body: { categories } } = await request(app).get("/api/categories").expect(200);
  assert.equal(categories.find((c) => c.slug === "computing").productCount, 4);
});

test("a new product works with the frontend cart and the cart API", async () => {
  const { body: { product } } = await addProduct().expect(201);
  const line = [{ productId: product.id, quantity: 2 }];
  assert.deepEqual(normalizeCart(line), line);
  assert.equal(isValidCartInput(line), true);
  const quote = await request(app).post("/api/cart/validate").send({ items: line }).expect(200);
  assert.equal(quote.body.valid, true);
  assert.equal(quote.body.subtotalCents, 9998);
});

test("a new product can be added with zero stock and stays searchable but unavailable", async () => {
  const { body: { product } } = await addProduct({ stock: 0 }).expect(201);
  await request(app).get(`/api/products/${product.id}`).expect(200);
  const quote = await request(app).post("/api/cart/validate")
    .send({ items: [{ productId: product.id, quantity: 1 }] }).expect(200);
  assert.equal(quote.body.items[0].reason, "Out of stock");
});

test("the client cannot choose the ID, popularity or deleted state", async () => {
  const response = await addProduct({ id: "p-101", popularity: 9999, deletedAt: "2020", deleted_at: "2020" }).expect(201);
  assert.equal(response.body.product.id, "p-110");
  assert.equal(response.body.product.popularity, 0);
  assert.equal(db.prepare("SELECT deleted_at FROM products WHERE id = 'p-110'").get().deleted_at, null);
});

test("cost defaults to half the price, rounded down", async () => {
  const { body } = await addProduct({ priceCents: 4999 }).expect(201);
  assert.equal(body.product.costCents, 2499);
  assert.equal(db.prepare("SELECT cost_cents FROM products WHERE id = ?").get(body.product.id).cost_cents, 2499);
});

test("the product manager can set the cost, including zero", async () => {
  assert.equal((await addProduct({ costCents: 1000 }).expect(201)).body.product.costCents, 1000);
  assert.equal((await addProduct({ costCents: 0 }).expect(201)).body.product.costCents, 0);
});

test("cost is never visible in the public catalog", async () => {
  const { body: { product } } = await addProduct({ costCents: 1000 }).expect(201);
  const detail = await request(app).get(`/api/products/${product.id}`).expect(200);
  const list = await request(app).get("/api/products").expect(200);
  assert.equal(detail.body.product.costCents, undefined);
  assert.ok(list.body.products.every((p) => p.costCents === undefined && p.cost_cents === undefined));
});

test("image and accent have defaults the storefront can render", async () => {
  const { body } = await addProduct({ imageKey: undefined, accent: undefined }).expect(201);
  assert.ok(IMAGE_KEYS.includes(body.product.imageKey));
  assert.ok(ACCENTS.includes(body.product.accent));
});

test("empty body reports every required field", async () => {
  const response = await manager.post("/api/products").send({}).expect(400);
  assert.deepEqual(Object.keys(response.body.fields).sort(), [
    "brand", "categorySlug", "description", "distributor", "model", "name", "priceCents",
    "serialNumber", "stock", "warrantyMonths", "warrantyStatus"
  ]);
  assert.equal(rowCount(), 9);
});

for (const [field, value] of [
  ["name", "   "], ["name", "x".repeat(121)], ["name", 123], ["description", "x".repeat(2001)],
  ["priceCents", 0], ["priceCents", -1], ["priceCents", 12.5], ["priceCents", "4999"], ["priceCents", 100_000_001],
  ["stock", -1], ["stock", 1.5], ["stock", "5"], ["stock", null], ["warrantyMonths", -1], ["warrantyMonths", 121],
  ["costCents", -1], ["costCents", 1.5], ["costCents", "10"],
  ["categorySlug", "missing"], ["categorySlug", 5], ["imageKey", "toaster"], ["accent", "neon"]
]) {
  test(`add rejects ${field}=${JSON.stringify(value).slice(0, 20)}`, async () => {
    const response = await addProduct({ [field]: value }).expect(400);
    assert.ok(response.body.fields[field]);
    assert.equal(rowCount(), 9);
  });
}

test("a JSON array body is rejected, not stored", async () => {
  await manager.post("/api/products").send([validProduct()]).expect(400);
  assert.equal(rowCount(), 9);
});

test("SQL in text fields is stored as plain text", async () => {
  const name = "'); DROP TABLE products;--";
  const { body } = await addProduct({ name }).expect(201);
  assert.equal(body.product.name, name);
  assert.equal(rowCount(), 10);
});

test("a duplicate serial number is rejected", async () => {
  await addProduct({ serialNumber: "SAME-1" }).expect(201);
  const response = await addProduct({ serialNumber: "SAME-1" }).expect(409);
  assert.ok(response.body.fields.serialNumber);
  await addProduct({ serialNumber: "AUD-100-2026" }).expect(409);
});

test("concurrent adds all get different IDs", async () => {
  const responses = await Promise.all(Array.from({ length: 20 }, () => addProduct()));
  assert.ok(responses.every((r) => r.status === 201));
  const ids = responses.map((r) => r.body.product.id);
  assert.equal(new Set(ids).size, 20);
});

test("of two concurrent adds with one serial number, exactly one wins", async () => {
  const responses = await Promise.all([addProduct({ serialNumber: "RACE-1" }), addProduct({ serialNumber: "RACE-1" })]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
});

test("running out of p-NNN IDs is a clear error, not a broken ID", async () => {
  db.prepare("UPDATE products SET id = 'p-999' WHERE id = 'p-109'").run();
  const response = await addProduct().expect(409);
  assert.match(response.body.error, /IDs/);
});

// ---- Removing ----------------------------------------------------------------------------

test("product manager removes a product and gets JSON back", async () => {
  const response = await manager.delete("/api/products/p-105").expect(200);
  assert.deepEqual(response.body, { deleted: true, id: "p-105" });
});

test("a removed product disappears from list, detail, search and category counts", async () => {
  await manager.delete("/api/products/p-105").expect(200);
  const list = await request(app).get("/api/products").expect(200);
  assert.ok(!list.body.products.some((p) => p.id === "p-105"));
  assert.equal(list.body.products.length, 8);
  await request(app).get("/api/products/p-105").expect(404);
  const search = await request(app).get("/api/products").query({ search: "Mechanical Keyboard" }).expect(200);
  assert.equal(search.body.products.length, 0);
  const { body: { categories } } = await request(app).get("/api/categories").expect(200);
  assert.equal(categories.find((c) => c.slug === "computing").productCount, 2);
});

test("a cart holding a removed product is told it is gone", async () => {
  await manager.delete("/api/products/p-105").expect(200);
  const quote = await request(app).post("/api/cart/validate")
    .send({ items: [{ productId: "p-105", quantity: 1 }] }).expect(200);
  assert.equal(quote.body.valid, false);
  assert.equal(quote.body.items[0].reason, "Product not found");
});

test("removing keeps the row so future orders and refunds can still resolve it", async () => {
  await manager.delete("/api/products/p-105").expect(200);
  const row = db.prepare("SELECT name, deleted_at FROM products WHERE id = 'p-105'").get();
  assert.equal(row.name, "Mechanical Keyboard");
  assert.match(row.deleted_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("removing twice gives 404 the second time", async () => {
  await manager.delete("/api/products/p-105").expect(200);
  await manager.delete("/api/products/p-105").expect(404);
});

test("removing an unknown product gives 404", async () => {
  await manager.delete("/api/products/p-777").expect(404);
  await manager.delete("/api/products/not-an-id").expect(404);
});

test("of two concurrent removals, exactly one succeeds", async () => {
  const responses = await Promise.all([manager.delete("/api/products/p-105"), manager.delete("/api/products/p-105")]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 404]);
});

test("an ID is never reused, even after the newest product is removed", async () => {
  const first = await addProduct().expect(201);
  await manager.delete(`/api/products/${first.body.product.id}`).expect(200);
  const second = await addProduct().expect(201);
  assert.notEqual(second.body.product.id, first.body.product.id);
});

test("a removed product's serial number can be used again", async () => {
  await manager.delete("/api/products/p-101").expect(200);
  await addProduct({ serialNumber: "AUD-100-2026" }).expect(201);
});

test("removal survives a server restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cs308-products-"));
  const file = join(dir, "store.sqlite");
  try {
    const first = createDatabase(file);
    const pm = await signInAsStaff(createApp(first, { bcryptRounds: FAST_ROUNDS }), first, ROLES.PRODUCT_MANAGER);
    await pm.delete("/api/products/p-101").expect(200);
    first.close();
    const second = createDatabase(file);
    await request(createApp(second)).get("/api/products/p-101").expect(404);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Contract with the frontend ----------------------------------------------------------

test("IMAGE_KEYS match the icons in ProductArt.jsx", () => {
  const source = readFileSync(new URL("../../frontend/src/ProductArt.jsx", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("const icons = {"), source.indexOf("};"));
  const keys = [...block.matchAll(/^\s+(\w+):/gm)].map((match) => match[1]);
  assert.deepEqual([...keys].sort(), [...IMAGE_KEYS].sort());
});

test("ACCENTS match the art classes in styles.css", () => {
  const css = readFileSync(new URL("../../frontend/src/styles.css", import.meta.url), "utf8");
  const classes = [...css.matchAll(/^\.art--([a-z]+)\s*\{/gm)].map((match) => match[1]);
  assert.deepEqual([...new Set(classes)].sort(), [...ACCENTS].sort());
});
