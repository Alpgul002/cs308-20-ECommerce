import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp, parseOrigins } from "../src/app.js";
import {
  ROLES, SESSION_TTL_MS, authenticate, createSession, getSessionUser, hashPassword, hashToken,
  purgeExpiredSessions, validateLogin
} from "../src/auth.js";
import { createDatabase } from "../src/db.js";
import { requireRole } from "../src/middleware.js";
import { seedDemoUsers } from "../src/seed.js";
import {
  FAST_ROUNDS, STAFF_PASSWORD, createStaff, createTestApp, sessionCookie, signUpCustomer, validCustomer
} from "../test-support/helpers.js";

let db, app;
beforeEach(() => ({ db, app } = createTestApp()));
afterEach(() => db.close());

const countUsers = () => db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
const cookiePair = (response) => sessionCookie(response).split(";")[0];

// ---- Registration -----------------------------------------------------------------------

test("register creates a customer and signs them in", async () => {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/register").send(validCustomer()).expect(201);
  assert.equal(response.body.user.email, "ayse@example.com");
  assert.equal(response.body.user.role, ROLES.CUSTOMER);
  const me = await agent.get("/api/auth/me").expect(200);
  assert.equal(me.body.user.id, response.body.user.id);
});

test("register stores a bcrypt hash, never the password", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const { password_hash: hash } = db.prepare("SELECT password_hash FROM users").get();
  assert.match(hash, /^\$2[aby]\$/);
  assert.ok(!hash.includes("correct-horse-1"));
});

test("two users with the same password get different hashes", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  await request(app).post("/api/auth/register").send(validCustomer({ email: "b@example.com" })).expect(201);
  const [first, second] = db.prepare("SELECT password_hash FROM users").all();
  assert.notEqual(first.password_hash, second.password_hash);
});

test("real password hashes use at least 12 bcrypt rounds", async () => {
  assert.match(await hashPassword("correct-horse-1"), /^\$2[aby]\$12\$/);
});

test("register never returns password or tax data", async () => {
  const response = await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  assert.deepEqual(Object.keys(response.body.user).sort(), ["email", "homeAddress", "id", "name", "role"]);
});

test("register ignores a role sent by the client", async () => {
  const response = await request(app).post("/api/auth/register")
    .send(validCustomer({ role: ROLES.PRODUCT_MANAGER })).expect(201);
  assert.equal(response.body.user.role, ROLES.CUSTOMER);
  assert.equal(db.prepare("SELECT role FROM users").get().role, ROLES.CUSTOMER);
});

test("register rejects a duplicate email, whatever its case", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const response = await request(app).post("/api/auth/register")
    .send(validCustomer({ email: "AYSE@Example.COM" })).expect(409);
  assert.ok(response.body.fields.email);
  assert.equal(countUsers(), 1);
});

test("concurrent sign-ups with one email create exactly one account", async () => {
  const responses = await Promise.all(Array.from({ length: 5 }, () =>
    request(app).post("/api/auth/register").send(validCustomer())));
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409, 409, 409, 409]);
  assert.equal(countUsers(), 1);
});

test("register reports every invalid field at once", async () => {
  const response = await request(app).post("/api/auth/register").send({}).expect(400);
  assert.deepEqual(Object.keys(response.body.fields).sort(), ["email", "homeAddress", "name", "password", "taxId"]);
});

for (const [field, value] of [
  ["email", "not-an-email"], ["email", `${"a".repeat(250)}@b.co`], ["name", " "], ["name", "x".repeat(101)],
  ["taxId", "12345"], ["taxId", "12345abcde"], ["homeAddress", "abc"], ["password", "short"],
  ["password", 12345678], ["password", "ş".repeat(40)]
]) {
  test(`register rejects ${field}=${JSON.stringify(value).slice(0, 24)}`, async () => {
    const response = await request(app).post("/api/auth/register")
      .send(validCustomer({ [field]: value })).expect(400);
    assert.ok(response.body.fields[field]);
    assert.equal(countUsers(), 0);
  });
}

// ---- Login -------------------------------------------------------------------------------

