/**
 * Onboarding regression test — post-refactor sanity check.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const APP = 'http://localhost:3000';
const OUT = '/tmp/e2e-plan/screenshots';
mkdirSync(OUT, { recursive: true });

const ADVISOR_EMAIL = 'niryifrah4@gmail.com';
const ADVISOR_PASS  = 'PlanAdvisor2026!';

let pass = 0, fail = 0, warn = 0;
const failures = [];
const warnings = [];
const results   = [];

function ok(label, ms) {
  pass++;
  results.push(`  PASS  ${label}${ms ? ` (${ms}ms)` : ''}`);
  console.log(`[PASS] ${label}`);
}
function ko(label, detail, screenshotPath) {
  fail++;
  failures.push({ label, detail, screenshotPath });
  results.push(`  FAIL  ${label}`);
  console.error(`[FAIL] ${label} — ${detail}`);
}
function wr(label, detail) {
  warn++;
  warnings.push({ label, detail });
  results.push(`  WARN  ${label}`);
  console.warn(`[WARN] ${label} — ${detail}`);
}

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function waitForOnboarding(page) {
  // Wait until the loading spinner is gone
  await page.waitForFunction(() => {
    const el = document.querySelector('[class*="animate-spin"]');
    return !el;
  }, { timeout: 20_000 });
  // Also wait for a step card to appear
  await page.waitForSelector('.card-pad, [class*="card"]', { timeout: 10_000 });
}

async function run() {
  const start = Date.now();
  const browser = await chromium.launch({ headless: true, args: ['--lang=he-IL'] });
  const ctx = await browser.newContext({
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // ── 1. Login ──────────────────────────────────────────────────────────
    const t0 = Date.now();
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle', timeout: 20_000 });
    await shot(page, '00-login-page');

    try {
      // Fill credentials FIRST, then set up navigation listener before clicking
      const emailInput = page.locator('input[type="email"]');
      await emailInput.waitFor({ state: 'visible', timeout: 5_000 });
      await emailInput.click();
      await emailInput.fill(ADVISOR_EMAIL);

      const pwInput = page.locator('input[type="password"]');
      await pwInput.click();
      await pwInput.fill(ADVISOR_PASS);
      await shot(page, '00b-login-filled');

      // Submit and wait for navigation (login does window.location.href)
      const navPromise = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 25_000 });
      await page.locator('button[type="submit"]').click();
      await navPromise;

      // /auth/callback may redirect again
      if (page.url().includes('/auth/callback')) {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 }).catch(() => {});
      }

      const landedUrl = page.url();
      if (landedUrl.includes('/login')) {
        const bodyText = await page.textContent('body').catch(() => '');
        await shot(page, 'fail-01-login-error');
        throw new Error(`Still on login after submit. Page content: ${bodyText?.substring(0, 200)}`);
      }
      ok(`Login → redirected to ${landedUrl.replace(APP, '')}`, Date.now() - t0);
    } catch (e) {
      const sp = await shot(page, 'fail-01-login');
      ko('Login', `${String(e)} | URL: ${page.url()}`, sp);
      return;
    }

    // ── 2. Navigate to /onboarding ────────────────────────────────────────
    const currentUrl = page.url();

    if (currentUrl.includes('/crm')) {
      // Look for impersonation button
      try {
        const impBtn = page.locator('button, a').filter({ hasText: /כניסה לתיק/ }).first();
        if (await impBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await impBtn.click();
          await page.waitForURL(url => !url.toString().includes('/crm'), { timeout: 10_000 });
          ok('CRM → impersonation started');
        } else {
          wr('No client to impersonate', 'Going directly to /onboarding');
          await page.goto(`${APP}/onboarding`, { waitUntil: 'networkidle', timeout: 15_000 });
        }
      } catch {
        await page.goto(`${APP}/onboarding`, { waitUntil: 'networkidle', timeout: 15_000 });
      }
    } else if (!currentUrl.includes('/onboarding')) {
      await page.goto(`${APP}/onboarding`, { waitUntil: 'networkidle', timeout: 15_000 });
    }

    // Confirm /onboarding
    if (!page.url().includes('/onboarding')) {
      // If redirected to /login, auth failed
      if (page.url().includes('/login')) {
        const sp = await shot(page, 'fail-02-auth-failed');
        ko('Reach /onboarding', `Auth failed — redirected back to /login`, sp);
        return;
      }
      const sp = await shot(page, 'fail-02-no-onboarding');
      ko('Reach /onboarding', `URL is ${page.url()}`, sp);
      return;
    }
    ok('Reached /onboarding');

    // ── 3. Hydration spinner resolves ─────────────────────────────────────
    try {
      await waitForOnboarding(page);
      ok('Hydration spinner resolved, form visible');
    } catch (e) {
      const sp = await shot(page, 'fail-03-spinner');
      ko('Hydration spinner', String(e), sp);
      return;
    }
    await shot(page, 'step-1-loaded');

    // Check current step (might be > 1 if persisted state has last step)
    // Navigate to step 1 via circle
    try {
      const circles = page.locator('header button');
      if (await circles.count() >= 1) {
        await circles.first().click();
        await page.waitForTimeout(400);
      }
    } catch {}

    // ── 4. Step 1 structure ───────────────────────────────────────────────
    try {
      const h = await page.locator('text=פרופיל משפחתי').first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (h) ok('Step 1: "פרופיל משפחתי" visible');
      else ko('Step 1: title', '"פרופיל משפחתי" not found', await shot(page, 'fail-04-s1-title'));

      const emp = await page.locator('text=תעסוקה').first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (emp) ok('Step 1: employment section visible');
      else wr('Step 1: employment', '"תעסוקה" not found');

      // Progress circles
      const circleCount = await page.locator('header button').count();
      if (circleCount >= 5) ok(`ProgressBar: ${circleCount} step buttons visible`);
      else wr('ProgressBar', `Found ${circleCount} buttons, expected 5+`);

      // Save status pill
      const savePill = await page.locator('text=אוטומטי').first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (savePill) ok('Save status pill visible ("אוטומטי")');
      else wr('Save status pill', 'Not found');
    } catch (e) {
      const sp = await shot(page, 'fail-04-step1');
      ko('Step 1: structure', String(e), sp);
    }

    // ── 5. Auto-save ──────────────────────────────────────────────────────
    try {
      // Find first .inp input (שם מלא of p1)
      const firstInp = page.locator('input.inp').first();
      await firstInp.click({ timeout: 3_000 });
      await firstInp.fill('ישראל ישראלי');
      await firstInp.dispatchEvent('input');

      // Wait for "שומר..." or "נשמר אוטומטית"
      try {
        await page.waitForFunction(() => {
          return Array.from(document.querySelectorAll('span')).some(
            el => ['שומר...', 'נשמר אוטומטית'].includes(el.textContent?.trim() || '')
          );
        }, { timeout: 4_000 });
        ok('Auto-save: save indicator transitions from idle');

        await page.waitForFunction(() => {
          return Array.from(document.querySelectorAll('span')).some(
            el => el.textContent?.trim() === 'נשמר אוטומטית'
          );
        }, { timeout: 5_000 });
        ok('Auto-save: settled to "נשמר אוטומטית"');
      } catch {
        wr('Auto-save', 'Indicator did not transition within 4s (debounce is 1.5s — may need longer wait)');
      }
    } catch (e) {
      wr('Auto-save', String(e));
    }

    // ── 6. Add child + DOB → age ──────────────────────────────────────────
    try {
      const addChildBtn = page.locator('button').filter({ hasText: /הוסף ילד/ }).first();
      if (!await addChildBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        ko('Add child', '"הוסף ילד/ה" not found', await shot(page, 'fail-06-add-child'));
      } else {
        await addChildBtn.click();
        await page.waitForTimeout(400);

        // Fill DOB on the last date input
        const dobInputs = page.locator('input[type="date"]');
        if (await dobInputs.count() > 0) {
          const fiveYearsAgo = new Date();
          fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
          const dobValue = fiveYearsAgo.toISOString().split('T')[0];
          const lastDob = dobInputs.last();
          await lastDob.fill(dobValue);
          await lastDob.dispatchEvent('change');
          await page.waitForTimeout(400);

          const bodyText = await page.textContent('body') || '';
          if (/גיל [45]/.test(bodyText)) {
            ok('Child DOB → age auto-calculated');
          } else {
            wr('Child DOB → age', `Age not shown. Body snippet: ${bodyText.substring(0, 200)}`);
          }

          const savingsSec = await page.locator('text=חיסכון לכל ילד').first().isVisible({ timeout: 2_000 }).catch(() => false);
          if (savingsSec) ok('Child row: "חיסכון לכל ילד" sub-section rendered');
          else ko('Child savings sub-section', '"חיסכון לכל ילד" not visible', await shot(page, 'fail-06-savings'));
        } else {
          wr('Child DOB', 'No date inputs found');
        }
      }
    } catch (e) {
      ko('Child + DOB', String(e), await shot(page, 'fail-06-child'));
    }

    await shot(page, 'step-1-after-child');

    // ── 7. Navigate step 1 → 2 ───────────────────────────────────────────
    try {
      const nextBtn = page.locator('button').filter({ hasText: /שלב הבא/ }).first();
      if (!await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        ko('Navigation: שלב הבא', 'Button not found', await shot(page, 'fail-07-next'));
      } else {
        await nextBtn.click();
        await page.waitForTimeout(600);
        const s2 = await page.locator('text=תמונה כספית').first().isVisible({ timeout: 3_000 }).catch(() => false);
        if (s2) ok('Navigation: step 1 → 2 via "שלב הבא"');
        else ko('Step 2 load', '"תמונה כספית" not visible', await shot(page, 'fail-07-step2'));
      }
    } catch (e) {
      ko('Navigation 1→2', String(e), await shot(page, 'fail-07'));
    }

    await shot(page, 'step-2-loaded');

    // ── 8. Step 2: income + investment property sub-form ─────────────────
    try {
      const incomeH = await page.locator('text=הכנסות חודשיות').first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (incomeH) ok('Step 2: income section visible');
      else ko('Step 2: income section', 'Not found', await shot(page, 'fail-08-income'));

      // Find asset type select and switch to "נדל"ן להשקעה"
      const allSelects = page.locator('select');
      let switched = false;
      const selectCount = await allSelects.count();
      for (let i = 0; i < selectCount; i++) {
        const sel = allSelects.nth(i);
        const opts = await sel.locator('option').allTextContents();
        if (opts.some(o => o.includes('להשקעה'))) {
          await sel.selectOption({ label: 'נדל"ן להשקעה' });
          await page.waitForTimeout(400);
          switched = true;
          break;
        }
      }

      if (switched) {
        const rentalForm = await page.locator('text=פרטי שכירות').first().isVisible({ timeout: 2_000 }).catch(() => false);
        if (rentalForm) ok('Step 2: investment property → rental sub-form appears');
        else ko('Step 2: rental sub-form', '"פרטי שכירות" not visible after type change', await shot(page, 'fail-08-rental'));
      } else {
        wr('Step 2: asset type select', 'Could not find select with "להשקעה" option');
      }

      await shot(page, 'step-2-rental-subform');
    } catch (e) {
      ko('Step 2: checks', String(e), await shot(page, 'fail-08'));
    }

    // ── 9. Navigate to step 3 via ProgressBar circle ──────────────────────
    try {
      const circles = page.locator('header button');
      if (await circles.count() >= 3) {
        await circles.nth(2).click(); // 0-indexed: step 3
        await page.waitForTimeout(500);
        const s3 = await page.locator('text=/ניהול סיכונים|כיסויים ביטוחיים/').first().isVisible({ timeout: 3_000 }).catch(() => false);
        if (s3) ok('Navigation: ProgressBar circle → step 3');
        else ko('Step 3 load via circle', 'Title not visible', await shot(page, 'fail-09-s3'));
      } else {
        wr('ProgressBar', 'Not enough circles');
      }
    } catch (e) {
      ko('Navigate to step 3', String(e), await shot(page, 'fail-09'));
    }

    await shot(page, 'step-3-loaded');

    // ── 10. Step 3: 4 insurance rows + legal dropdowns ────────────────────
    try {
      const insRows = await page.locator('table tbody tr').count();
      if (insRows === 4) ok('Step 3: insurance table has 4 default rows');
      else if (insRows > 0) wr('Step 3: insurance rows', `Expected 4, found ${insRows}`);
      else ko('Step 3: insurance rows', 'tbody empty', await shot(page, 'fail-10-ins'));

      const legalH = await page.locator('text=מדיניות משפטית').first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (legalH) ok('Step 3: legal section ("מדיניות משפטית") visible');
      else wr('Step 3: legal', 'Not found');
    } catch (e) {
      ko('Step 3: checks', String(e), await shot(page, 'fail-10'));
    }

    // ── 11. Step 4 via שלב הבא ────────────────────────────────────────────
    try {
      await page.locator('button').filter({ hasText: /שלב הבא/ }).first().click();
      await page.waitForTimeout(500);
      const s4 = await page.locator('text=/חזון|מטרות ויעדים/').first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (s4) ok('Navigation: step 3 → 4');
      else ko('Step 4 load', 'Title not visible', await shot(page, 'fail-11-s4'));

      const taCount = await page.locator('textarea').count();
      if (taCount >= 3) ok(`Step 4: ${taCount} textareas visible`);
      else wr('Step 4: textareas', `Expected 3+, found ${taCount}`);

      const goalsT = await page.locator('text=טבלת יעדים').first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (goalsT) ok('Step 4: goals table visible');
      else wr('Step 4: goals table', 'Not found');
    } catch (e) {
      ko('Step 4: checks', String(e), await shot(page, 'fail-11'));
    }

    await shot(page, 'step-4-loaded');

    // ── 12. Step 5 via שלב הבא ────────────────────────────────────────────
    try {
      await page.locator('button').filter({ hasText: /שלב הבא/ }).first().click();
      await page.waitForTimeout(500);
      const s5 = await page.locator('text=/פנסיה ופרישה|תכנון פרישה/').first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (s5) ok('Navigation: step 4 → 5');
      else ko('Step 5 load', 'Title not visible', await shot(page, 'fail-12-s5'));

      const finishBtn = page.locator('button').filter({ hasText: /סיום/ }).first();
      if (await finishBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        ok('Step 5: "סיום ומעבר לדשבורד" button visible');
      } else {
        ko('Step 5: finish button', 'Not visible', await shot(page, 'fail-12-finish'));
      }
    } catch (e) {
      ko('Step 5: checks', String(e), await shot(page, 'fail-12'));
    }

    await shot(page, 'step-5-loaded');

    // ── 13. Finish → /dashboard ───────────────────────────────────────────
    try {
      const finishBtn = page.locator('button').filter({ hasText: /סיום/ }).first();
      if (await finishBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await finishBtn.click();
        await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
        ok('Finish → /dashboard redirect');
      } else {
        wr('Finish button', 'Not found on step 5 — skip redirect test');
      }
    } catch (e) {
      ko('Finish → /dashboard', `${String(e)} | URL: ${page.url()}`, await shot(page, 'fail-13-finish'));
    }

    // ── 14. "שלב קודם" test ───────────────────────────────────────────────
    try {
      await page.goto(`${APP}/onboarding`, { waitUntil: 'networkidle', timeout: 15_000 });
      await waitForOnboarding(page);

      // Jump to step 2
      const circles = page.locator('header button');
      if (await circles.count() >= 2) {
        await circles.nth(1).click();
        await page.waitForTimeout(400);

        const prevBtn = page.locator('button').filter({ hasText: /שלב קודם/ }).first();
        if (await prevBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await prevBtn.click();
          await page.waitForTimeout(400);
          const s1 = await page.locator('text=פרופיל משפחתי').first().isVisible({ timeout: 3_000 }).catch(() => false);
          if (s1) ok('"שלב קודם" navigates back to step 1');
          else wr('"שלב קודם"', 'Clicked but step 1 not visible');
        } else {
          wr('"שלב קודם"', 'Not visible on step 2');
        }
      }
    } catch (e) {
      wr('"שלב קודם" test', String(e));
    }

    // ── 15. Console errors ────────────────────────────────────────────────
    const relevantErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR_') &&
      !e.includes('Failed to load resource') &&
      !e.includes('ERR_CONNECTION_REFUSED')
    );
    if (relevantErrors.length === 0) {
      ok('No console errors during test run');
    } else {
      relevantErrors.slice(0, 5).forEach(e => wr('Console error', e.substring(0, 200)));
    }

  } finally {
    await browser.close();
  }

  // ── Report ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(`QA Report — Onboarding Regression (post-refactor)`);
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('═'.repeat(60));
  console.log(`\nSUMMARY: PASS ${pass} | FAIL ${fail} | WARN ${warn} | Time: ${elapsed}s\n`);
  results.forEach(r => console.log(r));

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(f => {
      console.log(`\n  [FAIL] ${f.label}`);
      console.log(`         ${f.detail}`);
      if (f.screenshotPath) console.log(`         Screenshot: ${f.screenshotPath}`);
    });
  }
  if (warnings.length > 0) {
    console.log('\nWARNINGS:');
    warnings.forEach(w => console.log(`  [WARN] ${w.label}: ${w.detail}`));
  }

  console.log('\nScreenshots: ' + OUT);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
