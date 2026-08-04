import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";

test("family workbook: 12 tabs, bidirectional name sync, XLSX export", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill("niryifrah4@gmail.com");
  await page.locator('input[type="password"]').fill("112233");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });

  const clientRow = page.locator("tbody tr").filter({ has: page.getByRole("button") }).first();
  await expect(clientRow).toBeVisible({ timeout: 20_000 });
  await clientRow.getByRole("button").filter({ hasText: "arrow_back" }).click();
  await page.waitForURL(/\/(dashboard|budget|balance)/, { timeout: 15_000 });
  await page.goto("/family-workbook");
  await expect(page.getByRole("heading", { name: "חוברת משפחה" })).toBeVisible({ timeout: 20_000 });

  for (const label of ["בית", "שאלון", "מיפוי", "חובות", "מאזן", "מטרות ויעדים", "תזרים", "עסק", "סיכום שנתי", "תובנות", "יומן ליווי", "מחשבונים"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    if (label === "בית") {
      await expect(page.getByRole("heading", { name: "חוברת משפחה" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }
  }

  await page.getByRole("button", { name: "שאלון", exact: true }).click();
  await page.getByLabel("שם בן/בת זוג 1", { exact: true }).fill("רועי E2E");
  await expect.poll(async () => page.evaluate(() => Object.values(localStorage).some((value) => value.includes("רועי E2E")))).toBe(true);

  await page.getByRole("link", { name: /אפיון הלקוח/ }).click();
  await page.waitForURL(/\/onboarding/);
  await page.goto("/onboarding?step=1");
  const start = page.getByRole("button", { name: "בואו נתחיל" });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await page.getByRole("button", { name: "זוג ללא ילדים", exact: true }).click();
  await expect.poll(async () => page.locator("input").count()).toBeGreaterThan(0);
  await expect.poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "רועי E2E"))).toBe(true);
  await expect.poll(async () => page.evaluate(() => Object.values(localStorage).some((value) => value.includes("רועי E2E")))).toBe(true);

  await page.goto("/family-workbook");
  await page.getByRole("button", { name: "שאלון", exact: true }).click();
  await expect(page.getByLabel("שם בן/בת זוג 1", { exact: true })).toHaveValue("רועי E2E");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "ייצוא XLSX", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toContain("חוברת-משפחה");
  const workbook = XLSX.readFile((await file.path()) || "", { cellStyles: true });
  expect(workbook.SheetNames).toEqual(["בית", "שאלון", "מיפוי", "חובות", "מאזן", "מטרות ויעדים", "תזרים", "עסק", "סיכום שנתי", "תובנות", "יומן ליווי", "מחשבונים"]);
  const exportedQuestionnaire = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["שאלון"], { header: 1 }).flat();
  expect(exportedQuestionnaire).toContain("רועי E2E");
  expect(workbook.Sheets["שאלון"]["C6"]?.s).toBeTruthy();
});
