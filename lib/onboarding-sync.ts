/**
 * ═══════════════════════════════════════════════════════════
 *  Onboarding → Stores Sync Engine
 * ═══════════════════════════════════════════════════════════
 *
 * Reads data from the onboarding questionnaire localStorage keys
 * and syncs it to all relevant stores:
 *   - liabilities → debt-store
 *   - insurance   → risk-store
 *   - pension     → pension-store
 *   - income/expenses → assumptions
 *
 * Idempotent: uses "onb_" prefixed IDs so re-runs don't duplicate.
 */

import { loadDebtData, saveDebtData, type Loan, type MortgageData } from "./debt-store";
import { loadRiskItems, saveRiskItems, type RiskItem, DEFAULT_RISK_ITEMS } from "./risk-store";
import { loadPensionFunds, savePensionFunds, type PensionFund, EVENT_NAME as PENSION_EVENT } from "./pension-store";
import { loadAssumptions, saveAssumptions } from "./assumptions";
import { loadKidsSavings, saveKidsSavings, kidSavingsId, DEFAULT_MONTHLY, GOV_MONTHLY_DEPOSIT, type KidSavings } from "./kids-savings-store";
import { loadProperties, saveProperties, type Property, EVENT_NAME as RE_EVENT } from "./realestate-store";
import { loadBuckets, saveBuckets, BUCKETS_EVENT, createBucket } from "./buckets-store";
import { fireSync } from "./sync-engine";
import { syncChildLifeEvents } from "./life-events";
import type { Bucket, OnboardingGoalRow } from "@shared/buckets-core";
import { migrateOnboardingGoals } from "@shared/buckets-core";
import { loadSalaryProfile, saveSalaryProfile, DEFAULT_SALARY_PROFILE } from "./salary-engine";
import { loadBudgets, saveBudgets, DEFAULT_BUDGETS, type BudgetCategory } from "./budget-store";
import { scopedKey } from "./client-scope";

/* ── Onboarding localStorage keys ── */
const ONB_FIELDS      = "verdant:onboarding:fields";
const ONB_LIABILITIES = "verdant:onboarding:liabilities";
const ONB_INSURANCE   = "verdant:onboarding:insurance";
const ONB_ASSETS      = "verdant:onboarding:assets";
const ONB_GOALS       = "verdant:onboarding:goals";
const ONB_INCOMES     = "verdant:onboarding:incomes";
const ONB_SYNCED_AT   = "verdant:onboarding_synced_at";
/**
 * Sentinel: one-shot flag meaning "the budget was already seeded from the
 * onboarding answers, never touch it again." Once set, the budget becomes
 * the single source of truth — the user edits it in the budget page and
 * the questionnaire's expense fields stop pushing data.
 */
const BUDGET_SEEDED   = "verdant:onboarding:budget_seeded";
const ASSUMPTIONS_SEEDED = "verdant:onboarding:assumptions_seeded";
/**
 * Sentinel: goals (buckets) were seeded from the onboarding answers once.
 * After seeding, the goals page owns the list — if the user deletes a goal
 * there, re-running onboarding sync must NOT re-create it. New onboarding
 * rows are still added (appended) on subsequent runs so the user can keep
 * capturing goals in the questionnaire if they choose to.
 */
const GOALS_SEEDED    = "verdant:onboarding:goals_seeded";
const EMERGENCY_SEEDED = "verdant:onboarding:emergency_seeded";
/**
 * Sentinel: salary profile seeded from onboarding (p1_gross / p1_credit_points).
 * After seeding, the salary page owns the profile — repeating onboarding must
 * not overwrite user refinements (pension %, study-fund %, periphery, etc.).
 */
const SALARY_SEEDED   = "verdant:onboarding:salary_seeded";

