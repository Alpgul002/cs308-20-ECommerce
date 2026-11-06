import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db.js";
import { FAST_ROUNDS, sessionCookie, validCustomer } from "../test-support/helpers.js";

test("a signed-in customer profile survives a database restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cs308-profile-"));
  const filename = join(directory, "store.sqlite");
  let db;

  try {
    db = createDatabase(filename);
    const app = createApp(db, { bcryptRounds: FAST_ROUNDS, loginLimit: 100, registerLimit: 100 });
    const registration = await request(app)
      .post("/api/auth/register")
      .send(validCustomer())
      .expect(201);
    const cookie = sessionCookie(registration)?.split(";")[0];
    assert.ok(cookie, "registration should create a session cookie");

    // Re-open the same local SQLite file to verify that the user and hashed session persist.
    db.close();
    db = null;
    db = createDatabase(filename);
    const reopenedApp = createApp(db, { bcryptRounds: FAST_ROUNDS });

    const response = await request(reopenedApp)
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .expect(200);

    assert.deepEqual(response.body.user, registration.body.user);
    assert.equal(response.body.user.name, "Ayse Yilmaz");
    assert.equal(response.body.user.email, "ayse@example.com");
    assert.equal(response.body.user.homeAddress, "Orta Mah. Universite Cad. 27, Tuzla, Istanbul");
    assert.equal(Object.hasOwn(response.body.user, "taxId"), false);
    assert.equal(Object.hasOwn(response.body.user, "passwordHash"), false);
    assert.equal(Object.hasOwn(response.body.user, "password_hash"), false);
  } finally {
    if (db) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
