// S3-22: order history and invoice access. Customers see only their own orders; product
// and sales managers may open any order; everything is read from the purchase snapshot.
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ROLES } from "../src/auth.js";
import { TEST_CARDS } from "../src/bank.js";
import { invoiceNumber } from "../src/orderRoutes.js";
import { createTestApp, signInAsStaff, signUpCustomer } from "../test-support/helpers.js";

let db, app, ayse, mert;
beforeEach(async () => {
  ({ db, app } = createTestApp());
  ayse = await signUpCustomer(app);
  mert = await signUpCustomer(app, { email: "mert@example.com", name: "Mert Kaya" });
});
afterEach(() => db.close());

let keyCounter = 0;
const card = (cardNumber = TEST_CARDS.approved) => ({
  cardNumber, cardHolder: "Card Holder", expiryMonth: 12, expiryYear: 2030, cvc: "123"
});

async function buy(agent, lines, { cardNumber, expect = 201 } = {}) {
  for (const [productId, quantity] of lines) {
    await agent.put(`/api/cart/items/${productId}`).send({ quantity }).expect(200);
  }
  const response = await agent.post("/api/checkout")
    .set("Idempotency-Key", `order-test-${++keyCounter}`)
    .send({ payment: card(cardNumber) }).expect(expect);
  return response.body.order;
}

function readPdf(response, callback) {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  response.on("error", callback);
  response.on("end", () => callback(null, Buffer.concat(chunks)));
}

// ---- History -----------------------------------------------------------------------------

test("guests cannot read orders or invoices", async () => {
  const order = await buy(ayse, [["p-101", 1]]);
  await request(app).get("/api/orders").expect(401);
  await request(app).get(`/api/orders/${order.id}`).expect(401);
  await request(app).get(`/api/orders/${order.id}/invoice`).expect(401);
});

test("a customer's history lists only their own orders, newest first", async () => {
  const first = await buy(ayse, [["p-101", 1]]);
  const second = await buy(ayse, [["p-102", 2]]);
  await buy(mert, [["p-103", 1]]);
  const { body } = await ayse.get("/api/orders").expect(200);
  assert.deepEqual(body.orders.map((o) => o.id), [second.id, first.id]);
  assert.deepEqual(body.orders[0].items.map((i) => [i.productId, i.quantity]), [["p-102", 2]]);
  assert.ok(body.orders.every((o) => o.status === "processing"));
});

test("a customer with no orders gets an empty list", async () => {
  await ayse.get("/api/orders").expect(200, { orders: [] });
});

test("the history list is for customers; staff open orders one by one", async () => {
  const manager = await signInAsStaff(app, db, ROLES.PRODUCT_MANAGER);
  await manager.get("/api/orders").expect(403);
});

test("a customer opens the detail of their own order", async () => {
  const order = await buy(ayse, [["p-101", 2]]);
  const { body } = await ayse.get(`/api/orders/${order.id}`).expect(200);
  assert.deepEqual(body.order, order);
});

test("another customer's order answers 404, as if it did not exist", async () => {
  const order = await buy(ayse, [["p-101", 1]]);
  const response = await mert.get(`/api/orders/${order.id}`).expect(404);
  assert.doesNotMatch(JSON.stringify(response.body), /Ayse|Tuzla|p-101/);
});

for (const id of ["999", "0", "-1", "abc", "1.5", "1e3"]) {
  test(`order id ${JSON.stringify(id)} that is unknown or malformed answers 404`, async () => {
    await ayse.get(`/api/orders/${id}`).expect(404);
  });
}

test("a declined payment leaves no order in the history", async () => {
  await buy(ayse, [["p-101", 1]], { cardNumber: TEST_CARDS.declined, expect: 402 });
  await ayse.get("/api/orders").expect(200, { orders: [] });
});

// ---- Snapshot ----------------------------------------------------------------------------

test("history keeps purchase-time names and prices after the catalog changes", async () => {
  const order = await buy(ayse, [["p-101", 2]]);
  db.prepare("UPDATE products SET price_cents = 1, name = 'Renamed' WHERE id = 'p-101'").run();
  const manager = await signInAsStaff(app, db, ROLES.PRODUCT_MANAGER);
  await manager.delete("/api/products/p-101").expect(200);
  const { body } = await ayse.get(`/api/orders/${order.id}`).expect(200);
  assert.equal(body.order.items[0].name, "Studio Headphones");
  assert.equal(body.order.items[0].unitPriceCents, 12999);
  assert.equal(body.order.totalCents, 25998);
});

test("history keeps the delivery address and name used at purchase time", async () => {
  const order = await buy(ayse, [["p-101", 1]]);
  db.prepare("UPDATE users SET home_address = 'New Address 99', name = 'New Name' WHERE email = 'ayse@example.com'").run();
  const { body } = await ayse.get(`/api/orders/${order.id}`).expect(200);
  assert.equal(body.order.deliveryAddress, "Orta Mah. Universite Cad. 27, Tuzla, Istanbul");
  assert.equal(body.order.customerName, "Ayse Yilmaz");
});