/* ── Helpers ── */
function readJSON<T>(key: string, fallback: T): T {
  try {
    // Try scoped key first, then raw key (usePersistedState saves without scope)
    const raw = localStorage.getItem(scopedKey(key)) || localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

/* ── Types matching onboarding form ── */
interface OnbField {
  income?: string;
  expenses?: string;
  age?: string;
  pension_type_1?: string;
  pension_company_1?: string;
  pension_balance_1?: string;
  pension_monthly_emp_1?: string;
  pension_monthly_er_1?: string;
  pension_type_2?: string;
  pension_company_2?: string;
  pension_balance_2?: string;
  pension_monthly_emp_2?: string;
  pension_monthly_er_2?: string;
  [key: string]: any;
}

interface OnbLiability {
  type: string;        // "משכנתא" | "הלוואה" | "אשראי"
  lender: string;
  balance: string;
  rate: string;
  monthly: string;
}

interface OnbInsurance {
  type: string;        // "ביטוח חיים" | "בריאות" | "סיעוד" | "אובדן כושר עבודה" | "ביטוח אחר"
  has: string;         // "כן" | "לא" | "לא יודע" | ""
  company: string;
  coverage: string;
  premium: string;
  for?: string;        // optional — whose insurance (e.g. "בן זוג")
  isCustom?: string;   // "1" for user-added rows
}

interface OnbAsset {
  type: string;        // "נדל\"ן למגורים" | "נדל\"ן להשקעה" | ...
  desc: string;
  value: string;
  /** Monthly gross rent — investment properties only (optional). */
  rent?: string;
  /** Monthly operating expenses (non-mortgage) — investment properties only (optional). */
  rentExpenses?: string;
}

/* ── Main sync function ── */
export function syncOnboardingToStores(): void {
  if (typeof window === "undefined") return;

  const fields: OnbField = readJSON(ONB_FIELDS, {});
  const liabilities: OnbLiability[] = readJSON(ONB_LIABILITIES, []);
  const insurances: OnbInsurance[] = readJSON(ONB_INSURANCE, []);
  const assets: OnbAsset[] = readJSON(ONB_ASSETS, []);
  const goals: OnboardingGoalRow[] = readJSON(ONB_GOALS, []);

  syncLiabilitiesToDebtStore(liabilities);
  syncInsuranceToRiskStore(insurances);
  syncLegalDocsToRiskStore(fields);
  syncPensionToPensionStore(fields);
  syncFieldsToAssumptions(fields);
  syncChildrenToKidsSavings();
  syncChildLifeEventsFromOnb();
  syncRealEstateToPropertyStore(assets);
  syncGemelAssetsToPrensionStore(assets);
  syncGoalsToBuckets(goals);
  syncSalaryProfile(fields);
  syncBudgetFromExpenses(fields);
  // Emergency fund must run AFTER syncBudgetFromExpenses so we have
  // assumptions.monthlyExpenses available for the 3× target calculation.
  seedEmergencyFundBucket();

  // Mark as synced
  localStorage.setItem(scopedKey(ONB_SYNCED_AT), new Date().toISOString());

  // Dispatch events so WealthTab and other listeners immediately re-read the stores
  window.dispatchEvent(new CustomEvent("verdant:debt:updated"));
  window.dispatchEvent(new Event(RE_EVENT));
  window.dispatchEvent(new Event("verdant:risk:updated"));
  window.dispatchEvent(new Event("verdant:assumptions"));
  window.dispatchEvent(new Event("verdant:kids_savings:updated"));
  window.dispatchEvent(new Event(BUCKETS_EVENT));
}

/* ── 10. Expense fields → Budget Store ──
 *
 * Carries the onboarding expenses into the budget as starting values —
 * the user then refines inside the budget page. This implements the
 * "budget carry-forward" pattern: budget auto-fills from the latest
 * snapshot instead of defaulting to stock values.
 *
 * Only categories with a matching onboarding field get updated; the rest
 * keep whatever the user already set (or the factory default).
 */
function syncBudgetFromExpenses(fields: OnbField): void {
  // One-shot: once the budget has been seeded, the user owns it. Never
  // overwrite. This is the "שאלון = נקודת פתיחה, תקציב = האמת" rule.
  if (localStorage.getItem(scopedKey(BUDGET_SEEDED))) return;

  const n = (k: string): number => parseFloat(fields[k] || "0") || 0;

  // Aggregate onboarding fields → budget category buckets.
  const fromOnb: Record<string, number> = {
    housing:      n("exp_housing") + n("exp_property_tax"),
    utilities:    n("exp_utilities") + n("exp_telecom"),
    education:    n("exp_education"),
    insurance:    n("exp_insurance"),
    food:         n("exp_food"),
    transport:    n("exp_car"),
    leisure:      n("exp_leisure") + n("exp_vacation"),
    health:       n("exp_health"),
    shopping:     n("exp_other"),
  };

  // If no expenses provided at all, don't overwrite the user's existing setup.
  const any = Object.values(fromOnb).some((v) => v > 0);
  if (!any) return;

  const existing = loadBudgets();
  const byKey = new Map<string, BudgetCategory>();
  // Start from existing (or defaults) so we preserve categories not touched here.
  const base = existing.length > 0 ? existing : DEFAULT_BUDGETS;
  for (const b of base) byKey.set(b.key, { ...b });

  let changed = false;
  for (const [key, amount] of Object.entries(fromOnb)) {
    if (amount <= 0) continue;
    const current = byKey.get(key);
    if (!current) continue;
    // Round to nearest ₪50 for cleaner user-facing numbers.
    const rounded = Math.round(amount / 50) * 50;
    if (current.budget !== rounded) {
      current.budget = rounded;
      changed = true;
    }
  }

  if (changed) {
    saveBudgets(Array.from(byKey.values()));
  }
  // Set sentinel even if nothing changed — we've done our one-shot pass.
  localStorage.setItem(scopedKey(BUDGET_SEEDED), new Date().toISOString());
}

/* ── 9. Gross salary breakdown → Salary Profile ──
 *
 * The onboarding's "שכר נטו" fields are great for cashflow, but the
 * salary engine (tax/pension/study-fund math) needs GROSS. The optional
 * `p1_gross` / `p1_annual_bonus` / `p1_credit_points` fields in step 2
 * feed the salary profile. If neither spouse's gross is set, we skip —
 * the dedicated salary page still works.
 *
 * We take the PRIMARY earner (spouse 1 by default; fall back to spouse 2
 * if spouse 1 has no gross). Multi-earner households can refine in the
 * salary page. Defaults for pension% / study-fund% come from the Israeli
 * standard contribution rates.
 */
function syncSalaryProfile(fields: OnbField): void {
  // One-shot: once seeded, the salary page owns the profile. Prevents the
  // questionnaire's gross/credit-points from overwriting user refinements
  // (higher voluntary pension %, study-fund %, periphery benefit, etc.).
  if (localStorage.getItem(scopedKey(SALARY_SEEDED))) return;

  const p1Gross = parseFloat(fields.p1_gross || "0");
  const p2Gross = parseFloat(fields.p2_gross || "0");
  const gross = p1Gross > 0 ? p1Gross : p2Gross;
  if (gross <= 0) return;

  const annualBonus = p1Gross > 0
    ? parseFloat(fields.p1_annual_bonus || "0")
    : parseFloat(fields.p2_annual_bonus || "0");
  const creditPointsRaw = p1Gross > 0
    ? parseFloat(fields.p1_credit_points || "")
    : parseFloat(fields.p2_credit_points || "");

  const existing = loadSalaryProfile();
  const profile = {
    ...DEFAULT_SALARY_PROFILE,
    ...existing,
    monthlyGross: gross,
    annualBonus: isFinite(annualBonus) ? annualBonus : existing.annualBonus,
    creditPoints: isFinite(creditPointsRaw) && creditPointsRaw > 0
      ? creditPointsRaw
      : existing.creditPoints,
  };
  // Only save if something actually changed
  if (profile.monthlyGross !== existing.monthlyGross ||
      profile.annualBonus !== existing.annualBonus ||
      profile.creditPoints !== existing.creditPoints) {
    saveSalaryProfile(profile);
  }
  // Mark one-shot seed done — salary page now owns the profile.
  localStorage.setItem(scopedKey(SALARY_SEEDED), new Date().toISOString());
}

/* ── 8. Goals → Buckets Store ──
 *
 * Merges onboarding goals into the existing bucket list. Matches by name
 * (case-insensitive, trimmed) so re-running the sync doesn't duplicate.
 * Updates `targetAmount` / `targetDate` from the questionnaire when a
 * matching bucket exists, keeping the user's progress (`currentAmount`,
 * `contributionHistory`, etc.) intact.
 */
function syncGoalsToBuckets(rows: OnboardingGoalRow[]): void {
  // One-shot seed: once goals have been seeded from onboarding, the goals
  // page owns the list. This prevents re-creating goals the user deleted
  // in /goals and prevents overwriting user edits (targetAmount, priority).
  // Same rule as budget: "השאלון = נקודת פתיחה, עמוד היעדים = האמת".
  if (localStorage.getItem(scopedKey(GOALS_SEEDED))) return;

  // Normalize priority values emitted by the onboarding UI.
  // Questionnaire uses: "want" | "need" | "dream" | "גבוהה" | "בינונית" | "נמוכה" | "".
  const normalized: OnboardingGoalRow[] = (rows || [])
    .filter((r) => r?.name?.trim() && parseFloat(String(r.cost || "")) > 0)
    .map((r) => ({
      ...r,
      priority:
        r.priority === "need"  ? "גבוהה" :
        r.priority === "want"  ? "בינונית" :
        r.priority === "dream" ? "נמוכה" :
        r.priority || "בינונית",
    }));

  // No usable rows — still mark as seeded so we don't keep scanning on
  // every goals-page mount (user chose not to enter goals in the questionnaire).
  if (normalized.length === 0) {
    localStorage.setItem(scopedKey(GOALS_SEEDED), new Date().toISOString());
    return;
  }

  const existing = loadBuckets();
  const migrated = migrateOnboardingGoals(normalized);

  const byName = new Map<string, Bucket>();
  for (const b of existing) byName.set(b.name.trim().toLowerCase(), b);

  let changed = false;
  for (const m of migrated) {
    const key = m.name.trim().toLowerCase();
    const match = byName.get(key);
    if (match) {
      // Update target values from questionnaire; preserve user's progress.
      if (match.targetAmount !== m.targetAmount || match.targetDate !== m.targetDate || match.priority !== m.priority) {
        match.targetAmount = m.targetAmount;
        match.targetDate = m.targetDate;
        match.priority = m.priority;
        match.updatedAt = new Date().toISOString();
        changed = true;
      }
    } else {
      byName.set(key, m);
      changed = true;
    }
  }

  if (changed) saveBuckets(Array.from(byName.values()));
  // Mark seed complete (even if nothing changed — we've run the one-shot pass).
  localStorage.setItem(scopedKey(GOALS_SEEDED), new Date().toISOString());
}

/* ── Emergency fund — auto-seed once ──
 * Per Nir 2026-04-28: emergency fund target is monthly INCOME × coverage.
 * Reasoning: the fund replaces lost income while the family looks for new
 * work; income — not expenses — measures the gap to fill. Default 3 months;
 * UI in /goals lets the user toggle to 6.
 * Idempotent — runs once per client (EMERGENCY_SEEDED flag).
 * Skips if user already created a bucket with the same name. */
function seedEmergencyFundBucket(): void {
  if (localStorage.getItem(scopedKey(EMERGENCY_SEEDED))) return;

  // Pull household income from the dynamic incomes list (both spouses + side
  // gigs all flow into ONB_INCOMES). Fallback to assumptions.monthlyIncome
  // (legacy single-line entry), then a hard floor of ₪30k.
  let monthlyIncome = 0;
  try {
    const incomes = readJSON<Array<{ value?: string }>>(ONB_INCOMES, []);
    monthlyIncome = incomes.reduce((s, r) => s + (parseFloat(r?.value || "0") || 0), 0);
  } catch {}
  if (monthlyIncome <= 0) {
    const assumptions = loadAssumptions();
    monthlyIncome = assumptions.monthlyIncome || 0;
  }

  const coverageMonths = 3; // default — user can flip to 6 in /goals
  const target = monthlyIncome > 0
    ? Math.round(monthlyIncome * coverageMonths)
    : 30000;

  const existing = loadBuckets();
  const hasIt = existing.some(b =>
    b.name.includes("חירום") || b.name.toLowerCase().includes("emergency")
  );

  if (!hasIt) {
    // 12-month horizon — short, so the goal stays urgent in the UI.
    const targetDate = new Date(Date.now() + 365 * 24 * 3600 * 1000)
      .toISOString().split("T")[0];
    const emergencyBucket = createBucket({
      name: "קרן חירום",
      icon: "shield",
      targetAmount: target,
      targetDate,
      priority: "high",
      expectedAnnualReturn: 0.03, // money-market / cash equivalent
      coverageMonths,
      isEmergency: true,
      notes: `מטרה אוטומטית: ${coverageMonths}× הכנסה חודשית. עדכן אם המספר לא מתאים.`,
    });
    saveBuckets([...existing, emergencyBucket]);
    fireSync(BUCKETS_EVENT);
  }

  localStorage.setItem(scopedKey(EMERGENCY_SEEDED), new Date().toISOString());
}

/* ── 1. Liabilities → Debt Store ── */
function syncLiabilitiesToDebtStore(liabilities: OnbLiability[]): void {
  if (liabilities.length === 0) return;

  const debt = loadDebtData();
  let changed = false;

  // Derive approximate payoff end-date from (remaining balance ÷ monthly payment).
  // This is an UNDER-estimate because it ignores interest accrual — the real
  // payoff comes from the amortization PDF upload on the realestate page.
  // Until then, a ballpark end-date beats an empty string: the retirement-
  // income engine needs SOME date to model the "mortgage payoff → rent jump"
  // event in the trajectory.
  const nowYM = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const addMonths = (ym: string, months: number): string => {
    const [y, m] = ym.split("-").map(Number);
    const total = y * 12 + (m - 1) + months;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  };

  for (const lib of liabilities) {
    const balance = parseFloat(lib.balance) || 0;
    const monthly = parseFloat(lib.monthly) || 0;
    if (balance === 0 && monthly === 0) continue;

    if (lib.type === "משכנתא") {
      // Sync as mortgage
      if (!debt.mortgage) {
        const totalPayments = monthly > 0 ? Math.round(balance / monthly) : 0;
        debt.mortgage = {
          bank: lib.lender || "לא צוין",
          propertyValue: 0,
          tracks: [{
            id: "onb_mortgage_1",
            name: "מסלול ראשי",
            interestRate: parseFloat(lib.rate) || 0,
            indexation: "לא צמוד",
            repaymentMethod: "שפיצר",
            originalAmount: balance,
            remainingBalance: balance,
            monthlyPayment: monthly,
            startDate: nowYM,
            endDate: totalPayments > 0 ? addMonths(nowYM, totalPayments) : "",
            totalPayments,
          }],
        };
        changed = true;
      }
    } else {
      // Sync as loan
      const loanId = `onb_loan_${lib.lender}_${balance}`;
      if (!debt.loans.some(l => l.id === loanId)) {
        debt.loans.push({
          id: loanId,
          lender: lib.lender || lib.type || "לא צוין",
          startDate: nowYM,
          totalPayments: monthly > 0 ? Math.round(balance / monthly) : 12,
          monthlyPayment: monthly,
        });
        changed = true;
      }
    }
  }

  if (changed) {
    saveDebtData(debt);
  }
}

/* ── 2. Insurance → Risk Store ── */
function syncInsuranceToRiskStore(insurances: OnbInsurance[]): void {
  if (insurances.length === 0) return;

  const items = loadRiskItems();
  let changed = false;

  // Map onboarding insurance types to risk categories
  const TYPE_TO_CATEGORY: Record<string, string> = {
    "חיים": "death",
    "ביטוח חיים": "death",
    "בריאות": "health",
    "ביטוח בריאות": "health",
    "סיעוד": "nursing",
    "ביטוח סיעודי": "nursing",
    "אובדן כושר": "disability",
    "אובדן כושר עבודה": "disability",
    "מחלות קשות": "critical",
    "ביטוח מחלות קשות": "critical",
    "דירה": "property",
    "רכב": "property",
    "צד ג": "property",
  };

  for (const ins of insurances) {
    // Only sync rows explicitly confirmed as existing
    if (ins.has !== "כן") continue;

    const category = TYPE_TO_CATEGORY[ins.type];

    if (category) {
      // Standard type: find a matching risk item in this category and mark as covered
      const categoryItems = items.filter(i => i.category === category && i.status === "missing");
      if (categoryItems.length > 0) {
        const target = categoryItems[0];
        target.status = "covered";
        target.provider = ins.company || undefined;
        target.coverageAmount = parseFloat(ins.coverage) || undefined;
        target.monthlyCost = parseFloat(ins.premium) || undefined;
        if (ins.for) target.notes = `עבור: ${ins.for}`;
        changed = true;
      } else {
        // All existing items in category are already covered — add a new risk item for this row
        // (handles second life insurance for a spouse, etc.)
        const label = ins.for
          ? `${ins.type} — ${ins.for}`
          : `${ins.type}${ins.company ? ` (${ins.company})` : ""}`;
        const newItem: RiskItem = {
          id: `onb_ins_${ins.type}_${ins.for || ins.company || ins.coverage}_${items.length}`,
          category,
          label,
          description: ins.for ? `עבור ${ins.for}` : undefined,
          status: "covered",
          provider: ins.company || undefined,
          coverageAmount: parseFloat(ins.coverage) || undefined,
          monthlyCost: parseFloat(ins.premium) || undefined,
          sortOrder: items.length + 1,
        };
        items.push(newItem);
        changed = true;
      }
    } else if (ins.isCustom === "1") {
      // Custom type ("ביטוח אחר") with no category mapping — add as property catch-all
      const label = ins.for
        ? `${ins.type} — ${ins.for}`
        : `${ins.type}${ins.company ? ` (${ins.company})` : ""}`;
      const newItem: RiskItem = {
        id: `onb_ins_custom_${ins.type}_${ins.for || ins.company || ins.coverage}_${items.length}`,
        category: "property",
        label,
        description: ins.for ? `עבור ${ins.for}` : undefined,
        status: "covered",
        provider: ins.company || undefined,
        coverageAmount: parseFloat(ins.coverage) || undefined,
        monthlyCost: parseFloat(ins.premium) || undefined,
        sortOrder: items.length + 1,
      };
      items.push(newItem);
      changed = true;
    }
  }

  if (changed) {
    saveRiskItems(items);
  }
}

/* ── 2b. Legal-docs answers (will / prenup) → Risk Store ──
 *
 * Per Nir 2026-04-29: when the questionnaire reports that a will is missing
 * or out-of-date, that becomes a high-priority follow-up task on the risk-
 * management page. Same for the prenup. The answers come back as Hebrew
 * strings the user picked from a dropdown (see onboarding/page.tsx).
 *
 * Mapping rule:
 *   "קיימת ומעודכנת" / "קיים"      → covered
 *   "קיימת ולא מעודכנת"             → partial
 *   "לא קיימת" / "לא קיים"          → missing
 *   "לא רלוונטי"                     → not_relevant (prenup only — single user)
 *   anything else / blank            → leave the existing status untouched
 *
 * Idempotent — runs on every onboarding sync; only writes when status would
 * actually change. Notes are NEVER overwritten so the user's edits survive.
 */
function syncLegalDocsToRiskStore(fields: OnbField): void {
  const items = loadRiskItems();
  let changed = false;

  const mapAnswer = (answer: string): RiskItem["status"] | null => {
    if (!answer) return null;
    if (answer.includes("ומעודכנת") || answer === "קיים") return "covered";
    if (answer.includes("לא מעודכנת")) return "partial";
    if (answer.startsWith("לא קיימ")) return "missing";
    if (answer === "לא רלוונטי") return "not_relevant";
    return null;
  };

  const willStatus = mapAnswer(fields.will || "");
  const prenupStatus = mapAnswer(fields.prenup || "");

  // Find by label (the legal items aren't given fixed ids in DEFAULT_RISK_ITEMS).
  const willItem = items.find(i => i.category === "legal" && i.label === "צוואה");
  const prenupItem = items.find(i => i.category === "legal" && i.label === "הסכם ממון");

  if (willItem && willStatus && willItem.status !== willStatus) {
    willItem.status = willStatus;
    changed = true;
  }
  if (prenupItem && prenupStatus && prenupItem.status !== prenupStatus) {
    prenupItem.status = prenupStatus;
    changed = true;
  }

  if (changed) saveRiskItems(items);
}

/* ── 3. Pension fields → Pension Store ── */
function syncPensionToPensionStore(fields: OnbField): void {
  const funds = loadPensionFunds();
  let changed = false;

  // Check for pension product 1
  if (fields.pension_type_1 && fields.pension_balance_1) {
    const id = "onb_pension_1";
    if (!funds.some(f => f.id === id)) {
      const typeMap: Record<string, PensionFund["type"]> = {
        "פנסיה": "pension",
        "קרן פנסיה": "pension",
        "ביטוח מנהלים": "bituach",
        "גמל": "gemel",
        "השתלמות": "hishtalmut",
      };

      const empContrib = parseFloat(fields.pension_monthly_emp_1 || "0");
      const erContrib = parseFloat(fields.pension_monthly_er_1 || "0");
      funds.push({
        id,
        company: fields.pension_company_1 || "לא צוין",
        type: typeMap[fields.pension_type_1] || "pension",
        balance: parseFloat(fields.pension_balance_1) || 0,
        mgmtFeeDeposit: 0,
        mgmtFeeBalance: 0,
        monthlyContrib: empContrib + erContrib,
        track: "כללי",
      });
      changed = true;
    }
  }

  // Check for pension product 2
  if (fields.pension_type_2 && fields.pension_balance_2) {
    const id = "onb_pension_2";
    if (!funds.some(f => f.id === id)) {
      const typeMap: Record<string, PensionFund["type"]> = {
        "פנסיה": "pension",
        "קרן פנסיה": "pension",
        "ביטוח מנהלים": "bituach",
        "גמל": "gemel",
        "השתלמות": "hishtalmut",
      };

      const empContrib2 = parseFloat(fields.pension_monthly_emp_2 || "0");
      const erContrib2 = parseFloat(fields.pension_monthly_er_2 || "0");
      funds.push({
        id,
        company: fields.pension_company_2 || "לא צוין",
        type: typeMap[fields.pension_type_2] || "pension",
        balance: parseFloat(fields.pension_balance_2) || 0,
        mgmtFeeDeposit: 0,
        mgmtFeeBalance: 0,
        monthlyContrib: empContrib2 + erContrib2,
        track: "כללי",
      });
      changed = true;
    }
  }

  if (changed) {
    savePensionFunds(funds);
    window.dispatchEvent(new Event(PENSION_EVENT));
  }
}

/* ── 4. Income/Expenses → Assumptions ──
 *
 * One-shot seed. The questionnaire has no single "total income / total
 * expenses" field anymore — we sum the 6 income lines (inc_*) and the
 * 12 expense lines (exp_*). Once seeded, the budget page owns these
 * values (total income line = sum of budget income rows, expenses = sum
 * of budget categories). The questionnaire stops overwriting.
 */
function syncFieldsToAssumptions(fields: OnbField): void {
  if (localStorage.getItem(scopedKey(ASSUMPTIONS_SEEDED))) {
    // Age can still move (if the user updates their birthday/age in the
    // questionnaire), but income/expenses are frozen.
    const age = parseInt(fields.age || "0");
    if (age > 0) {
      const a = loadAssumptions();
      if (age !== a.currentAge) { a.currentAge = age; saveAssumptions(a); }
    }
    return;
  }

  const n = (k: string): number => parseFloat(fields[k] || "0") || 0;
  // Income source (new model): dynamic list at verdant:onboarding:incomes.
  // Legacy fallback: sum the old fixed inc_* fields (pre-migration data).
  let income = 0;
  try {
    const rawIncomes = localStorage.getItem(scopedKey(ONB_INCOMES));
    if (rawIncomes) {
      const list = JSON.parse(rawIncomes) as Array<{ value?: string }>;
      if (Array.isArray(list)) {
        income = list.reduce((s, r) => s + (parseFloat(r.value || "0") || 0), 0);
      }
    }
  } catch {}
  if (income === 0) {
    income =
      n("inc_salary1") + n("inc_salary2") + n("inc_rental") +
      n("inc_pension") + n("inc_parents") + n("inc_other");
  }
  const expenses =
    n("exp_housing") + n("exp_property_tax") + n("exp_utilities") + n("exp_telecom") +
    n("exp_education") + n("exp_insurance") + n("exp_food") + n("exp_car") +
    n("exp_leisure") + n("exp_health") + n("exp_vacation") + n("exp_other");
  const age = parseInt(fields.age || "0");

  if (income === 0 && expenses === 0 && age === 0) return;

  const assumptions = loadAssumptions();
  let changed = false;

  if (income > 0 && income !== assumptions.monthlyIncome) {
    assumptions.monthlyIncome = income;
    changed = true;
  }
  if (expenses > 0 && expenses !== assumptions.monthlyExpenses) {
    assumptions.monthlyExpenses = expenses;
    changed = true;
  }
  if (age > 0 && age !== assumptions.currentAge) {
    assumptions.currentAge = age;
    changed = true;
  }
  if (income > 0 && expenses > 0) {
    const investment = income - expenses;
    if (investment > 0 && investment !== assumptions.monthlyInvestment) {
      assumptions.monthlyInvestment = investment;
      changed = true;
    }
  }

  // 2026-04-29: map the onboarding pension_risk dropdown → riskTolerance.
  // Five-step UI compresses to three buckets used everywhere else.
  const PENSION_RISK_TO_TOLERANCE: Record<string, "conservative" | "moderate" | "aggressive"> = {
    "שמרני מאוד": "conservative",
    "שמרני":      "conservative",
    "מאוזן":      "moderate",
    "צמיחה":      "aggressive",
    "אגרסיבי":    "aggressive",
  };
  const newTolerance = PENSION_RISK_TO_TOLERANCE[fields.pension_risk?.trim() || ""];
  if (newTolerance && newTolerance !== assumptions.riskTolerance) {
    assumptions.riskTolerance = newTolerance;
    changed = true;
  }

  if (changed) {
    saveAssumptions(assumptions);
  }
  // Mark one-shot seed done (even if nothing changed — we ran the pass).
  localStorage.setItem(scopedKey(ASSUMPTIONS_SEEDED), new Date().toISOString());
}

/* ── 5b. Children → auto-generated life-event buckets ──
 * Reads the same ONB_CHILDREN list as syncChildrenToKidsSavings but
 * routes to /goals (buckets) instead of the savings store. Per Nir
 * 2026-04-29: bar/bat mitzvah + army release should appear automatically
 * the moment a DOB is entered. */
function syncChildLifeEventsFromOnb(): void {
  const ONB_CHILDREN_KEY = "verdant:onboarding:children";
  const children = readJSON<Array<{ name?: string; dob?: string; gender?: "male" | "female" }>>(ONB_CHILDREN_KEY, []);
  syncChildLifeEvents(children);
}

/* ── 5. Children → Kids Savings Store ── */
function syncChildrenToKidsSavings(): void {
  const ONB_CHILDREN = "verdant:onboarding:children";
  interface OnbChild {
    name: string;
    dob: string;
    age: string;
    framework: string;
    special: string;
    savings_provider?: string;
    savings_track?: string;
    savings_balance?: string;
    savings_parent_deposit?: string;
  }
  const children: OnbChild[] = readJSON(ONB_CHILDREN, []);
  if (children.length === 0) return;

  const existing = loadKidsSavings();
  let changed = false;

  for (const child of children) {
    if (!child.name && !child.dob) continue;
    const childName = child.name || `ילד/ה`;

    // Need DOB — if only age, estimate from current date
    let dob = child.dob;
    if (!dob && child.age) {
      const ageNum = parseInt(child.age);
      if (ageNum >= 0) {
        const birthYear = new Date().getFullYear() - ageNum;
        dob = `${birthYear}-01-01`;
      }
    }
    if (!dob) continue;

    // Read savings fields from onboarding
    const provider = child.savings_provider || "";
    const track = child.savings_track || "medium";
    const currentBalance = parseFloat(child.savings_balance || "0") || 0;
    const parentDeposit = parseFloat(child.savings_parent_deposit || String(DEFAULT_MONTHLY - GOV_MONTHLY_DEPOSIT)) || 0;
    const monthlyDeposit = GOV_MONTHLY_DEPOSIT + parentDeposit;

    // Check if child already exists (by name match) — update if so
    const existingIdx = existing.findIndex(k => k.childName === childName);
    if (existingIdx >= 0) {
      // Update existing entry with latest onboarding data
      const ex = existing[existingIdx];
      if (provider && provider !== ex.provider) { ex.provider = provider; changed = true; }
      if (track !== ex.track) { ex.track = track; changed = true; }
      if (currentBalance > 0 && currentBalance !== ex.currentBalance) { ex.currentBalance = currentBalance; changed = true; }
      if (parentDeposit !== ex.parentDeposit) { ex.parentDeposit = parentDeposit; ex.monthlyDeposit = monthlyDeposit; changed = true; }
      if (dob !== ex.dob) { ex.dob = dob; changed = true; }
      continue;
    }

    existing.push({
      id: kidSavingsId(),
      childName,
      dob,
      provider,
      track,
      currentBalance,
      monthlyDeposit,
      parentDeposit,
    });
    changed = true;
  }

  if (changed) {
    saveKidsSavings(existing);
  }
}

/* ── 6. Real-estate assets → Property Store ── */
function syncRealEstateToPropertyStore(assets: OnbAsset[]): void {
  // Filter ONLY explicit real-estate types — must start with "נדל" to avoid
  // false positives like "קופת גמל להשקעה" which contains "השקעה" but is NOT real estate.
  const RE_TYPES = new Set(["נדל\"ן למגורים", "נדל\"ן להשקעה"]);
  const reAssets = assets.filter(a => RE_TYPES.has(a.type) || a.type.startsWith("נדל"));
  if (reAssets.length === 0) return;

  const existing = loadProperties();
  let changed = false;

  for (const a of reAssets) {
    const value = parseFloat(a.value) || 0;
    if (value === 0 && !a.desc) continue;

    const isInvestment = a.type === "נדל\"ן להשקעה";
    const rent = parseFloat(a.rent || "0") || 0;
    const rentExp = parseFloat(a.rentExpenses || "0") || 0;

    const propId = `onb_prop_${a.type}_${a.desc || ""}`;
    // Match by id first, then by (name + type) to capture rows that came
    // from the older `prop_<timestamp>_<i>` migration before IDs were
    // unified. Without this fallback, updating rent in the questionnaire
    // silently creates a duplicate property.
    const desiredType = a.type === "נדל\"ן להשקעה" ? "investment" : "residence";
    const existingProp = existing.find(p =>
      p.id === propId ||
      (p.name === (a.desc || a.type) && p.type === desiredType)
    );

    if (existingProp) {
      // Update rent fields on each sync — the questionnaire is the fastest
      // way for the client to update rental cashflow. /realestate still wins
      // if the user filled it there (non-empty wins), but empty→value flows.
      let propChanged = false;
      if (isInvestment && rent > 0 && existingProp.monthlyRent !== rent) {
        existingProp.monthlyRent = rent;
        propChanged = true;
      }
      if (isInvestment && rentExp > 0 && existingProp.monthlyExpenses !== rentExp) {
        existingProp.monthlyExpenses = rentExp;
        propChanged = true;
      }
      if (propChanged) changed = true;
      continue;
    }

    // Investment real-estate: exact match "נדל"ן להשקעה" only — NOT substring "השקעה"
    existing.push({
      id: propId,
      name: a.desc || a.type,
      type: isInvestment ? "investment" : "residence",
      purchasePrice: value,
      currentValue: value,
      annualAppreciation: 0.03,
      annualRentGrowth: 0.03,
      holdingYears: 10,
      // Only carry rental fields for investment properties — residence stays undefined
      // so the passive-income aggregator knows not to treat it as a cashflow source.
      ...(isInvestment && rent > 0 ? { monthlyRent: rent } : {}),
      ...(isInvestment && rentExp > 0 ? { monthlyExpenses: rentExp } : {}),
    });
    changed = true;
  }

  if (changed) {
    saveProperties(existing);
  }
}

/* ── 7. Gemel / Hishtalmut assets from assets list → Pension Store ── */
function syncGemelAssetsToPrensionStore(assets: OnbAsset[]): void {
  // "קופת גמל להשקעה" maps to type "gemel" with a hint it's for investment
  // (not the tax-advantaged retirement gemel — PensionFund.type doesn't distinguish)
  const PENSION_ASSET_TYPES: Record<string, PensionFund["type"]> = {
    "קופת גמל":         "gemel",
    "קופת גמל להשקעה":  "gemel",
    "קרן השתלמות":      "hishtalmut",
  };

  const pensionAssets = assets.filter(a => PENSION_ASSET_TYPES[a.type]);
  if (pensionAssets.length === 0) return;

  const funds = loadPensionFunds();
  let changed = false;

  for (const a of pensionAssets) {
    const value = parseFloat(a.value) || 0;
    if (value === 0 && !a.desc) continue;

    const fundId = `onb_asset_${a.type}_${a.desc || ""}`;
    if (funds.some(f => f.id === fundId)) continue;

    funds.push({
      id: fundId,
      company: a.desc || "לא צוין",
      type: PENSION_ASSET_TYPES[a.type],
      balance: value,
      mgmtFeeDeposit: 0,
      mgmtFeeBalance: 0,
      monthlyContrib: 0,
      track: "כללי",
    });
    changed = true;
  }

  if (changed) {
    savePensionFunds(funds);
    window.dispatchEvent(new Event(PENSION_EVENT));
  }
}

/* ── Check if sync ever ran ── */
export function wasOnboardingSynced(): boolean {
  return !!localStorage.getItem(scopedKey(ONB_SYNCED_AT));
}
