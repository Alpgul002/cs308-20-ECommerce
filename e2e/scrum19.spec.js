import { test, expect } from "@playwright/test";
import { createDatabase } from "../backend/src/db.js";
import { STORAGE_KEY } from "../frontend/src/cart.js";

test("SCRUM-19 filtered detail writes the persistent cart and returns to the same filters", async ({ page }) => {
  await page.goto("/?category=audio&minPrice=100&maxPrice=130&sort=price-asc");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page.getByRole("button", { name: "View Studio Headphones details" }).click();
  await expect(page.getByRole("heading", { name: "Reviews", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get("/api/cart")).json()).items)
    .toEqual([{ productId: "p-101", quantity: 1 }]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Studio Headphones", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to products" }).click();
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.getByLabel("Minimum price")).toHaveValue("100");
  await expect(page.getByRole("button", { name: "Open bag with 1 items" })).toBeVisible();
});

test("SCRUM-19 login from feedback preserves detail URL and displays cart merge adjustments", async ({ page }) => {
  const email = `scrum19-${Date.now()}@example.test`;
  const password = "integration-password-1";
  const registered = await page.request.post("/api/auth/register", { data: {
    name: "Integration Customer", email, password, taxId: "1234567890",
    homeAddress: "Synthetic delivery address 123"
  } });
  expect(registered.status()).toBe(201);
  expect((await page.request.put("/api/cart/items/p-101", { data: { quantity: 2 } })).status()).toBe(200);
  await page.request.post("/api/auth/logout");
  expect((await page.request.put("/api/cart/items/p-101", { data: { quantity: 3 } })).status()).toBe(200);
  const db = createDatabase(process.env.E2E_DB_FILE);
  const originalStock = db.prepare("SELECT stock FROM products WHERE id = 'p-101'").get().stock;
  try {
    db.prepare("UPDATE products SET stock = 4 WHERE id = 'p-101'").run();
    await page.goto("/?category=audio&product=p-101");
    await page.getByRole("button", { name: "Like this product" }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Studio Headphones", exact: true })).toBeVisible();
    await expect(page.getByText("Reduced from 5 to 4", { exact: false })).toBeVisible();
    await expect(page.getByText("Stock changed", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/category=audio.*product=p-101/);
    await page.getByRole("button", { name: "Back to products" }).click();
    await expect(page.locator(".product-card")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Open bag with 4 items" })).toBeVisible();
  } finally { db.prepare("UPDATE products SET stock = ? WHERE id = 'p-101'").run(originalStock); db.close(); }
});

test("SCRUM-19 imports a legacy browser bag once and keeps it in the server cart", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(9);
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify([{ productId: "p-103", quantity: 2 }])), STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole("button", { name: "Open bag with 2 items" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect((await (await page.request.get("/api/cart")).json()).items).toEqual([{ productId: "p-103", quantity: 2 }]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Open bag with 2 items" })).toBeVisible();
});

test("SCRUM-19 catalog retry preserves the current signed-in account and bag", async ({ page }) => {
  const email = `scrum19-retry-${Date.now()}@example.test`;
  const password = "integration-password-1";
  expect((await page.request.post("/api/auth/register", { data: {
    name: "Retry Customer", email, password, taxId: "1234567890",
    homeAddress: "Synthetic delivery address 123"
  } })).status()).toBe(201);
  await page.request.post("/api/auth/logout");
  await page.goto("/");
  await page.getByRole("button", { name: "Add Studio Headphones to cart" }).click();
  await expect(page.getByRole("button", { name: "Open bag with 1 items" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "My profile" })).toBeVisible();
  await page.route("**/api/products?**", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: '{"error":"Temporary catalog outage"}'
  }));
  await page.getByRole("searchbox").fill("wireless");
  await expect(page.getByRole("heading", { name: "Connection unavailable" })).toBeVisible();
  await page.unroute("**/api/products?**");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "My profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open bag with 1 items" })).toBeVisible();
  expect((await (await page.request.get("/api/cart")).json()).items).toEqual([{ productId: "p-101", quantity: 1 }]);
});
