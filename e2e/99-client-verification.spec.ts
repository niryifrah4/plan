import { test, expect } from "@playwright/test";

test("client full verification flow", async ({ page }) => {
  // Increase timeout to allow user to observe
  test.setTimeout(120000);

  // 1. Log in as client
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill("itayk93@gmail.com");
  await page.locator('input[type="password"]').fill("112233");
  await page.locator('button[type="submit"]').click();
  
  // 2. Dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  await page.waitForTimeout(2000); // Wait so user can see it
  
  // 3. Navigation
  const paths = ["/budget", "/balance", "/realestate", "/files", "/investments"];
  for (const p of paths) {
    await page.goto(p);
    await page.waitForTimeout(1500); // Wait so user can see it
  }
  
  // 4. Logout (from Sidebar, we just fixed it!)
  await page.locator('button[title="התנתקות"], button:has-text("התנתקות")').click();
  await page.waitForURL(/\/login/, { timeout: 10000 });
});
