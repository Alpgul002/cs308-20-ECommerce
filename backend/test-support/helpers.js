// Lives outside test/ because node --test would run this file as a test of its own.
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { createDatabase } from "../src/db.js";

export const FAST_ROUNDS = 4; // Keeps the suite fast. Real rounds are asserted in auth.test.js.
export const STAFF_PASSWORD = "staff-password-1";

export function createTestApp(options = {}) {
  const db = createDatabase(":memory:");
  const app = createApp(db, { bcryptRounds: FAST_ROUNDS, loginLimit: 1000, registerLimit: 1000, ...options });
  return { db, app };
}

export function validCustomer(overrides = {}) {
  return {
    name: "Ayse Yilmaz",
    email: "ayse@example.com",
    password: "correct-horse-1",
    taxId: "1234567890",
    homeAddress: "Orta Mah. Universite Cad. 27, Tuzla, Istanbul",
    ...overrides
  };
}

export async function createStaff(db, role, email = `${role}@orbit.test`) {
  const hash = await hashPassword(STAFF_PASSWORD, FAST_ROUNDS);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('Staff Member', ?, ?, ?)"
  ).run(email, hash, role);
  return { id: Number(lastInsertRowid), email };
}

// Returns a supertest agent that keeps the session cookie between requests.
export async function signInAsStaff(app, db, role) {
  const { email } = await createStaff(db, role);
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: STAFF_PASSWORD }).expect(200);
  return agent;
}

export async function signUpCustomer(app, overrides = {}) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(validCustomer(overrides)).expect(201);
  return agent;
}

export function sessionCookie(response) {
  return (response.headers["set-cookie"] ?? []).find((value) => value.startsWith("orbit_session="));
}
