// One regression test per defect in docs/BUG_REPORTS.md. The IDs match that file.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";

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

