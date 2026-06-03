import { test, expect, type Page } from "@playwright/test";

/**
 * Tenant-isolation regression guard (2026-06-03).
 *
 * The "click yifrah, see beser" leak (fixed across 0e2c0a0 / 5713724 /
 * 74ac670 / 5866aac) is guarded by TWO layers:
 *   1. Edge — `middleware.ts` blocks unauthenticated `/api/*` with a 401
 *      `{"error":"unauthenticated"}` and blocks `/api/crm` for non-advisors,
 *      before the route handler even runs.
 *   2. Route — `app/api/crm/impersonate/enter/route.ts`: no household_id →
 *      400; household not owned by the caller → bounce to /crm?err=not_owned;
 *      owned → set plan_impersonate_hh cookie + 303 /dashboard.
 * In NO failing case may the impersonation cookie be set.
 *
 * Before this spec there was ZERO coverage of that guard. All tests here are
 * read-only — they never mutate client data.
 *
 * The unauthenticated test runs anywhere with no secrets. The authenticated
 * tests need the CURRENT advisor password via PW_ADVISOR_PASSWORD (the old
 * hardcoded `PlanAdvisor2026!` is stale — it now fails with "Invalid login
 * credentials", which silently broke the existing 04/06 specs too). They
 * skip cleanly when that env var is absent.
 *
 *   Run authed:  PW_ADVISOR_PASSWORD='…' npx playwright test e2e/07-tenant-isolation-guard.spec.ts
 */

const ADVISOR_EMAIL = process.env.PW_ADVISOR_EMAIL || "niryifrah4@gmail.com";
const ADVISOR_PASSWORD = process.env.PW_ADVISOR_PASSWORD || "";
// A syntactically valid UUID that belongs to no household.
const FOREIGN_HOUSEHOLD = "00000000-0000-4000-8000-000000000000";
const IMPERSONATE_COOKIE = "plan_impersonate_hh";

async function loginAsAdvisor(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("mail@example.com").fill(ADVISOR_EMAIL);
  await page.locator('input[type="password"]').fill(ADVISOR_PASSWORD);
  // The page has a mode-toggle button ("התחברות") AND a submit button
  // ("כניסה"); target the submit specifically to avoid a strict-mode match.
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/crm/, { timeout: 15_000 });
}

// ── Credential-free: the edge must reject anonymous callers ─────────────────
test("guard: unauthenticated impersonation attempt is blocked at the edge (401), no cookie", async ({
  page,
  context,
}) => {
  const res = await page.request.get(
    `/api/crm/impersonate/enter?household_id=${FOREIGN_HOUSEHOLD}`,
    { maxRedirects: 0 }
  );
  expect(res.status()).toBe(401);
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  expect(body.error).toBe("unauthenticated");

  const cookies = await context.cookies();
  expect(
    cookies.find((c) => c.name === IMPERSONATE_COOKIE),
    "no impersonation cookie may be set for an anonymous request"
  ).toBeFalsy();
});

// ── Authenticated guard (needs PW_ADVISOR_PASSWORD) ─────────────────────────
test("guard: authed advisor entering a non-owned household → /crm?err=not_owned, no cookie", async ({
  page,
  context,
}) => {
  test.skip(
    !ADVISOR_PASSWORD,
    "Set PW_ADVISOR_PASSWORD to the current advisor password to run this."
  );
  await loginAsAdvisor(page);

  await page.goto(
    `/api/crm/impersonate/enter?household_id=${FOREIGN_HOUSEHOLD}`
  );
  await expect(page).toHaveURL(/\/crm(\?|.*&)err=not_owned/, {
    timeout: 10_000,
  });

  const cookies = await context.cookies();
  expect(
    cookies.find((c) => c.name === IMPERSONATE_COOKIE),
    "no impersonation cookie may be set for a non-owned household"
  ).toBeFalsy();
});

test("guard: authed request with missing household_id is rejected (400), no cookie", async ({
  page,
  context,
}) => {
  test.skip(
    !ADVISOR_PASSWORD,
    "Set PW_ADVISOR_PASSWORD to the current advisor password to run this."
  );
  await loginAsAdvisor(page);

  const res = await page.request.get("/api/crm/impersonate/enter");
  expect(res.status()).toBe(400);

  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === IMPERSONATE_COOKIE)).toBeFalsy();
});
