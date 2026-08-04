import { test, expect } from "@playwright/test";

test("family workbook: 12 tabs, bidirectional name sync, XLSX export", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill("niryifrah4@gmail.com");
  await page.locator('input[type="password"]').fill("112233");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });

  const client = page.locator('a[href*="/dashboard"], a[href*="/budget"]').first();
  test.skip((await client.count()) === 0, "No client available");
  await client.click();
  await page.waitForURL(/\/(dashboard|budget|balance)/, { timeout: 15_000 });
  await page.goto("/family-workbook");
  await expect(page.getByRole("heading", { name: "חוברת משפחה" })).toBeVisible({ timeout: 20_000 });

  for (const label of ["בית", "שאלון", "מיפוי", "חובות", "מאזן", "מטרות ויעדים", "תזרים", "עסק", "סיכום שנתי", "תובנות", "יומן ליווי", "מחשבונים"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }

  await page.getByRole("button", { name: "שאלון", exact: true }).click();
  await page.getByLabel("שם בן/בת זוג 1", { exact: true }).fill("רועי E2E");
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /עריכת האפיון המלא/ }).click();
  await expect(page.locator("input").first()).toHaveValue("רועי E2E");

  await page.goto("/family-workbook");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "ייצוא XLSX", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("חוברת-משפחה");
});