test("login succeeds and returns the user", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const response = await request(app).post("/api/auth/login")
    .send({ email: "ayse@example.com", password: "correct-horse-1" }).expect(200);
  assert.equal(response.body.user.name, "Ayse Yilmaz");
  assert.ok(sessionCookie(response));
});

test("login accepts any email case and surrounding spaces", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  await request(app).post("/api/auth/login")
    .send({ email: "  AYSE@Example.com ", password: "correct-horse-1" }).expect(200);
});

test("wrong password and unknown email give the identical response", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const wrong = await request(app).post("/api/auth/login")
    .send({ email: "ayse@example.com", password: "wrong-password" }).expect(401);
  const unknown = await request(app).post("/api/auth/login")
    .send({ email: "nobody@example.com", password: "wrong-password" }).expect(401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal(sessionCookie(wrong), undefined);
});

test("password comparison is case sensitive", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  await request(app).post("/api/auth/login")
    .send({ email: "ayse@example.com", password: "CORRECT-HORSE-1" }).expect(401);
});

test("characters beyond the bcrypt limit cannot be used to sign in", async () => {
  const password = "a".repeat(72);
  await request(app).post("/api/auth/register").send(validCustomer({ password })).expect(201);
  await request(app).post("/api/auth/login").send({ email: "ayse@example.com", password }).expect(200);
  await request(app).post("/api/auth/login").send({ email: "ayse@example.com", password: `${password}x` }).expect(401);
});

test("login validation uses the same messages as the login page", async () => {
  const empty = await request(app).post("/api/auth/login").send({}).expect(400);
  assert.equal(empty.body.fields.email, "Email is required.");
  assert.equal(empty.body.fields.password, "Password is required.");
  const bad = await request(app).post("/api/auth/login").send({ email: "nope", password: "x" }).expect(400);
  assert.equal(bad.body.fields.email, "Enter a valid email address.");
});

test("login without a JSON body is a 400, not a crash", async () => {
  await request(app).post("/api/auth/login").expect(400);
  await request(app).post("/api/auth/login").set("Content-Type", "text/plain").send("hello").expect(400);
});

for (const password of [{ $ne: "" }, ["a"], 12345678, null, true]) {
  test(`login rejects non-string password ${JSON.stringify(password)}`, async () => {
    await request(app).post("/api/auth/login").send({ email: "ayse@example.com", password }).expect(400);
  });
}

test("SQL injection in credentials does not sign in or change data", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  await request(app).post("/api/auth/login")
    .send({ email: "ayse'--@example.com", password: "' OR '1'='1" }).expect(401);
  await request(app).post("/api/auth/login")
    .send({ email: "a@example.com'; DROP TABLE users;--", password: "x" }).expect(400);
  assert.equal(countUsers(), 1);
});

test("authenticate returns no password hash", async () => {
  const { email } = await createStaff(db, ROLES.SUPPORT_AGENT);
  const user = await authenticate(db, { email, password: STAFF_PASSWORD }, { rounds: FAST_ROUNDS });
  assert.deepEqual(Object.keys(user).sort(), ["email", "homeAddress", "id", "name", "role"]);
});

test("validateLogin normalizes the email", () => {
  assert.equal(validateLogin({ email: " A@B.CO ", password: "x" }).email, "a@b.co");
});

// ---- Session cookie ----------------------------------------------------------------------

test("session cookie is HttpOnly and SameSite=Lax", async () => {
  const response = await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const cookie = sessionCookie(response);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /Expires=/i);
  assert.doesNotMatch(cookie, /Secure/i);
});

test("session cookie is Secure when configured for production", async () => {
  const secure = createTestApp({ cookieSecure: true });
  const response = await request(secure.app).post("/api/auth/register").send(validCustomer()).expect(201);
  assert.match(sessionCookie(response), /Secure/i);
  secure.db.close();
});

test("only a hash of the session token reaches the database", async () => {
  const response = await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const token = cookiePair(response).split("=")[1];
  const { token_hash: stored } = db.prepare("SELECT token_hash FROM sessions").get();
  assert.notEqual(stored, token);
  assert.equal(stored, hashToken(token));
});

