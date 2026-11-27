// S3-20: POST /api/checkout with the deterministic mock bank, through the real HTTP stack.
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ROLES } from "../src/auth.js";
import { TEST_CARDS, createMockBank, validateCard } from "../src/bank.js";
import { createTestApp, signInAsStaff, signUpCustomer } from "../test-support/helpers.js";

let db, app, customer;
beforeEach(async () => {
  ({ db, app } = createTestApp());
  customer = await signUpCustomer(app);
});
afterEach(() => db.close());

let keyCounter = 0;
const newKey = () => `test-key-${String(++keyCounter).padStart(6, "0")}`;
const card = (overrides = {}) => ({
  cardNumber: "4242 4242 4242 4242", cardHolder: "Ayse Yilmaz", expiryMonth: 12, expiryYear: 2030, cvc: "123", ...overrides
});

function pay(agent, { key = newKey(), payment = card(), ...body } = {}) {
  return agent.post("/api/checkout").set("Idempotency-Key", key).send({ payment, ...body });
}

const stockOf = (id) => db.prepare("SELECT stock FROM products WHERE id = ?").get(id).stock;
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

// ---- Access ------------------------------------------------------------------------------

test("guests must sign in before paying", async () => {
  await request(app).post("/api/checkout").set("Idempotency-Key", newKey()).send({ payment: card() }).expect(401);
});

for (const role of [ROLES.PRODUCT_MANAGER, ROLES.SALES_MANAGER, ROLES.SUPPORT_AGENT]) {
  test(`${role} accounts cannot place customer orders`, async () => {
    const staff = await signInAsStaff(app, db, role);
    await staff.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
    await pay(staff).expect(403);
    assert.equal(count("orders"), 0);
  });
}

test("a payment from a foreign origin cannot use the session", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  await pay(customer).set("Origin", "https://evil.example").expect(403);
  assert.equal(count("orders"), 0);
});

// ---- Successful purchase -----------------------------------------------------------------

test("an approved payment creates a processing order from the server cart", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 2 }).expect(200);
  await customer.put("/api/cart/items/p-106").send({ quantity: 1 }).expect(200);
  const response = await pay(customer).expect(201);
  const { order } = response.body;
  assert.equal(order.status, "processing");
  assert.equal(order.totalCents, 2 * 12999 + 5499);
  assert.equal(order.currency, "USD");
  assert.deepEqual(order.items.map((i) => [i.productId, i.quantity, i.lineTotalCents]), [["p-101", 2, 25998], ["p-106", 1, 5499]]);
  assert.deepEqual(order.payment, { status: "completed", amountCents: 31497, cardLast4: "4242" });
  assert.equal(response.body.replayed, false);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("after purchase the catalog shows lower stock and the bag is empty", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 2 }).expect(200);
  await pay(customer).expect(201);
  const detail = await request(app).get("/api/products/p-101").expect(200);
  assert.equal(detail.body.product.stock, 15);
  await customer.get("/api/cart").expect(200, { items: [] });
});

test("the purchase appears in the SCRUM-14 payment history", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const { body } = await pay(customer).expect(201);
  const history = await customer.get("/api/account/payments").expect(200);
  assert.equal(history.body.payments[0].orderId, body.order.id);
  assert.equal(history.body.payments[0].status, "completed");
});

test("the delivery address defaults to the profile home address", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const { body } = await pay(customer).expect(201);
  assert.equal(body.order.deliveryAddress, "Orta Mah. Universite Cad. 27, Tuzla, Istanbul");
});

test("a different delivery address can be given for one order", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const { body } = await pay(customer, { deliveryAddress: "  Bagdat Cad. 1, Kadikoy  " }).expect(201);
  assert.equal(body.order.deliveryAddress, "Bagdat Cad. 1, Kadikoy");
});

for (const deliveryAddress of ["abc", 42, "x".repeat(301)]) {
  test(`delivery address ${JSON.stringify(deliveryAddress).slice(0, 12)} is rejected`, async () => {
    await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
    const response = await pay(customer, { deliveryAddress }).expect(400);
    assert.ok(response.body.fields.deliveryAddress);
    assert.equal(count("orders"), 0);
  });
}

// ---- Bank responses ----------------------------------------------------------------------

for (const [number, reason] of [[TEST_CARDS.declined, "Card declined"], [TEST_CARDS.insufficientFunds, "Insufficient funds"]]) {
  test(`test card ${number} is declined with "${reason}" and nothing is bought`, async () => {
    await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
    const response = await pay(customer, { payment: card({ cardNumber: number }) }).expect(402);
    assert.equal(response.body.code, "payment_declined");
    assert.match(response.body.error, new RegExp(reason));
    assert.equal(stockOf("p-101"), 17);
    assert.equal(count("orders"), 0);
    await customer.get("/api/cart").expect(200, { items: [{ productId: "p-101", quantity: 1 }] });
  });
}

test("the bank decision is the same every time for the same card", () => {
  const bank = createMockBank();
  const declined = validateCard(card({ cardNumber: TEST_CARDS.declined }));
  const approved = validateCard(card());
  for (let i = 0; i < 3; i += 1) {
    assert.equal(bank.charge({ amountCents: 100, card: declined }).approved, false);
    assert.equal(bank.charge({ amountCents: 100, card: approved }).approved, true);
  }
});

