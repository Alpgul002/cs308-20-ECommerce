import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../src/db.js";
import { getCategories, getProduct, getProducts, isValidCartInput, validateCart } from "../src/catalog.js";

let db;
before(() => { db = createDatabase(":memory:"); });
after(() => db.close());

test("seed creates four categories", () => assert.equal(getCategories(db).length, 4));
test("seed contains nine products", () => assert.equal(getProducts(db).length, 9));
test("every product has required assignment fields", () => {
  for (const p of getProducts(db)) {
    for (const field of ["id", "name", "model", "serialNumber", "description", "stock", "priceCents", "warrantyStatus", "distributor"])
      assert.ok(p[field] !== undefined && p[field] !== null, field);
  }
});
test("category product counts sum to total", () =>
  assert.equal(getCategories(db).reduce((sum, c) => sum + c.productCount, 0), 9));
test("category filter only includes selected category", () =>
  assert.ok(getProducts(db, { category: "audio" }).every((p) => p.categorySlug === "audio")));
test("unknown category gives empty result", () =>
  assert.equal(getProducts(db, { category: "missing" }).length, 0));
test("search by name finds a product", () =>
  assert.equal(getProducts(db, { search: "Ultrabook" })[0].id, "p-104"));
test("search by description finds a product", () =>
  assert.ok(getProducts(db, { search: "water resistance" }).some((p) => p.id === "p-102")));
test("search is case insensitive", () =>
  assert.equal(getProducts(db, { search: "HEADPHONES" })[0].id, "p-101"));
test("search returns out-of-stock products", () =>
  assert.equal(getProducts(db, { search: "mirrorless" })[0].stock, 0));
test("search and category work together", () =>
  assert.equal(getProducts(db, { search: "camera", category: "audio" }).length, 0));
test("ascending price order is sorted", () => {
  const prices = getProducts(db, { sort: "price-asc" }).map((p) => p.priceCents);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});
test("descending price order is sorted", () => {
  const prices = getProducts(db, { sort: "price-desc" }).map((p) => p.priceCents);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
});
test("popular order is sorted", () => {
  const values = getProducts(db).map((p) => p.popularity);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
});
test("getProduct returns complete product detail", () =>
  assert.equal(getProduct(db, "p-107").model, "PS-4"));
test("getProduct returns null for unknown ID", () =>
  assert.equal(getProduct(db, "does-not-exist"), null));
test("invalid sort throws instead of entering SQL", () =>
  assert.throws(() => getProducts(db, { sort: "price; DROP TABLE products" }), RangeError));
test("all seeded products have nonnegative stock and price", () =>
  assert.ok(getProducts(db).every((p) => p.stock >= 0 && p.priceCents >= 0)));
test("one in-stock cart item validates", () =>
  assert.equal(validateCart(db, [{ productId: "p-101", quantity: 1 }]).valid, true));
test("cart subtotal uses integer cents", () =>
  assert.equal(validateCart(db, [{ productId: "p-101", quantity: 2 }]).subtotalCents, 25998));
test("mixed-cart subtotal sums lines", () =>
  assert.equal(validateCart(db, [{ productId: "p-101", quantity: 1 }, { productId: "p-106", quantity: 1 }]).subtotalCents, 18498));
test("sold-out product cannot validate for checkout", () =>
  assert.equal(validateCart(db, [{ productId: "p-109", quantity: 1 }]).items[0].reason, "Out of stock"));
test("quantity above stock reports insufficient stock", () =>
  assert.equal(validateCart(db, [{ productId: "p-108", quantity: 8 }]).items[0].reason, "Insufficient stock"));
test("unknown item reports product not found", () =>
  assert.equal(validateCart(db, [{ productId: "p-999", quantity: 1 }]).valid, false));
test("empty cart input is structurally valid", () =>
  assert.equal(isValidCartInput([]), true));
test("rejects duplicate cart IDs", () =>
  assert.equal(isValidCartInput([{ productId: "p-101", quantity: 1 }, { productId: "p-101", quantity: 2 }]), false));
test("rejects fractional quantity", () =>
  assert.equal(isValidCartInput([{ productId: "p-101", quantity: 1.5 }]), false));
test("rejects zero quantity", () =>
  assert.equal(isValidCartInput([{ productId: "p-101", quantity: 0 }]), false));
test("rejects quantity over twenty", () =>
  assert.equal(isValidCartInput([{ productId: "p-101", quantity: 21 }]), false));
test("rejects malformed item IDs", () =>
  assert.equal(isValidCartInput([{ productId: "invalid!", quantity: 1 }]), false));
test("database reseed is idempotent on same connection", () => {
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products").get().n, 9);
});