test("session tokens are long and unique per sign-in", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const credentials = { email: "ayse@example.com", password: "correct-horse-1" };
  const first = await request(app).post("/api/auth/login").send(credentials).expect(200);
  const second = await request(app).post("/api/auth/login").send(credentials).expect(200);
  assert.notEqual(cookiePair(first), cookiePair(second));
  assert.ok(cookiePair(first).split("=")[1].length >= 43);
});

test("signing in again revokes the previous session", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const credentials = { email: "ayse@example.com", password: "correct-horse-1" };
  const first = await request(app).post("/api/auth/login").send(credentials).expect(200);
  await request(app).post("/api/auth/login").set("Cookie", cookiePair(first)).send(credentials).expect(200);
  await request(app).get("/api/auth/me").set("Cookie", cookiePair(first)).expect(401);
});

test("auth responses must not be cached", async () => {
  const response = await request(app).post("/api/auth/login").send({}).expect(400);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("/me without a session is 401", async () => {
  await request(app).get("/api/auth/me").expect(401);
});

test("/me with a forged cookie is 401", async () => {
  await request(app).get("/api/auth/me").set("Cookie", "orbit_session=forged-token").expect(401);
});

test("an expired session is rejected and purged", async () => {
  const { id } = await createStaff(db, ROLES.SUPPORT_AGENT);
  const expired = createSession(db, id, Date.now() - SESSION_TTL_MS - 1000);
  const active = createSession(db, id);
  await request(app).get("/api/auth/me").set("Cookie", `orbit_session=${expired.token}`).expect(401);
  await request(app).get("/api/auth/me").set("Cookie", `orbit_session=${active.token}`).expect(200);
  assert.equal(purgeExpiredSessions(db), 1);
  assert.ok(getSessionUser(db, active.token));
});

test("a session stops working as soon as its user is deleted", async () => {
  const agent = await signUpCustomer(app);
  await agent.get("/api/auth/me").expect(200);
  db.prepare("DELETE FROM users").run();
  await agent.get("/api/auth/me").expect(401);
});

test("a role change applies to the running session immediately", async () => {
  const { email } = await createStaff(db, ROLES.PRODUCT_MANAGER);
  const agent = request.agent(app);
  const login = await agent.post("/api/auth/login").send({ email, password: STAFF_PASSWORD }).expect(200);
  assert.equal(login.body.user.role, ROLES.PRODUCT_MANAGER);
  db.prepare("UPDATE users SET role = 'support_agent'").run();
  const me = await agent.get("/api/auth/me").expect(200);
  assert.equal(me.body.user.role, ROLES.SUPPORT_AGENT);
});

// ---- Logout ------------------------------------------------------------------------------

test("logout ends the session on the server, not just in the browser", async () => {
  const response = await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const cookie = cookiePair(response);
  await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
  const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(200);
  assert.deepEqual(logout.body, { ok: true });
  assert.match(sessionCookie(logout), /Expires=Thu, 01 Jan 1970/);
  await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
});

test("logout without a session succeeds", async () => {
  await request(app).post("/api/auth/logout").expect(200);
});

test("logout only ends the current device's session", async () => {
  await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const credentials = { email: "ayse@example.com", password: "correct-horse-1" };
  const phone = await request(app).post("/api/auth/login").send(credentials).expect(200);
  const laptop = await request(app).post("/api/auth/login").send(credentials).expect(200);
  await request(app).post("/api/auth/logout").set("Cookie", cookiePair(phone)).expect(200);
  await request(app).get("/api/auth/me").set("Cookie", cookiePair(laptop)).expect(200);
});

// ---- Rate limiting -----------------------------------------------------------------------

test("repeated failed logins are rate limited", async () => {
  const limited = createTestApp({ loginLimit: 3 });
  const attempt = () => request(limited.app).post("/api/auth/login")
    .send({ email: "victim@example.com", password: "wrong-password" });
  for (let i = 0; i < 3; i += 1) await attempt().expect(401);
  const blocked = await attempt().expect(429);
  assert.ok(blocked.body.error);
  limited.db.close();
});

test("the login limit does not lock out a different email", async () => {
  const limited = createTestApp({ loginLimit: 1 });
  const attempt = (email) => request(limited.app).post("/api/auth/login").send({ email, password: "wrong-password" });
  await attempt("victim@example.com").expect(401);
  await attempt("victim@example.com").expect(429);
  await attempt("other@example.com").expect(401);
  limited.db.close();
});

test("successful logins do not use up the limit", async () => {
  const limited = createTestApp({ loginLimit: 2 });
  await request(limited.app).post("/api/auth/register").send(validCustomer()).expect(201);
  for (let i = 0; i < 4; i += 1) {
    await request(limited.app).post("/api/auth/login")
      .send({ email: "ayse@example.com", password: "correct-horse-1" }).expect(200);
  }
  limited.db.close();
});

test("sign-ups are rate limited", async () => {
  const limited = createTestApp({ registerLimit: 1 });
  await request(limited.app).post("/api/auth/register").send(validCustomer()).expect(201);
  await request(limited.app).post("/api/auth/register")
    .send(validCustomer({ email: "b@example.com" })).expect(429);
  limited.db.close();
});

// ---- Origins -----------------------------------------------------------------------------

test("BUG-07 an allowed origin may send credentials through CORS", async () => {
  const response = await request(app).options("/api/auth/login")
    .set("Origin", "http://localhost:5173").set("Access-Control-Request-Method", "POST");
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
  assert.equal(response.headers["access-control-allow-credentials"], "true");
});

test("an unknown origin gets no CORS approval", async () => {
  const response = await request(app).options("/api/auth/login")
    .set("Origin", "https://evil.example").set("Access-Control-Request-Method", "POST");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("a state-changing request from a foreign origin cannot use the session", async () => {
  const signup = await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  const cookie = cookiePair(signup);
  await request(app).post("/api/auth/logout")
    .set("Cookie", cookie).set("Origin", "https://evil.example").expect(403);
  await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
});

test("the same request from our own origin is allowed", async () => {
  const signup = await request(app).post("/api/auth/register").send(validCustomer()).expect(201);
  await request(app).post("/api/auth/logout")
    .set("Cookie", cookiePair(signup)).set("Origin", "http://localhost:5173").expect(200);
});

test("guests can still validate a cart from a LAN address", async () => {
  await request(app).post("/api/cart/validate")
    .set("Origin", "http://192.168.1.5:5173")
    .send({ items: [{ productId: "p-101", quantity: 1 }] }).expect(200);
});

test("CORS_ORIGIN accepts a comma separated list", () => {
  assert.deepEqual(parseOrigins("http://a.test, http://b.test"), ["http://a.test", "http://b.test"]);
  assert.ok(parseOrigins(undefined).includes("http://localhost:5173"));
});

// ---- Roles and demo accounts -------------------------------------------------------------

test("requireRole refuses a misspelled role at startup", () => {
  assert.throws(() => requireRole("product-manager"), /Unknown role/);
});

test("createApp works with its production defaults", async () => {
  const memory = createDatabase(":memory:");
  await request(createApp(memory)).get("/api/health").expect(200);
  memory.close();
});

test("demo users cover every role and can sign in", async () => {
  assert.equal(await seedDemoUsers(db, STAFF_PASSWORD, { rounds: FAST_ROUNDS }), 4);
  const roles = db.prepare("SELECT role FROM users").all().map((row) => row.role).sort();
  assert.deepEqual(roles, Object.values(ROLES).sort());
  await request(app).post("/api/auth/login")
    .send({ email: "product@orbit.test", password: STAFF_PASSWORD }).expect(200);
});

test("seeding demo users twice creates nothing new and keeps passwords", async () => {
  await seedDemoUsers(db, STAFF_PASSWORD, { rounds: FAST_ROUNDS });
  assert.equal(await seedDemoUsers(db, "another-password", { rounds: FAST_ROUNDS }), 0);
  await request(app).post("/api/auth/login")
    .send({ email: "sales@orbit.test", password: STAFF_PASSWORD }).expect(200);
});

test("demo users are refused in production and with weak passwords", async () => {
  await assert.rejects(seedDemoUsers(db, "short"), /at least 8/);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(seedDemoUsers(db, STAFF_PASSWORD), /production/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
