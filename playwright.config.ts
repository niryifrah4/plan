import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — runs against staging by default, prod when explicit.
 *
 * Local dev:    PW_BASE_URL=http://localhost:3000 npx playwright test
 * Staging:      npx playwright test                 (default URL = live)
 * Specific:     npx playwright test e2e/login.spec.ts
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // Sequential — easier to read failures
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PW_BASE_URL || "https://plan-app-06b0.onrender.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],
});
