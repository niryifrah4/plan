import { test, expect } from "@playwright/test";

/** Critical path 1/5 — login as advisor and land on /crm. */
test("advisor login → /crm", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("mail@example.com")).toBeVisible();
  await page.getByPlaceholder("mail@example.com").fill("niryifrah4@gmail.com");
  await page.locator('input[type="password"]').fill("PlanAdvisor2026!");
  await page.getByRole("button", { name: /התחבר|כניסה/ }).click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/crm/);
});

test("unauthenticated visit /dashboard → /login", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/login/);
});

test("homepage / responds 200 (no crash)", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(500);
});
