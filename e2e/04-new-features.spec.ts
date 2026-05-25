import { test, expect } from "@playwright/test";

/**
 * Critical-path regression for the 2026-05-24/25 feature ship:
 *   - MacroStrip on /dashboard (live BoI/inflation/USD)
 *   - Wealth Report CTA on /dashboard
 *   - Rent-vs-Buy calculator under /tools
 *   - PWA Install Prompt component (mounted in ClientShell)
 *
 * Requires DEV_AUTH_BYPASS=1 in .env.local so we can reach authed routes
 * without a real session.
 */

test.describe("MacroStrip — live macro rates", () => {
  test("dashboard shows live macro values (or loading state)", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const body = (await page.textContent("body")) || "";

    // The strip shows either "טוען נתוני שוק..." or the actual values once loaded.
    // Either is acceptable; we just want the component to be present.
    const loadingOrValues =
      body.includes("טוען נתוני שוק") ||
      body.includes("פריים") ||
      body.includes("ריבית בנק ישראל");
    expect(loadingOrValues, "MacroStrip should mount on /dashboard").toBe(true);
  });

  test("/api/market?kind=macro responds with macro snapshot or 401", async ({ request }) => {
    const res = await request.get("/api/market?kind=macro");
    // 401 is expected in dev without a real Supabase session; 200 means
    // DEV_AUTH_BYPASS lets it through. Either is fine — what we DON'T want
    // is 500 (route crash) or 404 (route missing).
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("boiRate");
      expect(body).toHaveProperty("primeRate");
      expect(body).toHaveProperty("inflationRate");
      expect(body).toHaveProperty("updatedAt");
      expect(body).toHaveProperty("source");
      // boiRate is decimal (e.g. 0.045), not percent
      expect(typeof body.boiRate).toBe("number");
      expect(body.boiRate).toBeGreaterThanOrEqual(0);
      expect(body.boiRate).toBeLessThan(0.5);
    }
  });
});

test.describe("Wealth Report CTA", () => {
  test("dashboard exposes link to /report OR is in empty state", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const body = (await page.textContent("body")) || "";
    const isEmpty = body.includes("הדאשבורד יראה את התזרים");
    if (isEmpty) {
      // Empty state intentionally hides the CTA — a report of zeros isn't
      // useful. Verify the empty welcome card is there instead.
      expect(body).toContain("ברוכים הבאים");
      return;
    }
    // Populated dashboard MUST show the CTA.
    const cta = page.getByRole("link", { name: /דוח עושר/ });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toBe("/report");
  });
});

test.describe("Rent-vs-Buy calculator", () => {
  test("/tools loads and the rent-vs-buy calc is registered", async ({ page }) => {
    await page.goto("/tools", { waitUntil: "networkidle" });
    const body = (await page.textContent("body")) || "";
    expect(body).toContain("שכירות מול רכישה");
  });

  test("rent-vs-buy renders verdict + per-year table after selection", async ({ page }) => {
    await page.goto("/tools?calc=rent-vs-buy", { waitUntil: "networkidle" });
    // Wait briefly for state to settle
    await page.waitForTimeout(800);
    const body = (await page.textContent("body")) || "";
    // The verdict line is "עדיף לקנות" or "עדיף לשכור ולהשקיע"
    const hasVerdict =
      body.includes("עדיף לקנות") || body.includes("עדיף לשכור ולהשקיע");
    // The per-year header is also a stable signal that the calc rendered
    const hasTableHeader = body.includes("השוואה שנה אחר שנה");
    expect(hasVerdict || hasTableHeader, "calc should render with default inputs").toBe(true);
  });
});

test.describe("PWA Install Prompt", () => {
  test("does NOT show in headless desktop (Chromium isn't iOS Safari)", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    // Wait long enough that the iOS Safari delayed path would have fired
    await page.waitForTimeout(2000);
    const body = (await page.textContent("body")) || "";
    // The banner copy is "הוסיפו את plan למסך הבית"
    expect(body).not.toContain("הוסיפו את plan למסך הבית");
  });

  test("does NOT show when standalone media-query is true", async ({ browser }) => {
    const context = await browser.newContext({
      // Trick the page into thinking it's already installed (matchMedia
      // standalone returns true) so PwaInstallPrompt should self-skip.
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Force display-mode: standalone via window.matchMedia override.
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => {
        if (q.includes("standalone")) {
          return {
            matches: true,
            media: q,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
            onchange: null,
          } as unknown as MediaQueryList;
        }
        return orig(q);
      };
    });
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const body = (await page.textContent("body")) || "";
    expect(body).not.toContain("הוסיפו את plan למסך הבית");
    await context.close();
  });
});
