import { test, expect } from "@playwright/test";
import { createDatabase } from "../backend/src/db.js";

const cards = (page) => page.locator(".product-card");
const search = (page) => page.getByRole("searchbox");
async function home(page, query = "") {
  await page.goto(`/${query}`);
  await expect(cards(page)).toHaveCount(9);
}

test("homepage shows database products, counts and real featured detail", async ({ page, request }) => {
  const data = await (await request.get("/api/products")).json();
  await home(page);
  for (const product of data.products) await expect(page.locator(".product-name").filter({ hasText: product.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Audio 3", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View featured Studio Headphones" }).click();
  await expect(page.getByRole("heading", { name: "Studio Headphones", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/product=p-101/);
});

test("combined filters reach API, sorting is correct and URL survives reload", async ({ page }) => {
  await home(page);
  await page.getByRole("button", { name: "Audio 3", exact: true }).click();
  await search(page).fill("wireless");
  await page.getByLabel("Minimum price").fill("70");
  await page.getByLabel("Maximum price").fill("130");
  await page.getByLabel("In stock only").check();
  const response = page.waitForResponse((r) => r.url().includes("/api/products?") && r.url().includes("sort=price-asc") && r.status() === 200);
  await page.getByLabel("Sort products").selectOption("price-asc");
  const data = await (await response).json();
  expect(data.products.map((p) => p.id)).toEqual(["p-103", "p-101"]);
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first().locator(".product-name")).toHaveText("Wireless Earbuds");
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(search(page)).toHaveValue("wireless");
  await expect(page.getByLabel("In stock only")).toBeChecked();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(cards(page)).toHaveCount(9);
});

test("description search and all four sorting choices use the server", async ({ page, request }) => {
  await home(page);
  await search(page).fill("water resistance");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).locator(".product-name")).toHaveText("Pocket Speaker");
  await search(page).fill("");
  for (const sort of ["price-desc", "name", "price-asc", "popular"]) {
    const response = page.waitForResponse((r) => r.url().includes(`/api/products?`) && r.url().includes(`sort=${sort}`));
    await page.getByLabel("Sort products").selectOption(sort);
    await response;
    const { products } = await (await request.get(`/api/products?sort=${sort}`)).json();
    await expect(cards(page).locator(".product-name")).toHaveText(products.map((p) => p.name));
  }
});

test("empty result can be reset; sold-out product is visible but cannot be added", async ({ page }) => {
  await home(page);
  await search(page).fill("no-such-product-xyz");
  await expect(page.getByText("No matches this time")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(9);
  await page.getByRole("button", { name: "Photography 1", exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Mirrorless Camera is out of stock" })).toBeDisabled();
  await page.getByRole("button", { name: "View Mirrorless Camera details" }).click();
  await expect(page.getByRole("button", { name: "Out of stock", exact: true })).toBeDisabled();
});

test("detail reload and browser back preserve the selected category", async ({ page }) => {
  await home(page);
  await page.getByRole("button", { name: "Audio 3", exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole("button", { name: "View Studio Headphones details" }).click();
  await expect(page.getByText("AUD-100-2026")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Studio Headphones", exact: true })).toBeVisible();
  await page.goBack();
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Audio 3", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("detail refresh reads changed price and stock from the real database", async ({ page }) => {
  await page.goto("/?product=p-101");
  await expect(page.locator(".detail-price")).toHaveText("$129.99");
  const db = createDatabase(process.env.E2E_DB_FILE);
  try {
    db.prepare("UPDATE products SET price_cents = 1999, stock = 0 WHERE id = 'p-101'").run();
    await page.getByRole("button", { name: "Refresh product" }).click();
    await expect(page.locator(".detail-price")).toHaveText("$19.99");
    await expect(page.getByRole("button", { name: "Out of stock", exact: true })).toBeDisabled();
  } finally {
    db.prepare("UPDATE products SET price_cents = 12999, stock = 17 WHERE id = 'p-101'").run();
    db.close();
  }
});

test("missing product and invalid price range have useful recoverable errors", async ({ page }) => {
  await page.goto("/?product=p-999");
  await expect(page.getByRole("heading", { name: "Product not found" })).toBeVisible();
  await page.getByRole("button", { name: "Back to products" }).click();
  await expect(cards(page)).toHaveCount(9);
  await page.getByLabel("Minimum price").fill("200");
  await page.getByLabel("Maximum price").fill("100");
  await expect(page.getByRole("alert")).toContainText("Minimum price cannot exceed maximum price");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(cards(page)).toHaveCount(9);
});

test("catalog outage can be retried without reloading the page", async ({ page }) => {
  await page.route("**/api/products**", (route) => route.fulfill({ status: 503, contentType: "text/html", body: "Unavailable" }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connection unavailable" })).toBeVisible();
  await page.unroute("**/api/products**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(cards(page)).toHaveCount(9);
});

test("detail outage has its own retry, separate from missing product", async ({ page }) => {
  await page.route("**/api/products/p-101", (route) => route.fulfill({ status: 503, contentType: "text/html", body: "Unavailable" }));
  await page.goto("/?product=p-101");
  await expect(page.getByRole("heading", { name: "Product unavailable" })).toBeVisible();
  await page.unroute("**/api/products/p-101");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Studio Headphones", exact: true })).toBeVisible();
});

test("a late old search response cannot replace a newer search result", async ({ page }) => {
  await home(page);
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/products?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search") !== "wireless") return route.continue();
    const response = await route.fetch();
    await blocked;
    await route.fulfill({ response }).catch(() => {});
  });
  const started = page.waitForRequest((r) => r.url().includes("search=wireless"));
  await search(page).fill("wireless");
  await started;
  await search(page).fill("camera");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).locator(".product-name")).toHaveText("Mirrorless Camera");
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(cards(page).locator(".product-name")).toHaveText("Mirrorless Camera");
});

test("guest bag persists across filters, detail navigation and refresh", async ({ page }) => {
  await home(page);
  await page.getByRole("button", { name: "Add Studio Headphones to cart" }).click();
  await expect(page.getByRole("button", { name: "Open bag with 1 items" })).toBeVisible();
  await page.getByRole("button", { name: "Photography 1", exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Open bag with 1 items" }).click();
  await expect(page.getByRole("dialog")).toContainText("Studio Headphones");
  await page.getByRole("dialog").getByRole("button", { name: "View Studio Headphones details" }).click();
  await expect(page.getByRole("heading", { name: "Studio Headphones", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to products" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Open bag with 1 items" })).toBeVisible();
});

test("mobile catalog and detail fit within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page, "?scrum12=1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "View Studio Headphones details" }).click();
  await expect(page.getByRole("heading", { name: "Studio Headphones", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
