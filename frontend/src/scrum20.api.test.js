import { afterEach, expect, it, vi } from "vitest";
import { fetchJson } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

function failWith(status, body) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
  return fetchJson("/api/checkout", { method: "POST" }).catch((error) => error);
}

it("SCRUM-20 preserves per-product stock conflicts for the checkout consumer", async () => {
  const body = {
    error: "Stock changed", code: "stock_changed",
    items: [{ productId: "p-101", name: "Headphones", requested: 2, available: 1 }]
  };
  const error = await failWith(409, body);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ status: 409, message: body.error, code: body.code, items: body.items, details: body });
});

it("SCRUM-20 preserves a changed total including zero without treating it as absent", async () => {
  const body = { error: "Price changed", code: "price_changed", totalCents: 0 };
  expect(await failWith(409, body)).toMatchObject({ status: 409, code: "price_changed", totalCents: 0, details: body });
});

it("SCRUM-20 distinguishes the original bank decline from a replayed decline", async () => {
  for (const replayed of [false, true]) {
    const body = { error: "Card declined", code: "payment_declined", replayed };
    expect(await failWith(402, body)).toMatchObject({ status: 402, code: "payment_declined", replayed, details: body });
  }
});

it("SCRUM-20 retains field errors so callers can identify the invalid input", async () => {
  const body = { error: "Check your details", fields: { deliveryAddress: "Enter an address", cvc: "Enter 3-4 digits" } };
  expect(await failWith(400, body)).toMatchObject({ status: 400, fields: body.fields, details: body });
});

it("SCRUM-20 cannot overwrite error identity or HTTP status using arbitrary response fields", async () => {
  const body = { error: "Forbidden", status: 200, message: "Success", name: "NotAnError", stack: "fake", custom: "value" };
  const error = await failWith(403, body);
  expect(error).toMatchObject({ status: 403, message: "Forbidden", name: "Error", details: body });
  expect(error.stack).not.toBe("fake");
  expect(Object.hasOwn(error, "custom")).toBe(false);
});

it("SCRUM-20 preserves legacy message-only failures without inventing a machine error code", async () => {
  const body = { error: "Please sign in." };
  const error = await failWith(401, body);
  expect(error).toMatchObject({ status: 401, message: body.error, details: body });
  for (const key of ["code", "items", "fields", "totalCents", "replayed"]) {
    expect(Object.hasOwn(error, key)).toBe(false);
  }
});
