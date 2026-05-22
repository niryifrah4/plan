import { test, expect } from "@playwright/test";

/**
 * R6 regression: the CRM logout button must call `supabase.auth.signOut()`
 * — not just navigate. Previously the session stayed alive and a quick
 * Back button re-entered /crm without re-auth.
 *
 * This test logs in, clicks logout, then visits /crm again expecting a
 * redirect to /login. If the session were still live, /crm would render.
 */
test("logout actually clears session (R6)", async ({ page }) => {
  // 1) Login as advisor.
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill("niryifrah4@gmail.com");
  await page.locator('input[type="password"]').fill("PlanAdvisor2026!");
  await page.getByRole("button", { name: /התחבר|כניסה/ }).click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });

  // 2) Click the logout button (title="התנתקות") and wait for /login.
  await page.locator('button[title="התנתקות"]').click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });

  // 3) Try to re-enter /crm — middleware should redirect back to /login
  //    because the session cookie was cleared by signOut().
  await page.goto("/crm");
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/login/);
});
