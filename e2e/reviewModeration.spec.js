import { expect, test } from "@playwright/test";
import { hashPassword, ROLES } from "../backend/src/auth.js";
import { createDatabase } from "../backend/src/db.js";

test("a buyer sees the pending status and visitors see the review only after approval", async ({ page, request }) => {
  const comment = "Clear sound after a week of use.";
  const registration = await page.request.post("/api/auth/register", { data: {
    name: "Review Customer", email: "moderation-buyer@example.test", password: "moderation-demo-1",
    taxId: "1234567890", homeAddress: "Synthetic delivery address 123"
  } });
  expect(registration.status()).toBe(201);
  const { user } = await registration.json();

  const db = createDatabase(process.env.E2E_DB_FILE);
  const staff = { email: "moderation-manager@example.test", password: "manager-moderation-demo-1" };
  try {
    const { lastInsertRowid: orderId } = db.prepare(`
      INSERT INTO orders (user_id, status) VALUES (?, 'delivered')
    `).run(user.id);
    db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
      VALUES (?, 'p-101', 'Studio Headphones', 12999, 1)
    `).run(orderId);
    db.prepare(`
      INSERT INTO payments (order_id, amount_cents, status) VALUES (?, 12999, 'completed')
    `).run(orderId);
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Review Manager', ?, ?, ?)")
      .run(staff.email, await hashPassword(staff.password, 4), ROLES.PRODUCT_MANAGER);
  } finally {
    db.close();
  }

  await page.goto("/?product=p-101");
  await page.getByLabel("Write a review").fill(comment);
  await page.getByRole("button", { name: "Submit review" }).click();
  await expect(page.getByText("Your review is awaiting approval.")).toBeVisible();
  await expect(page.getByText(comment)).toHaveCount(0);
  expect((await page.request.post("/api/auth/logout")).ok()).toBe(true);
  await page.reload();
  await expect(page.getByText("No published reviews yet.")).toBeVisible();

  expect((await request.post("/api/auth/login", { data: staff })).ok()).toBe(true);
  const queue = await request.get("/api/admin/reviews?status=pending");
  expect(queue.ok()).toBe(true);
  const review = (await queue.json()).reviews.find((row) => row.authorId === user.id);
  expect(review.body).toBe(comment);
  expect((await request.patch(`/api/admin/reviews/${review.id}`, { data: { status: "approved" } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByText(comment)).toBeVisible();
});