test("an unreachable bank answers 503 and buys nothing", async () => {
  const broken = createTestApp({ bank: { charge() { throw new Error("bank timeout"); } } });
  const agent = await signUpCustomer(broken.app);
  await agent.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const original = console.error;
  console.error = () => {};
  try {
    await pay(agent).expect(503);
  } finally {
    console.error = original;
  }
  assert.equal(broken.db.prepare("SELECT stock FROM products WHERE id = 'p-101'").get().stock, 17);
  assert.equal(broken.db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
  broken.db.close();
});

// ---- Repeated requests -------------------------------------------------------------------

test("resending the same request returns the same order and charges once", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const key = newKey();
  const first = await pay(customer, { key }).expect(201);
  const again = await pay(customer, { key }).expect(200);
  assert.equal(again.body.order.id, first.body.order.id);
  assert.equal(again.body.replayed, true);
  assert.equal(count("orders"), 1);
  assert.equal(count("payments"), 1);
  assert.equal(stockOf("p-101"), 16);
});

test("a double click sending the same key at once creates one order", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const key = newKey();
  const responses = await Promise.all([pay(customer, { key }), pay(customer, { key }), pay(customer, { key })]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set(responses.map((r) => r.body.order.id)).size, 1);
  assert.equal(count("orders"), 1);
});

test("resending a declined request stays declined", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const key = newKey();
  await pay(customer, { key, payment: card({ cardNumber: TEST_CARDS.declined }) }).expect(402);
  const again = await pay(customer, { key, payment: card({ cardNumber: TEST_CARDS.declined }) }).expect(402);
  assert.equal(again.body.replayed, true);
});

for (const key of [undefined, "short", "has spaces in it"]) {
  test(`a missing or malformed Idempotency-Key (${key}) is rejected`, async () => {
    await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
    const call = customer.post("/api/checkout");
    if (key) call.set("Idempotency-Key", key);
    await call.send({ payment: card() }).expect(400);
    assert.equal(count("orders"), 0);
  });
}

// ---- Stock and price changes -------------------------------------------------------------

test("two customers racing for the last unit: exactly one gets it", async () => {
  db.prepare("UPDATE products SET stock = 1 WHERE id = 'p-107'").run();
  const other = await signUpCustomer(app, { email: "mert@example.com" });
  await customer.put("/api/cart/items/p-107").send({ quantity: 1 }).expect(200);
  await other.put("/api/cart/items/p-107").send({ quantity: 1 }).expect(200);
  const responses = await Promise.all([pay(customer), pay(other)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(responses.find((r) => r.status === 409).body.code, "stock_changed");
  assert.equal(stockOf("p-107"), 0);
});

test("stock that dropped after the bag was filled is reported per line", async () => {
  await customer.put("/api/cart/items/p-108").send({ quantity: 4 }).expect(200);
  db.prepare("UPDATE products SET stock = 2 WHERE id = 'p-108'").run();
  const response = await pay(customer).expect(409);
  assert.deepEqual(response.body.items, [{ productId: "p-108", name: "Creative Tablet", requested: 4, available: 2 }]);
});

test("a stale total from the checkout page is refused with the new total", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  const response = await pay(customer, { expectedTotalCents: 9999 }).expect(409);
  assert.equal(response.body.code, "price_changed");
  assert.equal(response.body.totalCents, 12999);
  await pay(customer, { expectedTotalCents: 12999 }).expect(201);
});

test("an empty bag cannot be paid for", async () => {
  await pay(customer).expect(400);
});

// ---- Card data ---------------------------------------------------------------------------

test("the card number and security code are never stored", async () => {
  await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
  await pay(customer, { payment: card({ cvc: "987" }) }).expect(201);
  await pay(customer, { payment: card({ cardNumber: TEST_CARDS.declined, cvc: "987" }) });
  const dump = JSON.stringify(["orders", "payments", "checkout_attempts", "order_items"]
    .map((table) => db.prepare(`SELECT * FROM ${table}`).all()));
  assert.ok(!dump.includes("4242424242424242"));
  assert.ok(!dump.includes("4000000000000002"));
  assert.ok(!dump.includes("987"));
});

for (const [field, payment] of [
  ["cardNumber", card({ cardNumber: "4242 4242 4242 4241" })],
  ["cardNumber", card({ cardNumber: "abcd" })],
  ["cardHolder", card({ cardHolder: " " })],
  ["expiry", card({ expiryMonth: 13 })],
  ["expiry", card({ expiryYear: 2020 })],
  ["expiry", card({ expiryMonth: "12" })],
  ["cvc", card({ cvc: "12" })],
  ["cvc", card({ cvc: 123 })]
]) {
  test(`payment with a bad ${field} is rejected before the bank`, async () => {
    await customer.put("/api/cart/items/p-101").send({ quantity: 1 }).expect(200);
    const response = await pay(customer, { payment }).expect(400);
    assert.ok(response.body.fields[field]);
    assert.equal(count("checkout_attempts"), 0);
  });
}

test("a card expiring this month is still accepted", () => {
  const now = new Date(Date.UTC(2026, 10, 27));
  assert.equal(validateCard(card({ expiryMonth: 11, expiryYear: 2026 }), now).last4, "4242");
  assert.throws(() => validateCard(card({ expiryMonth: 10, expiryYear: 2026 }), now), /payment details/);
});
