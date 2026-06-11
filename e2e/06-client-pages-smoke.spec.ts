import { test, expect } from "@playwright/test";

/**
 * Smoke test for every page in the (client) route group. Catches:
 *   - Hydration mismatches (console.error containing "hydrat")
 *   - 5xx server errors
 *   - Pages that throw on first render with empty/new state
 *
 * Skipped if advisor has no client to impersonate.
 */
const CLIENT_ROUTES = [
  "/dashboard",
  "/budget",
  "/balance",
  "/files",
  "/debt",
  "/pension",
  "/investments",
  "/goals",
  "/plan",
  "/realestate",
  "/onboarding",
  "/tools",
  "/roadmap",
  "/report",
];

test("every (client) page renders 200 + no hydration error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // Login.
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill("niryifrah4@gmail.com");
  await page.locator('input[type="password"]').fill("PlanAdvisor2026!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });

  // Enter first client.
  const enterClient = page
    .locator('a[href*="/dashboard"], a[href*="/budget"]')
    .first();
  const count = await enterClient.count();
  test.skip(count === 0, "Advisor has no clients yet — can't smoke client pages.");
  await enterClient.click();
  await page.waitForURL(/\/(dashboard|budget|balance)/, { timeout: 15_000 });

  // Visit each route, assert it loads.
  for (const route of CLIENT_ROUTES) {
    const before = errors.length;
    const res = await page.goto(route);
    expect(res?.status(), `${route} status`).toBeLessThan(500);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const newErrors = errors.slice(before);
    const hydration = newErrors.filter((e) => e.toLowerCase().includes("hydrat"));
    expect(hydration, `hydration errors on ${route}`).toEqual([]);
  }
});
