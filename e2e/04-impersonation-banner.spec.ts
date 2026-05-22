import { test, expect } from "@playwright/test";

/**
 * R9 regression: when advisor opens a client tab via /crm, the
 * impersonation banner must appear AND the URL must be a (client) route.
 * The banner only renders when `impersonation !== null` in ClientShell,
 * which is also what gates the `current_hh` clear + refresh-event chain.
 *
 * Read-only smoke test — does not modify any client data.
 */
test("impersonation opens client view with banner (R9)", async ({ page }) => {
  // Login.
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill("niryifrah4@gmail.com");
  await page.locator('input[type="password"]').fill("PlanAdvisor2026!");
  await page.getByRole("button", { name: /התחבר|כניסה/ }).click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });

  // Find the first client card / row and open it. CRM uses Link wrappers
  // on each client; the link text usually contains the family name.
  // We match any link whose href starts with /dashboard or /budget — the
  // "enter client" destination.
  const enterClient = page
    .locator('a[href*="/dashboard"], a[href*="/budget"]')
    .first();
  // Skip the test gracefully if the advisor has no clients yet — the
  // production account may be empty during early beta.
  const count = await enterClient.count();
  test.skip(count === 0, "Advisor has no clients yet — nothing to impersonate.");

  await enterClient.click();
  await page.waitForURL(/\/(dashboard|budget|balance)/, { timeout: 15_000 });

  // Banner check — "אתה צופה כלקוח:" only renders when impersonation cookie
  // is active. If R9 regressed (current_hh stale), banner may render but
  // sidebar would show advisor's own name — banner presence itself is the
  // minimum guarantee.
  await expect(page.getByText(/אתה צופה כלקוח/)).toBeVisible({ timeout: 10_000 });
});
