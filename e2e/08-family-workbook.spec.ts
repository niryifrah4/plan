import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";

test("family workbook: 12 tabs, bidirectional name sync, XLSX export", async ({ page }) => {
  test.setTimeout(120_000);
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("E2E_EMAIL and E2E_PASSWORD must be set");
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(crm|dashboard)/, { timeout: 15_000 });
  if (page.url().includes("/crm")) {
    const clientRows = page.locator("tbody tr").filter({ has: page.getByRole("button") });
    const clientRowCount = await clientRows.count();
    expect(clientRowCount).toBeGreaterThan(0);
    const clientRow = clientRows.first();
    await expect(clientRow).toBeVisible({ timeout: 20_000 });
    await clientRow.getByRole("button").filter({ hasText: "arrow_back" }).click();
    await page.waitForURL(/\/(dashboard|budget|balance)/, { timeout: 15_000 });
  }
  await page.goto("/family-workbook");
  await expect(page.getByRole("heading", { name: "חוברת משפחה" })).toBeVisible({ timeout: 20_000 });
  const waitForWorkbookSave = () => page.waitForResponse((response) => response.url().includes("/api/sync/blob") && response.request().method() === "POST", { timeout: 15_000 });

  for (const label of ["בית", "שאלון", "מיפוי", "חובות", "מאזן", "מטרות ויעדים", "תזרים", "עסק", "סיכום שנתי", "תובנות", "יומן ליווי", "מחשבונים"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    if (label === "בית") {
      await expect(page.getByRole("heading", { name: "חוברת משפחה" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }
  }

  await page.getByRole("button", { name: "שאלון", exact: true }).click();
  const spouseSave = waitForWorkbookSave();
  await page.getByLabel("שם בן/בת זוג 1", { exact: true }).fill("רועי E2E");
  expect((await spouseSave).status()).toBe(200);

  await page.getByRole("button", { name: "מיפוי", exact: true }).click();
  const budgetSave = waitForWorkbookSave();
  await page.getByLabel("מזון לבית (סופר)", { exact: true }).fill("3200");
  expect((await budgetSave).status()).toBe(200);

  await page.getByRole("button", { name: "מטרות ויעדים", exact: true }).click();
  const goalSave = waitForWorkbookSave();
  await page.getByLabel("קרן חירום", { exact: true }).fill("1800");
  expect((await goalSave).status()).toBe(200);

  await page.getByRole("button", { name: "עסק", exact: true }).click();
  const businessSave = waitForWorkbookSave();
  await page.getByLabel("הכנסות תפעוליות ינואר תכנון", { exact: true }).fill("12000");
  expect((await businessSave).status()).toBe(200);

  await page.getByRole("button", { name: "חובות", exact: true }).click();
  await page.getByRole("button", { name: /הוסף אחר/ }).click();
  const customRows = page.getByRole("row", { name: "אחר — ערוך שם סעיף שדה דינמי" });
  const customRowCount = await customRows.count();
  expect(customRowCount).toBeGreaterThan(0);
  const newestCustomRow = customRows.last();
  const customSave = waitForWorkbookSave();
  await newestCustomRow.getByLabel("אחר — ערוך שם סעיף", { exact: true }).fill("4500");
  expect((await customSave).status()).toBe(200);

  await page.getByRole("button", { name: "מיפוי", exact: true }).click();
  await expect(page.getByText("סה״כ הכנסות", { exact: true })).toBeVisible();
  await expect(page.getByLabel("סה״כ הכנסות", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: /אפיון הלקוח/ }).click();
  await page.waitForURL(/\/onboarding/);
  await page.goto("/onboarding?step=1");
  const start = page.getByRole("button", { name: "בואו נתחיל" });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await page.getByRole("button", { name: "זוג ללא ילדים", exact: true }).click();
  await expect.poll(async () => page.locator("input").count()).toBeGreaterThan(0);
  await expect.poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "רועי E2E"))).toBe(true);

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
