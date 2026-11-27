import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { SMTPServer } from "smtp-server";
import { ROLES } from "../src/auth.js";
import { createMockBank, TEST_CARDS } from "../src/bank.js";
import { createSmtpInvoiceSender, sendNextInvoiceEmail } from "../src/invoiceEmail.js";
import { createTestApp, signInAsStaff, signUpCustomer } from "../test-support/helpers.js";

function checkout(agent, cardNumber = TEST_CARDS.approved, key = "email-test-order") {
  return agent.post("/api/checkout").set("Idempotency-Key", key).send({
    payment: { cardNumber, cardHolder: "Test Customer", expiryMonth: 12, expiryYear: 2099, cvc: "123" }
  });
}

test("paid checkout queues the invoice and delivers the same PDF bytes over SMTP", { timeout: 10_000 }, async (t) => {
  const { db, app } = createTestApp();
  t.after(() => db.close());
  const buyer = await signUpCustomer(app);
  const messages = [];
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, done) {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", done);
      stream.on("end", () => {
        messages.push({
          recipients: session.envelope.rcptTo.map(({ address }) => address),
          body: Buffer.concat(chunks).toString()
        });
        done(null, "Message accepted");
      });
    }
  });
  await new Promise((resolve, reject) => {
    smtp.once("error", reject);
    smtp.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => smtp.close(resolve)));
  const send = createSmtpInvoiceSender({
    SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.server.address().port),
    SMTP_REQUIRE_TLS: "false", SMTP_FROM: "billing@orbit.test"
  });

  await buyer.put("/api/cart/items/p-101").send({ quantity: 2 }).expect(200);
  const { body: { order } } = await checkout(buyer).expect(201);
  const path = `/api/orders/${order.id}/invoice/email`;
  await buyer.get(path).expect(200, { delivery: { status: "pending", attempts: 0, sentAt: null } });
  await checkout(buyer).expect(200);
  await buyer.post(path + "/retry").expect(409);
  assert.equal(await sendNextInvoiceEmail(db, send), true);
  assert.equal(await sendNextInvoiceEmail(db, send), false);

  const { body: { delivery } } = await buyer.get(path).expect(200);
  assert.equal(delivery.status, "sent");
  assert.equal(delivery.attempts, 1);
  assert.ok(Date.parse(delivery.sentAt));
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].recipients, ["ayse@example.com"]);
  const attachment = messages[0].body.match(
    /Content-Disposition: attachment; filename=INV-000001\.pdf\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n--/i
  );
  assert.ok(attachment, "Expected a PDF attachment in the received MIME message");
  const download = await buyer.get(`/api/orders/${order.id}/invoice.pdf`).buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", callback);
      response.on("end", () => callback(null, Buffer.concat(chunks)));
    }).expect(200);
  assert.deepEqual(Buffer.from(attachment[1], "base64"), download.body);
  await buyer.post(path + "/retry").expect(409);
});

test("a failed email can be retried by authorized users without another payment", async (t) => {
  const mockBank = createMockBank();
  let charges = 0;
  const { db, app } = createTestApp({ bank: { charge(input) { charges += 1; return mockBank.charge(input); } } });
  t.after(() => db.close());
  const buyer = await signUpCustomer(app);
  const other = await signUpCustomer(app, { email: "other@example.com" });
  const staff = await signInAsStaff(app, db, ROLES.SALES_MANAGER);
  await buyer.put("/api/cart/items/p-101").send({ quantity: 2 }).expect(200);
  await checkout(buyer, TEST_CARDS.declined, "declined-email-order").expect(402);
  assert.equal(db.prepare("SELECT count(*) AS n FROM invoice_email_jobs").get().n, 0);
  const { body: { order } } = await checkout(buyer).expect(201);
  const path = `/api/orders/${order.id}/invoice/email`;
  const retry = path + "/retry";
  await sendNextInvoiceEmail(db, async () => { throw new Error("SMTP rejected mail"); });
  await buyer.get(path).expect(200, { delivery: { status: "failed", attempts: 1, sentAt: null } });
  await request(app).get(path).expect(401);
  await other.get(path).expect(404);
  await other.post(retry).expect(404);
  await staff.post(retry).expect(202, { delivery: { status: "pending", attempts: 1, sentAt: null } });
  await buyer.post(retry).expect(409);
  db.prepare("UPDATE users SET email = 'changed@example.com' WHERE email = 'ayse@example.com'").run();

  let markSending;
  const sending = new Promise((resolve) => { markSending = resolve; });
  let deliver;
  const accepted = new Promise((resolve) => { deliver = resolve; });
  const run = sendNextInvoiceEmail(db, async (mail) => {
    markSending(mail.recipient);
    await accepted;
  });
  try {
    const recipient = await Promise.race([
      sending,
      run.then(() => assert.fail("The retry did not reach the mail sender"))
    ]);
    assert.equal(recipient, "ayse@example.com");
    await buyer.get(path).expect(200, { delivery: { status: "sending", attempts: 2, sentAt: null } });
    assert.equal(await sendNextInvoiceEmail(db, () => assert.fail("A concurrent worker must not claim this job")), false);
  } finally {
    deliver();
    await run;
  }
  assert.equal((await buyer.get(path).expect(200)).body.delivery.status, "sent");
  assert.equal(db.prepare("SELECT count(*) AS n FROM orders").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM payments").get().n, 1);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id = 'p-101'").get().stock, 15);
  assert.equal(charges, 2);
});
