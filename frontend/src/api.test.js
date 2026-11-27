import { afterEach, expect, it, vi } from "vitest";
import { fetchJson, sendJson } from "./api.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("sends cookies and prevents cached inventory responses", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ products: [] })));
  vi.stubGlobal("fetch", fetch);
  expect(await fetchJson("/api/products")).toEqual({ products: [] });
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
});
it("keeps HTTP status so missing products have a distinct screen", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"Product not found"}', { status: 404 })));
  await expect(fetchJson("/api/products/p-999")).rejects.toMatchObject({ status: 404, message: "Product not found" });
});
it("handles HTML proxy errors without a JSON parsing crash", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<h1>Bad gateway</h1>", { status: 502 })));
  await expect(fetchJson("/api/products")).rejects.toMatchObject({ status: 502, message: expect.stringContaining("try again") });
});
it("explains network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await expect(fetchJson("/api/products")).rejects.toThrow("Cannot reach the store");
});
it("serializes JSON request data", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  await sendJson("/api/example", "POST", { value: 2 });
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"value":2}', headers: { "Content-Type": "application/json" } });
});
it("aborts an unresponsive request after ten seconds", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })));
  const result = expect(fetchJson("/api/products")).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10000);
  await result;
});
it("respects cancellation when the user changes filters", async () => {
  const parent = new AbortController();
  vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })));
  const result = expect(fetchJson("/api/products", { signal: parent.signal })).rejects.toMatchObject({ name: "AbortError" });
  parent.abort();
  await result;
});
