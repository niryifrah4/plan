import { test, expect } from "@playwright/test";

/** Critical path 2/5 — public pages render without 5xx. */
const PUBLIC_PATHS = ["/login", "/privacy", "/terms"];

for (const path of PUBLIC_PATHS) {
  test(`public ${path} renders OK`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should be < 500`).toBeLessThan(500);
    // Sanity: page has content
    const body = await page.textContent("body");
    expect((body || "").length).toBeGreaterThan(50);
  });
}

test("API health responds 200", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
});
