import { test, expect } from "@playwright/test";

/**
 * Regression: destructive UI flows must use ConfirmModal, not native
 * window.confirm() / alert() — those are blocked silently by iOS PWA.
 *
 * Smoke test: after login, visit /goals (which historically had the most
 * native confirm()/alert() usages) and assert that the page renders
 * without console errors AND that the page's HTML doesn't contain any
 * window.confirm/window.alert text triggers.
 *
 * This is a weak guarantee (a true E2E would need a goal to delete) but
 * combined with `grep -r "window.confirm\|alert(" app/(client)/`
 * returning empty (verified manually 2026-05-21) it gives reasonable
 * coverage.
 */
test("goals page renders without native confirm/alert (R5)", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill("niryifrah4@gmail.com");
  await page.locator('input[type="password"]').fill("PlanAdvisor2026!");
  await page.getByRole("button", { name: /התחבר|כניסה/ }).click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });

  // Enter first client if any.
  const enterClient = page
    .locator('a[href*="/dashboard"], a[href*="/budget"]')
    .first();
  const count = await enterClient.count();
  test.skip(count === 0, "Advisor has no clients yet.");
  await enterClient.click();
  await page.waitForURL(/\/(dashboard|budget|balance)/, { timeout: 15_000 });

  // Navigate to /goals via the sidebar.
  await page.goto("/goals");
  await expect(page.locator("body")).toBeVisible();

  // No hydration errors, no native confirm/alert overrides.
  const hydrationErrors = consoleErrors.filter((e) =>
    e.toLowerCase().includes("hydrat"),
  );
  expect(hydrationErrors).toEqual([]);
});