test("orders written before checkout existed still show a total", async () => {
  const userId = db.prepare("SELECT id FROM users WHERE email = 'ayse@example.com'").get().id;
  const orderId = db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(userId).lastInsertRowid;
  db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    VALUES (?, 'p-102', 'Pocket Speaker', 8999, 2)
  `).run(orderId);
  const { body } = await ayse.get(`/api/orders/${orderId}`).expect(200);
  assert.equal(body.order.totalCents, 17998);
  assert.equal(body.order.payment, null);
  await ayse.get(`/api/orders/${orderId}/invoice`).expect(404);
});

// ---- Invoice -----------------------------------------------------------------------------

test("the owner gets invoice data whose total equals the payment", async () => {
  const order = await buy(ayse, [["p-101", 2], ["p-106", 1]]);
  const { body: { invoice } } = await ayse.get(`/api/orders/${order.id}/invoice`).expect(200);
  assert.equal(invoice.number, invoiceNumber(order.id));
  assert.deepEqual(invoice.customer, { name: "Ayse Yilmaz", email: "ayse@example.com" });
  assert.equal(invoice.deliveryAddress, order.deliveryAddress);
  assert.equal(invoice.items.length, 2);
  assert.equal(invoice.totalCents, 31497);
  assert.equal(invoice.payment.amountCents, invoice.totalCents);
  assert.equal(invoice.payment.cardLast4, "4242");
});

test("PDF download uses the paid order snapshot after catalog and profile edits", async () => {
  const order = await buy(ayse, [["p-101", 2], ["p-106", 1]]);
  const url = `/api/orders/${order.id}/invoice.pdf`;
  const before = await ayse.get(url).buffer(true).parse(readPdf).expect(200)
    .expect("Content-Type", /application\/pdf/)
    .expect("Cache-Control", "no-store");
  assert.equal(before.headers["content-disposition"].replaceAll('"', ""),
    `attachment; filename=${invoiceNumber(order.id)}.pdf`);
  assert.equal(before.body.subarray(0, 5).toString(), "%PDF-");

  db.exec(`
    UPDATE products SET name = 'Changed name', price_cents = 1 WHERE id = 'p-101';
    UPDATE users SET name = 'Changed customer', home_address = 'Changed address' WHERE email = 'ayse@example.com';
  `);
  const after = await ayse.get(url).buffer(true).parse(readPdf).expect(200);
  assert.deepEqual(after.body, before.body);
});

test("PDF download reuses invoice authorization and rejects unpaid or inconsistent orders", async () => {
  const order = await buy(ayse, [["p-101", 1]]);
  const url = `/api/orders/${order.id}/invoice.pdf`;
  const support = await signInAsStaff(app, db, ROLES.SUPPORT_AGENT);
  const sales = await signInAsStaff(app, db, ROLES.SALES_MANAGER);
  await request(app).get(url).expect(401);
  await mert.get(url).expect(404);
  await support.get(url).expect(403);
  await sales.get(url).buffer(true).parse(readPdf).expect(200);

  db.prepare("UPDATE payments SET status = 'pending' WHERE order_id = ?").run(order.id);
  await ayse.get(url).expect(404);
  db.prepare("UPDATE payments SET status = 'completed', amount_cents = 1 WHERE order_id = ?").run(order.id);
  await ayse.get(url).expect(409);
});

test("U20 a customer who does not own the order cannot read its invoice", async () => {
  const order = await buy(ayse, [["p-101", 1]]);
  const response = await mert.get(`/api/orders/${order.id}/invoice`).expect(404);
  assert.doesNotMatch(JSON.stringify(response.body), /ayse@example\.com/);
});

test("invoice numbers are stable and zero padded", () => {
  assert.equal(invoiceNumber(1), "INV-000001");
  assert.equal(invoiceNumber(123456), "INV-123456");
});

for (const role of [ROLES.PRODUCT_MANAGER, ROLES.SALES_MANAGER]) {
  test(`${role} can open any order and its invoice`, async () => {
    const order = await buy(ayse, [["p-101", 1]]);
    const staff = await signInAsStaff(app, db, role);
    const detail = await staff.get(`/api/orders/${order.id}`).expect(200);
    assert.equal(detail.body.order.deliveryAddress, order.deliveryAddress);
    await staff.get(`/api/orders/${order.id}/invoice`).expect(200);
  });
}

test("support agents cannot open orders yet", async () => {
  const order = await buy(ayse, [["p-101", 1]]);
  const support = await signInAsStaff(app, db, ROLES.SUPPORT_AGENT);
  await support.get(`/api/orders/${order.id}`).expect(403);
  await support.get(`/api/orders/${order.id}/invoice`).expect(403);
});

test("order and invoice responses are never cached", async () => {
  const order = await buy(ayse, [["p-101", 1]]);
  for (const url of ["/api/orders", `/api/orders/${order.id}`, `/api/orders/${order.id}/invoice`]) {
    const response = await ayse.get(url).expect(200);
    assert.equal(response.headers["cache-control"], "no-store", url);
  }
});
