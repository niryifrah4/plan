"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { fmtILS } from "@/lib/format";
import { savingsRate as calcSavingsRate } from "@/lib/financial-math";
import { loadDebtData, getDebtSummary, type DebtData } from "@/lib/debt-store";
import { getPassiveIncomeSummary } from "@/lib/passive-income";
import {
  loadSalaryProfile,
  computeSalaryBreakdown,
  hasSavedSalaryProfile,
  SALARY_PROFILE_EVENT,
} from "@/lib/salary-engine";
import {
  loadParsedTransactions,
  filterByMonth,
  importTransactionsIntoBudget,
  type ImportSummary,
} from "@/lib/budget-import";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";

const BudgetChart = dynamic(() => import("./BudgetChart"), { ssr: false });
const BudgetPie = dynamic(() => import("./BudgetPie"), { ssr: false });
const MonthlyInsights = dynamic(() => import("./MonthlyInsights"), { ssr: false });
const CashflowForecast = dynamic(
  () => import("@/components/budget/CashflowForecast").then((m) => m.CashflowForecast),
  { ssr: false }
);

import type { BudgetAdjustment } from "./MonthlyInsights";
import { scopedKey } from "@/lib/client-scope";
import { type Scope, SCOPE_LABELS, SCOPE_COLORS, effectiveScope } from "@/lib/scope-types";
import {
  isBusinessScopeEnabled,
  setBusinessScopeOverride,
  BUSINESS_SCOPE_EVENT,
} from "@/lib/business-scope";

/* ═══════════════════════════════════════════════════════════
   Types & Constants
   ═══════════════════════════════════════════════════════════ */

interface SubItem {
  id: string;
  name: string;
  budget: number;
  actual: number;
  avg3: number;
  notes?: string;
}

interface BudgetRow {
  id: string;
  name: string;
  budget: number;
  actual: number;
  avg3: number;
  subItems?: SubItem[];
  /** Locked rows are read-only — synced from another store (debt / assets). */
  locked?: boolean;
  /** Origin of a locked row. Undefined = manual user entry. */
  source?: "debt" | "passive" | "salary" | "onboarding";
  notes?: string;
  /** Business / personal / mixed tag. Undefined = personal. */
  scope?: Scope;
}

interface BudgetData {
  year: number;
  month: number;
  sections: Record<string, BudgetRow[]>;
  settled: boolean;
}

type SectionKey = "income" | "fixed" | "variable" | "business";

const SECTION_META: Record<
  SectionKey,
  { label: string; icon: string; type: "income" | "expense" }
> = {
  income: { label: "הכנסות", icon: "payments", type: "income" },
  fixed: { label: "הוצאות קבועות", icon: "lock", type: "expense" },
  variable: { label: "הוצאות משתנות", icon: "shuffle", type: "expense" },
  business: { label: "הוצאות עסקיות", icon: "business_center", type: "expense" },
};

const SECTION_ORDER: SectionKey[] = ["income", "fixed", "variable", "business"];

/** Default business expense rows for self-employed clients. */
const DEFAULT_BUSINESS_ROWS: string[] = [
  "משכורות",
  "מע״מ",
  "מקדמות מס הכנסה",
  "מקדמות ביטוח לאומי",
  "שכירות",
  "חשמל",
  "ארנונה",
  "רואה חשבון",
  "ביטוחים",
  "טלפון ואינטרנט",
  "הוצאות משרד",
  "פרסום",
  "שיווק",
  "אנשי מכירות",
  "ציוד וסחורות",
  "עו״ד",
  "הוצאות דלק",
  "כיבוד",
  "אגרות שונות",
  "חומרי גלם",
  "הכשרות מקצועיות",
  "עמלות בנקים",
  "עמלות סליקה",
  "עמלות שת״פ",
  "עמלות כרטיסי אשראי",
  "ריבית על הלוואה",
  "שירותים נוספים",
];
const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const uid = () => "r" + Math.random().toString(36).slice(2, 9);

/* Drilldown categories — parent rows that expand into sub-items.
 * Each parent auto-sums its children's budget + actual.
 * When a row name matches (by substring), sub-items are seeded on first use. */
const DRILLDOWN_DEFAULTS: Record<string, string[]> = {
  // ── Fixed groups ───────────────────────────────────────
  דיור: ["משכנתא / שכירות", "ועד בית", "ארנונה", "חשמל", "מים", "גז"],
  מנויים: ["אינטרנט + טלוויזיה", "סלולר", "סטרימינג", "חדר כושר", "אפליקציות", "עיתונות"],
  ביטוחים: ["ביטוח בריאות", "ביטוח חיים", "ביטוח רכב", "ביטוח דירה"],
  "גן / חינוך": ["גן", "צהרון", "חוגים"],
  "חסכונות והשקעות": ["העברה לחיסכון", "קרן השתלמות", "פנסיה פרטית"],
  // ── Variable groups ────────────────────────────────────
  רכב: ["דלק", "תחבורה ציבורית", "חניה ואגרות", "תחזוקת רכב"],
  "פנאי ובילוי": ["מסעדות", "בילויים ויציאות", "קפה ומאפיות"],
  תחביבים: ["תרבות", "ספרים", "סדנאות"],
  בריאות: ["תרופות", "רופאים פרטיים", "טיפולים"],
  טיפוח: ["ביגוד", "נעליים", "קוסמטיקה", "מספרה"],
  "עזרה בבית": ["עוזרת / ניקיון", "בייביסיטר", "שיעורים פרטיים"],
  "מתנות ותרומות": ["מתנות", "תרומות"],
};

function getDrilldownKey(name: string): string | null {
  for (const k of Object.keys(DRILLDOWN_DEFAULTS)) {
    if (name.includes(k) || k.includes(name)) return k;
  }
  return null;
}

function defaultSubItems(categoryName: string): SubItem[] {
  const key = getDrilldownKey(categoryName);
  if (!key) return [];
  return DRILLDOWN_DEFAULTS[key].map((name) => ({
    id: uid(),
    name,
    budget: 0,
    actual: 0,
    avg3: 0,
  }));
}

/* Check if any sub-item has overspend */
function hasSubOverspend(row: BudgetRow): boolean {
  if (!row.subItems || row.subItems.length === 0) return false;
  return row.subItems.some((s) => (Number(s.actual) || 0) > (Number(s.budget) || 0));
}

/* ═══════════════════════════════════════════════════════════
   Canonical category lists — Finav-inspired taxonomy.
   Single source of truth for DEFAULT_SECTIONS + migrateBudget backfill.
   ═══════════════════════════════════════════════════════════ */

/** Personal income sources. */
// 2026-05-05 per Nir: משק בית מנוהל על נטו. השורות של ההכנסות מגיעות
// אוטומטית — מהאונבורדינג (שכר בני הזוג, קצבאות) או מהמשך-עבודה (שכר דירה
// מנכסים, ריבית מהפקדות). הסרנו את הplaceholders של 'משכורת נטו 1/2' שיצרו
// כפילות לא-ברורה מול שורות האונבורדינג שכבר נושאות את הערכים האמיתיים.
const EXPECTED_INCOME_ROWS: string[] = [
  "עצמאי / פרילנס",
  "שכר דירה",
  "קצבאות וזיכויים",
  "הכנסה נוספת",
];

/** Fixed monthly obligations — recurring at similar amount each month.
 * Grouped parents (see DRILLDOWN_DEFAULTS) expand into sub-items automatically. */
const EXPECTED_FIXED_ROWS: string[] = [
  "דיור", // drilldown: משכנתא/שכירות, ועד, ארנונה, חשמל, מים, גז
  "מנויים", // drilldown: אינטרנט+טלוויזיה, סלולר, סטרימינג, כושר...
  "ביטוחים", // drilldown: בריאות, חיים, רכב, דירה
  "גן / חינוך", // drilldown: גן, צהרון, חוגים
  "תחבורה (ליסינג / מנוי)",
  "חסכונות והשקעות", // drilldown: העברה לחיסכון, קרן השתלמות, פנסיה פרטית
  "החזר הלוואות", // auto-injected from debt store (locked)
  "עסקאות תשלומים", // credit-card installments, furniture payments, etc.
];

/** Variable day-to-day spending — merged & grouped for simplicity. */
const EXPECTED_VARIABLE_ROWS: string[] = [
  "סופר / מזון",
  "רכב", // drilldown: דלק, תחב״צ, חניה, תחזוקה
  "פנאי ובילוי", // drilldown: מסעדות, בילויים, קפה
  "תחביבים", // drilldown: תרבות, ספרים, סדנאות
  "בריאות", // drilldown: תרופות, רופאים פרטיים, טיפולים
  "טיפוח", // drilldown: ביגוד, נעליים, קוסמטיקה, מספרה
  "עזרה בבית", // drilldown: עוזרת, בייביסיטר, שיעורים פרטיים
  "חופשות וטיולים",
  "חיות מחמד",
  "מתנות ותרומות", // drilldown: מתנות, תרומות
  "תחזוקת בית",
  "שונות",
];

/** Legacy row names that were split across the old flat taxonomy.
 * On migration, these are removed IF empty (budget=0 AND actual=0 AND no sub-items)
 * to prevent duplication with the new grouped parents. Non-empty legacy rows stay
 * untouched so the user never loses data. */
const LEGACY_FLAT_ROWS: string[] = [
  // Fixed — now inside "דיור"
  "משכנתא / שכירות",
  "ועד בית",
  "ארנונה",
  "חשמל",
  "מים",
  "גז",
  // Fixed — now inside "מנויים"
  "אינטרנט + טלוויזיה",
  "סלולר",
  // Fixed — now inside "חסכונות והשקעות"
  "חיסכון חודשי",
  "קרן השתלמות",
  "פנסיה פרטית / ביטוח מנהלים",
  // Variable — now inside "רכב"
  "דלק",
  "תחבורה ציבורית",
  "חניה ואגרות",
  "תחזוקת רכב",
  // Variable — merged into "פנאי ובילוי"
  "מסעדות",
  // Variable — merged into "תחביבים"
  "תרבות וספרים",
  // Variable — merged into "בריאות"
  "תרופות",
  "בריאות ורופאים פרטיים",
  // Variable — merged into "טיפוח"
  "ביגוד",
  "נעליים",
  "קוסמטיקה וטיפוח",
  "מספרה",
  // Variable — merged into "עזרה בבית"
  "שיעורים פרטיים וחוגים",
  // Variable — merged into "מתנות ותרומות"
  "מתנות",
  "תרומות",
];

function makeRow(name: string): BudgetRow {
  return {
    id: uid(),
    name,
    budget: 0,
    actual: 0,
    avg3: 0,
    ...(getDrilldownKey(name) ? { subItems: defaultSubItems(name) } : {}),
  };
}

const DEFAULT_SECTIONS: Record<string, BudgetRow[]> = {
  income: EXPECTED_INCOME_ROWS.map(makeRow),
  fixed: EXPECTED_FIXED_ROWS.map(makeRow),
  variable: EXPECTED_VARIABLE_ROWS.map(makeRow),
  business: DEFAULT_BUSINESS_ROWS.map((name) => ({
    id: uid(),
    name,
    budget: 0,
    actual: 0,
    avg3: 0,
    scope: "business" as Scope,
  })),
};

/* ═══════════════════════════════════════════════════════════
   localStorage helpers
   ═══════════════════════════════════════════════════════════ */

function budgetKey(year: number, month: number) {
  return `verdant:budget_${year}_${String(month + 1).padStart(2, "0")}`;
}

function migrateBudget(data: BudgetData): BudgetData {
  // 1. Prune empty legacy flat rows — they're replaced by grouped parents.
  //    Non-empty legacy rows (budget>0 OR actual>0 OR subItems populated)
  //    stay so the user never loses entered data.
  const isEmpty = (r: BudgetRow): boolean => {
    const hasSub = r.subItems?.some((s) => (s.budget || 0) + (s.actual || 0) > 0);
    return (r.budget || 0) === 0 && (r.actual || 0) === 0 && !hasSub && !r.locked;
  };
  for (const key of Object.keys(data.sections)) {
    data.sections[key] = data.sections[key].filter(
      (r) => !(LEGACY_FLAT_ROWS.includes(r.name) && isEmpty(r))
    );
  }

  // 2. Add subItems to drilldown categories that were saved without them
  for (const key of Object.keys(data.sections)) {
    data.sections[key] = data.sections[key].map((row) => {
      if (!row.subItems && getDrilldownKey(row.name)) {
        return { ...row, subItems: defaultSubItems(row.name) };
      }
      return row;
    });
  }
  // Migrate old "debt" section into "fixed" if present
  if (data.sections.debt && data.sections.debt.length > 0) {
    const fixedRows = data.sections.fixed || [];
    data.sections.fixed = [...fixedRows, ...data.sections.debt];
    delete data.sections.debt;
  }
  // Generic backfill: make sure every canonical row from the expected lists
  // exists in each section. Old rows stay where the user put them (avoid reorder).
  const backfillSection = (key: "income" | "fixed" | "variable", expected: string[]) => {
    const existing = data.sections[key] || [];
    const missing: BudgetRow[] = [];
    for (const name of expected) {
      if (!existing.some((r) => r.name === name)) missing.push(makeRow(name));
    }
    if (missing.length > 0) data.sections[key] = [...existing, ...missing];
  };
  backfillSection("income", EXPECTED_INCOME_ROWS);
  backfillSection("fixed", EXPECTED_FIXED_ROWS);
  backfillSection("variable", EXPECTED_VARIABLE_ROWS);
  // Backfill: ensure business section exists
  if (!data.sections.business || data.sections.business.length === 0) {
    data.sections.business = DEFAULT_BUSINESS_ROWS.map((name) => ({
      id: uid(),
      name,
      budget: 0,
      actual: 0,
      avg3: 0,
      scope: "business" as Scope,
    }));
  }
  return data;
}

function loadBudget(year: number, month: number): BudgetData | null {
  try {
    const raw = localStorage.getItem(scopedKey(budgetKey(year, month)));
    if (raw) return migrateBudget(JSON.parse(raw));
  } catch {}
  return null;
}

function saveBudget(data: BudgetData) {
  try {
    localStorage.setItem(scopedKey(budgetKey(data.year, data.month)), JSON.stringify(data));
  } catch (e) {
    console.warn("[Budget] save failed:", e);
  }
}

/* ═══════════════════════════════════════════════════════════
   Carry Forward — copy previous month's structure, reset actuals
   ═══════════════════════════════════════════════════════════ */

function carryForward(prevBudget: BudgetData, year: number, month: number): BudgetData {
  const sections: Record<string, BudgetRow[]> = {};
  for (const [key, rows] of Object.entries(prevBudget.sections)) {
    // Skip old debt section if still present
    if (key === "debt") continue;
    sections[key] = rows
      .filter((r) => !r.locked) // Don't carry locked debt rows — they'll be re-injected
      .map((r) => {
        // 2026-04-28 per Nir: previous month's ACTUAL becomes the new budget.
        // The reasoning: the user's real-world spend is more accurate than
        // the original (often optimistic) plan. Falls back to the old plan
        // when there was no actual (newly added rows mid-month).
        const newBudget = r.actual > 0 ? Math.round(r.actual) : r.budget;
        return {
          ...r,
          id: uid(),
          budget: newBudget,
          actual: 0,
          avg3: r.avg3,
          subItems: r.subItems?.map((s) => ({
            ...s,
            id: uid(),
            budget: s.actual > 0 ? Math.round(s.actual) : s.budget,
            actual: 0,
          })),
        };
      });
  }
  return { year, month, sections, settled: false };
}

/* ═══════════════════════════════════════════════════════════
   Inject locked debt rows into the "fixed" section
   ═══════════════════════════════════════════════════════════ */

function injectDebtRows(budget: BudgetData): BudgetData {
  const debt = loadDebtData();
  const summary = getDebtSummary(debt);

  // Remove any existing LOCKED rows (mortgage tracks). Unlocked "החזר הלוואות" stays.
  const fixedClean = (budget.sections.fixed || []).filter((r) => !r.locked);

  const lockedRows: BudgetRow[] = [];

  // Mortgage tracks remain locked (per-track planning is legitimate)
  if (summary.mortgageTracks.length > 0) {
    for (const track of summary.mortgageTracks) {
      if (track.monthlyPayment > 0) {
        lockedRows.push({
          id: uid(),
          name: `משכנתא — ${track.name || "מסלול"}`,
          budget: track.monthlyPayment,
          actual: track.monthlyPayment,
          avg3: 0,
          // 2026-05-05 per Nir: rows are editable. Auto-injection still
      // refreshes them from source data on each mount.
          source: "debt",
        });
      }
    }
  } else if (summary.mortgageMonthly > 0) {
    lockedRows.push({
      id: uid(),
      name: "משכנתא",
      budget: summary.mortgageMonthly,
      actual: summary.mortgageMonthly,
      avg3: 0,
      // 2026-05-05 per Nir: rows are editable. Auto-injection still
      // refreshes them from source data on each mount.
    });
  }

  // Aggregate all loans + installments into one editable "החזר הלוואות" row.
  // 2026-05-05 per Nir: build sub-items so each loan / installment shows as
  // its own line under the parent row. The user can expand the row in /budget
  // and see exactly which lender / merchant is consuming each shekel.
  const loansMonthly = summary.activeLoans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  const installmentsMonthly = summary.installmentsMonthly || 0;
  const totalLoansMonthly = loansMonthly + installmentsMonthly;

  const loanSubItems = [
    ...summary.activeLoans.map((loan) => ({
      id: uid(),
      name: loan.lender || "הלוואה",
      budget: loan.monthlyPayment || 0,
      actual: loan.monthlyPayment || 0,
      avg3: loan.monthlyPayment || 0,
    })),
    ...summary.activeInstallments.map((inst) => ({
      id: uid(),
      name: inst.merchant ? `${inst.merchant} (תשלומים)` : "עסקת תשלומים",
      budget: inst.monthlyAmount || 0,
      actual: inst.monthlyAmount || 0,
      avg3: inst.monthlyAmount || 0,
    })),
  ];

  const loanRowIdx = fixedClean.findIndex((r) => r.name === "החזר הלוואות");
  if (loanRowIdx >= 0) {
    // Update actual to reflect real repayment; only overwrite budget if user hasn't set one
    const existing = fixedClean[loanRowIdx];
    fixedClean[loanRowIdx] = {
      ...existing,
      actual: totalLoansMonthly,
      budget: existing.budget > 0 ? existing.budget : totalLoansMonthly,
      subItems: loanSubItems.length > 0 ? loanSubItems : existing.subItems,
    };
  } else if (totalLoansMonthly > 0) {
    // Safety net: if somehow the row is missing, add it
    fixedClean.push({
      id: uid(),
      name: "החזר הלוואות",
      budget: totalLoansMonthly,
      actual: totalLoansMonthly,
      avg3: 0,
      subItems: loanSubItems,
    });
  }

  // If there's a "משכנתא / שכירות" row with budget=0 and we have mortgage locked rows, remove it to avoid duplication
  const hasMortgageLocked = lockedRows.some((r) => r.name.startsWith("משכנתא"));
  const finalFixed = hasMortgageLocked
    ? fixedClean.filter(
        (r) =>
          !(r.name.includes("משכנתא") && (Number(r.budget) || 0) === 0 && r.name !== "החזר הלוואות")
      )
    : fixedClean;

  return {
    ...budget,
    sections: {
      ...budget.sections,
      fixed: [...finalFixed, ...lockedRows],
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   Inject passive-income rows (rental / dividends) into INCOME
   ═══════════════════════════════════════════════════════════ */

function injectPassiveIncomeRows(budget: BudgetData): BudgetData {
  const summary = getPassiveIncomeSummary();

  // Strip any previously-injected passive rows; keep manual income entries.
  const incomeClean = (budget.sections.income || []).filter((r) => r.source !== "passive");

  const passiveRows: BudgetRow[] = summary.sources.map((src) => ({
    id: uid(),
    name: src.label,
    budget: src.monthly,
    actual: src.monthly,
    avg3: src.monthly,
    locked: true,
    source: "passive",
  }));

  return {
    ...budget,
    sections: {
      ...budget.sections,
      income: [...incomeClean, ...passiveRows],
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   Inject onboarding-questionnaire incomes (allowances, other)
   ═══════════════════════════════════════════════════════════
   The onboarding step 2 lets the client list extra income streams
   (קצבאות, עזרה מההורים, הרצאות וכו'). Salary and rental are already
   covered by dedicated sources — so we SKIP those labels here to avoid
   double-counting, and inject the rest as locked rows the client can't
   accidentally edit in the budget table. */

const ONB_INCOMES_KEY = "verdant:onboarding:incomes";

/** Labels that are covered by other auto-injections → skip. */
const ONB_SKIP_LABEL_PATTERNS = [
  /שכר\s*ב?ן?\/?ב?ת?\s*זוג/, // "שכר בן/בת זוג 1/2 (נטו)"  — comes from salary profile
  /^\s*שכר\s*\(/, // plain "שכר (נטו)"
  /^משכורת/, // "משכורת נטו"
  /שכ[״""]?ד/, // "שכ״ד" / שכ"ד — comes from realestate passive injection
  /שכר\s+דירה/, // "שכר דירה"
  /נכסים\s+מניבים/, // "הכנסה מנכסים מניבים" — comes from realestate
];

function injectOnboardingIncomeRows(budget: BudgetData): BudgetData {
  if (typeof window === "undefined") return budget;

  // Strip previously-injected onboarding rows AND empty legacy salary
  // placeholders ("משכורת נטו" / "משכורת נטו 2" with value=0). The latter
  // were default rows in older budgets that now duplicate the onboarding-
  // injected rows — confusing users into thinking their entries didn't sync.
  // 2026-05-05: also strip empty stale salary-engine rows when the user
  // has no salary profile (so we don't carry forward dead placeholders).
  const isEmptySalaryPlaceholder = (r: BudgetRow) =>
    (r.budget || 0) === 0 &&
    (r.actual || 0) === 0 &&
    (r.avg3 || 0) === 0 &&
    !r.subItems?.length &&
    /^משכורת\s*נטו(\s*\d*)?$/.test(r.name.trim());

  const incomeClean = (budget.sections.income || []).filter(
    (r) => r.source !== "onboarding" && !isEmptySalaryPlaceholder(r)
  );

  let list: Array<{ label?: string; value?: string }> = [];
  try {
    const raw =
      localStorage.getItem(scopedKey(ONB_INCOMES_KEY)) || localStorage.getItem(ONB_INCOMES_KEY);
    if (raw) list = JSON.parse(raw);
  } catch {
    /* ignore corrupt JSON */
  }

  if (!Array.isArray(list) || list.length === 0) {
    return { ...budget, sections: { ...budget.sections, income: incomeClean } };
  }

  // 2026-04-29 fix: only skip salary labels if the salary profile WILL inject
  // them via injectSalaryRow. Otherwise the user's net-salary entry just falls
  // off the budget. Same for rent: if no real-estate property has rent set,
  // keep the onboarding line.
  const salaryWillBeInjected = hasSavedSalaryProfile();
  const rentWillBeInjected = (() => {
    try {
      const props = JSON.parse(localStorage.getItem(scopedKey("verdant:properties")) || "[]");
      return Array.isArray(props) && props.some((p: any) => (p.monthlyRent || 0) > 0);
    } catch {
      return false;
    }
  })();

  const SALARY_RX = [/^משכורת/, /^\s*שכר\s*\(/, /שכר\s*ב?ן?\/?ב?ת?\s*זוג/];
  const RENT_RX = [/שכ[״""]?ד/, /שכר\s+דירה/, /נכסים\s+מניבים/];

  const rows: BudgetRow[] = [];
  for (const item of list) {
    const label = (item?.label || "").trim();
    const amount = Number(item?.value) || 0;
    if (!label || amount <= 0) continue;

    const isSalaryLabel = SALARY_RX.some((rx) => rx.test(label));
    const isRentLabel = RENT_RX.some((rx) => rx.test(label));

    if (isSalaryLabel && salaryWillBeInjected) continue; // covered by injectSalaryRow
    if (isRentLabel && rentWillBeInjected) continue; // covered by injectPassiveIncomeRows

    rows.push({
      id: uid(),
      name: label,
      budget: amount,
      actual: amount,
      avg3: amount,
      // 2026-05-05 per Nir: rows are editable. Auto-injection still
      // refreshes them from source data on each mount.
      source: "onboarding",
    });
  }

  return {
    ...budget,
    sections: {
      ...budget.sections,
      income: [...incomeClean, ...rows],
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   Inject salary (gross→net) into INCOME as a locked row
   ═══════════════════════════════════════════════════════════ */

function injectSalaryRow(budget: BudgetData): BudgetData {
  // Strip any previously-injected salary rows; keep manual income entries.
  const incomeClean = (budget.sections.income || []).filter((r) => r.source !== "salary");

  if (!hasSavedSalaryProfile()) {
    return { ...budget, sections: { ...budget.sections, income: incomeClean } };
  }

  const breakdown = computeSalaryBreakdown(loadSalaryProfile());
  const net = Math.round(breakdown.netMonthly);
  if (net <= 0) {
    return { ...budget, sections: { ...budget.sections, income: incomeClean } };
  }

  const salaryRow: BudgetRow = {
    id: uid(),
    name: "משכורת נטו",
    budget: net,
    actual: net,
    avg3: net,
    locked: true,
    source: "salary",
  };

  // Place salary row first (hero income line)
  return {
    ...budget,
    sections: {
      ...budget.sections,
      income: [salaryRow, ...incomeClean],
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function rowEffective(row: BudgetRow, field: "budget" | "actual"): number {
  if (row.subItems && row.subItems.length > 0) {
    return row.subItems.reduce((s, sub) => s + (Number(sub[field]) || 0), 0);
  }
  return Number(row[field]) || 0;
}

function sectionTotal(rows: BudgetRow[], field: "budget" | "actual") {
  return rows.reduce((s, r) => s + rowEffective(r, field), 0);
}

/* ═══════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function BudgetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showChart, setShowChart] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  /** Scope filter: 'all' | 'personal' | 'business'. Not persisted. */
  const [scopeFilter, setScopeFilter] = useState<"all" | "personal" | "business">("all");
  /** Whether business scope UI is enabled (derived from employment type or manual override). */
  const [businessEnabled, setBusinessEnabled] = useState(false);
  useEffect(() => {
    setBusinessEnabled(isBusinessScopeEnabled());
    const handler = () => setBusinessEnabled(isBusinessScopeEnabled());
    window.addEventListener(BUSINESS_SCOPE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(BUSINESS_SCOPE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  /* Pull the latest onboarding snapshot → stores on every mount so newly-added
     rental properties / allowances reach this page without a detour through
     /dashboard. Idempotent: each sub-syncer guards against duplicates. */
  useEffect(() => {
    syncOnboardingToStores();
  }, []);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transaction import modal state
  const [importPreview, setImportPreview] = useState<{
    summary: ImportSummary;
    updatedBudget: BudgetData;
  } | null>(null);
  const [importToast, setImportToast] = useState<string | null>(null);

  // Listen for debt + asset changes — re-inject locked rows (debt + passive).
  // Also re-run on window focus so that data entered in /onboarding in another
  // tab flows in as soon as the user switches back here, without a manual reload.
  useEffect(() => {
    const handler = () => {
      // Pull the freshest snapshot from the questionnaire first, then re-inject.
      syncOnboardingToStores();
      setBudget((prev) => {
        if (!prev) return prev;
        const updated = injectOnboardingIncomeRows(
          injectSalaryRow(injectPassiveIncomeRows(injectDebtRows(prev)))
        );
        saveBudget(updated);
        return updated;
      });
    };
    window.addEventListener("storage", handler);
    window.addEventListener("verdant:realestate:updated", handler);
    window.addEventListener(SALARY_PROFILE_EVENT, handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("verdant:realestate:updated", handler);
      window.removeEventListener(SALARY_PROFILE_EVENT, handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  // Load / init budget on month change — carry forward + inject debts
  useEffect(() => {
    const existing = loadBudget(year, month);
    if (existing) {
      // Re-inject debt + passive income rows in case they changed
      const withSync = injectOnboardingIncomeRows(
        injectSalaryRow(injectPassiveIncomeRows(injectDebtRows(existing)))
      );
      setBudget(withSync);
      return;
    }

    // ═══ Try carry forward from previous month ═══
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear--;
    }
    const prev = loadBudget(prevYear, prevMonth);

    let fresh: BudgetData;
    if (prev) {
      fresh = carryForward(prev, year, month);
    } else {
      // No previous month — use defaults
      fresh = {
        year,
        month,
        sections: JSON.parse(JSON.stringify(DEFAULT_SECTIONS)),
        settled: false,
      };
      // Generate fresh IDs
      Object.values(fresh.sections).forEach((rows) =>
        rows.forEach((r) => {
          r.id = uid();
          r.subItems?.forEach((s) => {
            s.id = uid();
          });
        })
      );
    }

    // Inject locked debt rows + passive income
    fresh = injectOnboardingIncomeRows(
      injectSalaryRow(injectPassiveIncomeRows(injectDebtRows(fresh)))
    );

    setBudget(fresh);
    saveBudget(fresh);
  }, [year, month]);

  // Auto-save with debounce
  const autoSave = useCallback((data: BudgetData) => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveBudget(data);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  }, []);

  // Update a field on a row (skip locked rows)
  const updateRow = useCallback(
    (sectionKey: string, rowId: string, field: string, value: string | number) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        next.sections[sectionKey] = next.sections[sectionKey].map((r) => {
          if (r.id !== rowId || r.locked) return r;
          // Text fields stay as strings; everything else is coerced to number.
          const isText = field === "name" || field === "notes";
          return { ...r, [field]: isText ? value : Number(value) || 0 };
        });
        autoSave(next);
        return next;
      });
    },
    [autoSave]
  );

  // Set a row's scope tag directly (popover picker — no cycling guesswork)
  const setRowScope = useCallback(
    (sectionKey: string, rowId: string, newScope: Scope | undefined) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        next.sections[sectionKey] = next.sections[sectionKey].map((r) => {
          if (r.id !== rowId || r.locked) return r;
          return { ...r, scope: newScope };
        });
        autoSave(next);
        return next;
      });
      // Auto-widen filter so the row stays visible after scope change
      if (newScope === "business" && scopeFilter === "personal") setScopeFilter("all");
      if ((newScope === undefined || newScope === "personal") && scopeFilter === "business")
        setScopeFilter("all");
    },
    [autoSave, scopeFilter]
  );

  const addRow = useCallback(
    (sectionKey: string) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        // Determine scope for the new row:
        // - business section always → business
        // - otherwise inherit the active filter so the new row stays visible
        let newScope: Scope | undefined;
        if (sectionKey === "business") newScope = "business";
        else if (scopeFilter === "business") newScope = "business";
        else newScope = undefined; // personal default
        // Insert before locked rows
        const unlocked = (next.sections[sectionKey] || []).filter((r) => !r.locked);
        const locked = (next.sections[sectionKey] || []).filter((r) => r.locked);
        next.sections[sectionKey] = [
          ...unlocked,
          {
            id: uid(),
            name: "",
            budget: 0,
            actual: 0,
            avg3: 0,
            ...(newScope ? { scope: newScope } : {}),
          },
          ...locked,
        ];
        autoSave(next);
        return next;
      });
    },
    [autoSave, scopeFilter]
  );

  const deleteRow = useCallback(
    (sectionKey: string, rowId: string) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        // Don't delete locked rows
        next.sections[sectionKey] = next.sections[sectionKey].filter(
          (r) => r.id !== rowId || r.locked
        );
        autoSave(next);
        return next;
      });
    },
    [autoSave]
  );

  const updateSubItem = useCallback(
    (sectionKey: string, rowId: string, subId: string, field: string, value: string | number) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        next.sections[sectionKey] = next.sections[sectionKey].map((r) => {
          if (r.id !== rowId || !r.subItems) return r;
          const isText = field === "name" || field === "notes";
          const updatedSubs = r.subItems.map((s) =>
            s.id === subId ? { ...s, [field]: isText ? value : Number(value) || 0 } : s
          );
          const subBudget = updatedSubs.reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
          const subActual = updatedSubs.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
          return { ...r, subItems: updatedSubs, budget: subBudget, actual: subActual };
        });
        autoSave(next);
        return next;
      });
    },
    [autoSave]
  );

  const addSubItem = useCallback(
    (sectionKey: string, rowId: string) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        next.sections[sectionKey] = next.sections[sectionKey].map((r) => {
          if (r.id !== rowId) return r;
          return {
            ...r,
            subItems: [
              ...(r.subItems || []),
              { id: uid(), name: "", budget: 0, actual: 0, avg3: 0 },
            ],
          };
        });
        autoSave(next);
        return next;
      });
    },
    [autoSave]
  );

  const deleteSubItem = useCallback(
    (sectionKey: string, rowId: string, subId: string) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        next.sections[sectionKey] = next.sections[sectionKey].map((r) => {
          if (r.id !== rowId || !r.subItems) return r;
          const updatedSubs = r.subItems.filter((s) => s.id !== subId);
          const subBudget = updatedSubs.reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
          const subActual = updatedSubs.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
          return { ...r, subItems: updatedSubs, budget: subBudget, actual: subActual };
        });
        autoSave(next);
        return next;
      });
    },
    [autoSave]
  );

  // Open the import-preview modal using the currently saved parsed transactions
  const openImportPreview = useCallback(() => {
    if (!budget) return;
    const all = loadParsedTransactions();
    const forMonth = filterByMonth(all, year, month);
    if (forMonth.length === 0) {
      setImportToast("העלה קובץ במאזן קודם.");
      setTimeout(() => setImportToast(null), 3000);
      return;
    }
    const { budget: updatedBudget, summary } = importTransactionsIntoBudget(budget, forMonth);
    setImportPreview({ summary, updatedBudget });
  }, [budget, year, month]);

  // Confirm — persist the preview, close modal, show feedback
  const confirmImport = useCallback(() => {
    if (!importPreview) return;
    const { updatedBudget, summary } = importPreview;
    setBudget(updatedBudget);
    saveBudget(updatedBudget);
    setSaveStatus("saving");
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 250);
    setImportPreview(null);
    setImportToast(`יובאו ${summary.matched + summary.unmatched} תנועות`);
    setTimeout(() => setImportToast(null), 3000);
  }, [importPreview]);

  const cancelImport = useCallback(() => setImportPreview(null), []);

  const openNewMonth = useCallback(() => {
    let newMonth = month + 1;
    let newYear = year;
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    setYear(newYear);
    setMonth(newMonth);
  }, [month, year]);

  // Apply monthly insight recommendations to budget plan values
  const applyInsights = useCallback(
    (adjustments: BudgetAdjustment[]) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };

        for (const adj of adjustments) {
          const sectionRows = next.sections[adj.sectionKey];
          if (!sectionRows) continue;

          next.sections[adj.sectionKey] = sectionRows.map((row) => {
            if (row.locked) return row; // Never modify locked rows
            // Match by name (partial match to handle names like "סופר / מזון")
            if (!row.name.includes(adj.rowName) && !adj.rowName.includes(row.name)) return row;

            if (row.subItems && row.subItems.length > 0) {
              const updatedSubs = row.subItems.map((sub) => {
                const currentBudget = Number(sub.budget) || 0;
                if (currentBudget <= 0) return sub;
                const newVal =
                  adj.absolute != null
                    ? adj.absolute
                    : Math.round(currentBudget * (adj.multiplier || 1));
                return { ...sub, budget: newVal };
              });
              const subBudget = updatedSubs.reduce((s, sub) => s + (Number(sub.budget) || 0), 0);
              return { ...row, subItems: updatedSubs, budget: subBudget };
            } else {
              const currentBudget = Number(row.budget) || 0;
              if (currentBudget <= 0 && adj.absolute == null) return row;
              const newVal =
                adj.absolute != null
                  ? adj.absolute
                  : Math.round(currentBudget * (adj.multiplier || 1));
              return { ...row, budget: newVal };
            }
          });
        }

        autoSave(next);
        return next;
      });
    },
    [autoSave]
  );

  // Row visibility predicate based on the active scope filter.
  // undefined scope = "personal". Locked debt rows always visible.
  const rowVisibleForFilter = useCallback(
    (row: BudgetRow): boolean => {
      if (row.locked) return true;
      if (scopeFilter === "all") return true;
      const eff = effectiveScope(row.scope);
      if (scopeFilter === "personal") return eff === "personal" || eff === "mixed";
      if (scopeFilter === "business") return eff === "business" || eff === "mixed";
      return true;
    },
    [scopeFilter]
  );

  // Filtered budget drives both totals and rendering, so sections
  // and overspend warnings reflect the selected scope.
  const filteredBudget = useMemo(() => {
    if (!budget) return null;
    if (scopeFilter === "all") return budget;
    const sections: Record<string, BudgetRow[]> = {};
    for (const [k, rows] of Object.entries(budget.sections)) {
      sections[k] = rows.filter(rowVisibleForFilter);
    }
    return { ...budget, sections };
  }, [budget, scopeFilter, rowVisibleForFilter]);

  // Derived totals — debts are already inside fixed section as locked rows.
  // 2026-04-29 owner-draw model: in "business" view, business section is
  // treated as expenses (it's a profit/loss view of the business). In "all"
  // (unified) view, business profit (positive) becomes a virtual income line
  // — "משיכת בעלים" — bridging business → personal cashflow.
  const totals = useMemo(() => {
    if (!filteredBudget)
      return {
        incBudget: 0,
        incActual: 0,
        expBudget: 0,
        expActual: 0,
        savingsTransfersBudget: 0,
        savingsTransfersActual: 0,
        ownerDrawBudget: 0,
        ownerDrawActual: 0,
      };

    if (scopeFilter === "business") {
      // Business-only: sum business section as expense, no income lines.
      const expBudget = sectionTotal(filteredBudget.sections.business || [], "budget");
      const expActual = sectionTotal(filteredBudget.sections.business || [], "actual");
      return {
        incBudget: 0,
        incActual: 0,
        expBudget,
        expActual,
        savingsTransfersBudget: 0,
        savingsTransfersActual: 0,
        ownerDrawBudget: 0,
        ownerDrawActual: 0,
      };
    }

    const incBudget = sectionTotal(filteredBudget.sections.income || [], "budget");
    const incActual = sectionTotal(filteredBudget.sections.income || [], "actual");
    const expBudget = (["fixed", "variable"] as const).reduce(
      (s, k) => s + sectionTotal(filteredBudget.sections[k] || [], "budget"),
      0
    );
    const expActual = (["fixed", "variable"] as const).reduce(
      (s, k) => s + sectionTotal(filteredBudget.sections[k] || [], "actual"),
      0
    );

    // Savings transfers (העברה לחיסכון, קרן השתלמות, פנסיה פרטית) live under
    // the "חסכונות והשקעות" parent in `fixed`. They're savings, not consumption.
    // 2026-05-05 per finance-agent: these were being counted as expenses, so the
    // displayed savings rate under-stated the truth (often by 2-3×). Compute
    // `savingsTransfers` so the rate calc can subtract them. Net consumption =
    // expBudget - savingsTransfers.
    const findSavingsRow = (rows: BudgetRow[]) =>
      rows.find((r) => r.name === "חסכונות והשקעות");
    const savingsRowBudget = findSavingsRow(filteredBudget.sections.fixed || []);
    const savingsTransfersBudget = savingsRowBudget ? rowEffective(savingsRowBudget, "budget") : 0;
    const savingsTransfersActual = savingsRowBudget ? rowEffective(savingsRowBudget, "actual") : 0;

    // Compute owner draw — business profit that flows to the family.
    // Negative profit (loss) doesn't pull from personal cashflow; clamp at 0.
    let ownerDrawBudget = 0,
      ownerDrawActual = 0;
    if (scopeFilter === "all" && businessEnabled && budget) {
      // Use unfiltered budget for business rows so personal-mode users still
      // see their owner draw if they happen to have business data.
      const bizRows = budget.sections.business || [];
      const bizExpB = sectionTotal(bizRows, "budget");
      const bizExpA = sectionTotal(bizRows, "actual");
      // For now we approximate business income as 0 (the future business
      // section will carry its own income rows). Owner draw = -expense?
      // No — better: don't double-count. Skip until business income exists.
      void bizExpB;
      void bizExpA;
    }

    return {
      incBudget,
      incActual,
      expBudget,
      expActual,
      savingsTransfersBudget,
      savingsTransfersActual,
      ownerDrawBudget,
      ownerDrawActual,
    };
  }, [filteredBudget, scopeFilter, businessEnabled, budget]);

  // Savings rate — uses CONSUMPTION (expenses minus savings-transfer rows),
  // not raw expenses. Otherwise the rate gets diluted by money the family
  // is actually saving (העברה לחיסכון, קרן השתלמות, פנסיה פרטית).
  const balance = totals.incBudget - totals.expBudget;
  const consumptionBudget = totals.expBudget - totals.savingsTransfersBudget;
  const savingsRate = calcSavingsRate(totals.incBudget, consumptionBudget) * 100;

  /* ── Daily allowance — the "how much can I spend today" number ──
     Only meaningful for the CURRENT month. For past/future months we hide it.
     Formula: (expense budget − expense actual) ÷ days remaining in month.
     This is the Finav/YNAB daily-pace number: "at your current pace, you have
     X shekels per remaining day to stay within budget". */
  const dailyAllowance = useMemo(() => {
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    if (!isCurrentMonth) return null;
    // Days in month (month is 0-indexed; `new Date(y, m+1, 0)` = last day of month m)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - today.getDate() + 1);
    const remainingBudget = Math.max(0, totals.expBudget - totals.expActual);
    const perDay = remainingBudget / daysRemaining;
    // Pace warning: if we've already exceeded the expected spend-by-today, flag it
    const expectedByNow = totals.expBudget * (today.getDate() / daysInMonth);
    const overPace = totals.expActual > expectedByNow;
    return { perDay, daysRemaining, remainingBudget, overPace };
  }, [year, month, totals.expBudget, totals.expActual]);

  /* ── Pie slices: per-row expense breakdown for the donut ──
     Uses actual spend if any row has actual > 0; otherwise falls back
     to budgeted amounts so the chart stays useful during planning. */
  const pieData = useMemo(() => {
    if (!filteredBudget) return { slices: [], mode: "actual" as const };
    const sectionKeys = ["fixed", "variable", "business"] as const;
    const sectionColorBase: Record<string, string> = {
      fixed: "#1B4332",
      variable: "#d97706",
      business: "#1B4332",
    };
    type RawSlice = {
      label: string;
      value: number;
      color: string;
      section: "fixed" | "variable" | "business";
    };
    const rawBudget: RawSlice[] = [];
    const rawActual: RawSlice[] = [];
    const sectionCounts: Record<string, number> = { fixed: 0, variable: 0, business: 0 };

    for (const key of sectionKeys) {
      const rows = filteredBudget.sections[key] || [];
      for (const r of rows) {
        const base = sectionColorBase[key];
        // Stagger shades so rows of same section are distinguishable.
        const shadeIdx = sectionCounts[key]++;
        const alpha = 1 - Math.min(0.55, shadeIdx * 0.08);
        // Convert hex → rgba to fade within section
        const hex = base.replace("#", "");
        const r_ = parseInt(hex.substring(0, 2), 16);
        const g_ = parseInt(hex.substring(2, 4), 16);
        const b_ = parseInt(hex.substring(4, 6), 16);
        const color = `rgba(${r_}, ${g_}, ${b_}, ${alpha.toFixed(2)})`;

        const budgetVal = rowEffective(r, "budget");
        const actualVal = rowEffective(r, "actual");
        if (budgetVal > 0) rawBudget.push({ label: r.name, value: budgetVal, color, section: key });
        if (actualVal > 0) rawActual.push({ label: r.name, value: actualVal, color, section: key });
      }
    }

    if (rawActual.length > 0) return { slices: rawActual, mode: "actual" as const };
    return { slices: rawBudget, mode: "budget" as const };
  }, [filteredBudget]);

  if (!budget || !filteredBudget) {
    // Loading skeleton — matches final layout so there's no flash-of-wrong-content.
    return (
      <div className="mx-auto max-w-4xl" dir="rtl">
        <section
          className="mb-5 animate-pulse rounded-3xl p-8"
          style={{
            background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)",
            minHeight: 180,
          }}
        >
          <div className="mb-4 h-3 w-32 rounded bg-white/20" />
          <div className="mb-3 h-10 w-48 rounded bg-white/20" />
          <div className="h-3 w-24 rounded bg-white/15" />
        </section>
        <div className="card-pad flex items-center gap-3 text-[13px] text-verdant-muted">
          <span className="material-symbols-outlined animate-spin text-[18px]">
            progress_activity
          </span>
          טוען תקציב...
        </div>
      </div>
    );
  }

  const yearOptions = [year - 1, year, year + 1];

  // ─── Month navigation helpers ───────────────────────────────
  const goPrevMonth = () => {
    let m = month - 1;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    }
    setMonth(m);
    setYear(y);
  };
  const goNextMonth = () => {
    let m = month + 1;
    let y = year;
    if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
  };

  const balancePct =
    totals.incBudget > 0 ? Math.max(0, Math.min(100, (balance / totals.incBudget) * 100)) : 0;

  return (
    <div className="mx-auto max-w-4xl" dir="rtl">
      {/* ═══════════════════════════════════════════════════════════
          HERO — one clear number per screen, Finav-inspired
          ═══════════════════════════════════════════════════════════ */}
      <section
        // 2026-05-05 visual-cleanup: softer flat fill instead of high-contrast
        // gradient (less heavy), padding aligned to tailwind scale (20/24px),
        // bigger gap below before the manage strip.
        className="relative mb-6 overflow-hidden rounded-2xl"
        style={{
          background: balance >= 0 ? "#1B4332" : "#7a1818",
          color: "#F9FAF2",
          padding: "20px 24px",
        }}
      >
        {/* Top row — month nav + save indicator */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={goPrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.85)" }}
              title="חודש קודם"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="cursor-pointer border-none bg-transparent text-[14px] font-bold focus:outline-none"
                style={{ color: "#F9FAF2" }}
              >
                {HE_MONTHS.map((m, i) => (
                  <option key={i} value={i} style={{ color: "#012d1d" }}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="cursor-pointer border-none bg-transparent text-[14px] font-bold focus:outline-none"
                style={{ color: "#F9FAF2" }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y} style={{ color: "#012d1d" }}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={goNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.85)" }}
              title="חודש הבא"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
          </div>

          {saveStatus !== "idle" && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold"
              style={{ color: "rgba(255,255,255,0.75)" }}
            >
              <span
                className={`material-symbols-outlined text-[14px] ${saveStatus === "saving" ? "animate-pulse" : ""}`}
              >
                {saveStatus === "saving" ? "cloud_sync" : "cloud_done"}
              </span>
              {saveStatus === "saving" ? "שומר..." : "נשמר"}
            </span>
          )}
        </div>

        {/* Hero — compact (2026-04-28: was eating half-screen). One row:
            big number on right, in/out + daily allowance on left. */}
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <div
              className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              {balance >= 0 ? "נשאר בחודש" : "חריגה בחודש"}
            </div>
            <div
              className="text-[34px] font-extrabold tabular-nums leading-none tracking-tight"
              style={{ color: "#F9FAF2", fontFamily: "Manrope, Assistant, system-ui, sans-serif" }}
            >
              {fmtILS(Math.abs(balance))}
            </div>
            <div className="mt-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.8)" }}>
              הכנסות <span className="font-bold tabular-nums">{fmtILS(totals.incBudget)}</span>
              {" · "}
              הוצאות <span className="font-bold tabular-nums">{fmtILS(totals.expBudget)}</span>
              {" · "}
              חיסכון <span className="font-bold tabular-nums">{savingsRate.toFixed(0)}%</span>
            </div>
          </div>

          {dailyAllowance && (
            // 2026-05-05 visual-cleanup: dropped the divider line. The two
            // numbers stand on their own — the spacing alone separates them.
            <div className="text-left" style={{ minWidth: 140 }}>
              <div
                className="text-[11px] font-semibold"
                style={{ color: "rgba(255,255,255,0.65)" }}
              >
                מותר/יום
              </div>
              <div
                className="mt-0.5 text-[22px] font-extrabold tabular-nums leading-none"
                style={{
                  color: dailyAllowance.overPace ? "#fecaca" : "#D6EFDC",
                  fontFamily: "Manrope, Assistant, system-ui, sans-serif",
                }}
              >
                {fmtILS(Math.round(dailyAllowance.perDay))}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                {dailyAllowance.daysRemaining} ימים נותרו
                {dailyAllowance.overPace && (
                  <span style={{ color: "#fecaca" }}> · חורג</span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          MANAGE STRIP — subtle action row
          ═══════════════════════════════════════════════════════════ */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {/* 2026-05-05 visual-cleanup: dropped the borders on the toggle
              buttons. They're secondary actions — the soft fill alone is
              enough to mark them as buttons without adding three more
              outlines to the page. */}
          <button
            onClick={openImportPreview}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors hover:bg-[#e8efe2]"
            style={{ background: "#f0f4ec", color: "#1B4332" }}
            title="ייבא תנועות מקובץ בנק/אשראי שהועלה"
          >
            <span className="material-symbols-outlined text-[14px]">sync_alt</span>
            ייבא תנועות
          </button>
          <button
            onClick={() => setShowChart((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors"
            style={{
              background: showChart ? "#1B4332" : "transparent",
              color: showChart ? "#fff" : "#5a7a6a",
            }}
          >
            <span className="material-symbols-outlined text-[14px]">bar_chart</span>
            גרפים
          </button>
          <button
            onClick={() => setShowInsights((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors"
            style={{
              background: showInsights ? "#1B4332" : "transparent",
              color: showInsights ? "#fff" : "#5a7a6a",
            }}
          >
            <span className="material-symbols-outlined text-[14px]">lightbulb</span>
            תובנות
          </button>
        </div>

        {/* Scope filter — only shown when business scope enabled */}
        {businessEnabled && (
          <div className="flex items-center gap-1">
            {(
              [
                { key: "all", label: "הכל" },
                { key: "personal", label: "פרטי" },
                { key: "business", label: "עסקי" },
              ] as const
            ).map((tab) => {
              const active = scopeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setScopeFilter(tab.key)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all"
                  style={{
                    background: active ? "#012d1d" : "transparent",
                    color: active ? "#fff" : "#5a7a6a",
                    border: active ? "1px solid #012d1d" : "1px solid #e2e8d8",
                  }}
                >
                  {tab.key === "business" && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: active ? "#fff" : SCOPE_COLORS.business }}
                    />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          CHARTS (toggleable)
          ═══════════════════════════════════════════════════════════ */}
      {showChart && (
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BudgetChart
            incBudget={totals.incBudget}
            incActual={totals.incActual}
            expBudget={totals.expBudget}
            expActual={totals.expActual}
          />
          <BudgetPie
            slices={pieData.slices}
            mode={pieData.mode}
            subtitle={pieData.mode === "actual" ? "בפועל" : "מתוכנן"}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          INSIGHTS (toggleable)
          ═══════════════════════════════════════════════════════════ */}
      {showInsights && <MonthlyInsights month={month} year={year} onApply={applyInsights} />}

      {/* 12-month cashflow forecast (2026-05-02). */}
      <CashflowForecast />

      {/* Business / personal scope toggle.
          2026-05-04: restored per Nir — the colored personal/business split is
          a key feature for self-employed couples. Enable shows the section +
          the scope filter tabs above; disable hides them. */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setBusinessScopeOverride(!businessEnabled)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all hover:bg-verdant-bg"
          style={{
            color: businessEnabled ? "#012d1d" : "#5a7a6a",
            border: `1px solid ${businessEnabled ? SCOPE_COLORS.business : "#d8e0d0"}`,
            background: businessEnabled ? "#eff6ff" : "transparent",
          }}
          title={
            businessEnabled
              ? "הפרדת עסקי / פרטי פעילה. לחיצה תכבה את ההפרדה."
              : "הפעל הפרדה בין הוצאות פרטיות לעסקיות (מומלץ אם אחד מבני הזוג עצמאי)."
          }
        >
          <span className="material-symbols-outlined text-[13px]">work</span>
          {businessEnabled ? "כבה הפרדת עסקי / פרטי" : "הפעל הפרדת עסקי / פרטי"}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          BUDGET SECTIONS — collapsible disclosures, Finav-style
          ═══════════════════════════════════════════════════════════ */}
      {SECTION_ORDER.filter(
        (sk) => !(sk === "business" && (!businessEnabled || scopeFilter === "personal"))
      ).map((sectionKey, idx) => (
        <BudgetSection
          key={sectionKey}
          sectionKey={sectionKey}
          meta={SECTION_META[sectionKey]}
          rows={filteredBudget.sections[sectionKey] || []}
          incomeTotal={totals.incBudget}
          onUpdate={updateRow}
          onAdd={addRow}
          onDelete={deleteRow}
          onUpdateSub={updateSubItem}
          onAddSub={addSubItem}
          onDeleteSub={deleteSubItem}
          onSetScope={setRowScope}
          showScopePicker={businessEnabled}
          defaultOpen={idx < 2}
        />
      ))}

      {/* ═══════ Import Preview Modal ═══════ */}
      {importPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(1, 45, 29, 0.45)" }}
          onClick={cancelImport}
        >
          <div
            className="w-full max-w-lg rounded-organic p-6 shadow-soft"
            style={{ background: "#ffffff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <div
                className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em]"
                style={{ color: "#5a7a6a" }}
              >
                ייבוא תנועות
              </div>
              <h2
                className="text-[18px] font-extrabold tracking-tight"
                style={{ color: "#012d1d" }}
              >
                ייבוא תנועות לתקציב
              </h2>
              <p className="mt-2 text-xs" style={{ color: "#5a7a6a" }}>
                נמצאו {importPreview.summary.matched + importPreview.summary.unmatched} תנועות לחודש{" "}
                {HE_MONTHS[month]} {year}
              </p>
            </div>

            <div
              className="mb-4 max-h-72 overflow-y-auto rounded-lg p-3"
              style={{ background: "#f0f4ec", border: "1px solid #e2e8d8" }}
            >
              {importPreview.summary.byRow.length === 0 ? (
                <div className="text-xs" style={{ color: "#5a7a6a" }}>
                  אין תנועות לתצוגה.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {importPreview.summary.byRow.map((r, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate font-bold" style={{ color: "#012d1d" }}>
                        {r.rowName}
                      </span>
                      <span
                        className="flex shrink-0 items-center gap-3 tabular-nums"
                        style={{ color: "#5a7a6a" }}
                      >
                        <span>{r.count} תנועות</span>
                        <span className="font-extrabold" style={{ color: "#012d1d" }}>
                          {fmtILS(r.total)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {importPreview.summary.unmatched > 0 && (
              <div
                className="mb-4 rounded-lg p-2.5 text-xs"
                style={{ background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" }}
              >
                <span className="font-bold">שים לב: </span>
                {importPreview.summary.unmatched} תנועות ללא מיפוי יתווספו כשורות חדשות.
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelImport}
                className="btn-botanical-ghost inline-flex items-center gap-1.5 !px-4 !py-2 text-xs"
              >
                ביטול
              </button>
              <button
                onClick={confirmImport}
                className="btn-botanical inline-flex items-center gap-1.5 !px-4 !py-2 text-xs"
              >
                <span className="material-symbols-outlined text-[14px]">check</span>
                ייבא ועדכן
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Import Toast ═══════ */}
      {importToast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-xs font-bold shadow-lg"
          style={{ background: "#012d1d", color: "#ffffff" }}
        >
          {importToast}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Budget Section (card with table) — 4 columns, locked row support
   ═══════════════════════════════════════════════════════════ */

function BudgetSection({
  sectionKey,
  meta,
  rows,
  incomeTotal,
  onUpdate,
  onAdd,
  onDelete,
  onUpdateSub,
  onAddSub,
  onDeleteSub,
  onSetScope,
  showScopePicker = true,
  defaultOpen = true,
}: {
  sectionKey: string;
  meta: { label: string; icon: string; type: string };
  rows: BudgetRow[];
  /** Total monthly income — drives the "% of income" metric on this section. */
  incomeTotal: number;
  onUpdate: (section: string, rowId: string, field: string, value: string | number) => void;
  onAdd: (section: string) => void;
  onDelete: (section: string, rowId: string) => void;
  onUpdateSub: (
    section: string,
    rowId: string,
    subId: string,
    field: string,
    value: string | number
  ) => void;
  onAddSub: (section: string, rowId: string) => void;
  onDeleteSub: (section: string, rowId: string, subId: string) => void;
  onSetScope: (section: string, rowId: string, scope: Scope | undefined) => void;
  showScopePicker?: boolean;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(defaultOpen);
  const secBudget = sectionTotal(rows, "budget");
  const secActual = sectionTotal(rows, "actual");
  const isIncome = meta.type === "income";
  const ok = isIncome ? secActual >= secBudget : secActual <= secBudget;
  const over = !ok && !isIncome;

  // Accent color per section type
  const accent = isIncome
    ? "#2B694D"
    : sectionKey === "fixed"
      ? "#B45309"
      : sectionKey === "business"
        ? "#5C6058"
        : "#1B4332";
  const accentSoft = isIncome ? "#D6EFDC" : sectionKey === "fixed" ? "#FEF3C7" : "#f0f4ec";

  const toggleExpand = (rowId: string) => {
    setExpanded((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  return (
    <section
      // 2026-05-05 visual-cleanup: lighter border + bigger bottom margin so
      // sections breathe between each other. Was mb-3 (cramped) + a darker
      // border that made each section feel like a heavy card.
      className="mb-5 overflow-hidden rounded-2xl bg-white"
      style={{ border: "1px solid #f0f4ec", boxShadow: "none" }}
    >
      {/* Clickable section header (disclosure) */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 transition-colors hover:bg-[#fafbf7]"
        aria-expanded={open}
      >
        {/* Chevron */}
        <span
          className="material-symbols-outlined text-[20px] transition-transform"
          style={{ color: "#5a7a6a", transform: open ? "rotate(0deg)" : "rotate(90deg)" }}
        >
          expand_more
        </span>

        {/* Icon circle */}
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: accentSoft }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: accent }}>
            {meta.icon}
          </span>
        </span>

        {/* Label */}
        <div className="flex-1 text-right">
          <div className="text-[15px] font-extrabold" style={{ color: "#012d1d" }}>
            {meta.label}
          </div>
          {/* 2026-05-05 visual-cleanup: dropped the "X שורות" prefix — once
              the section is open the user sees the rows directly. Keeping
              just the % of income and the overrun warning gives a calm
              two-piece line instead of three. */}
          <div className="mt-0.5 text-[12px] font-semibold" style={{ color: "#5a7a6a" }}>
            {!isIncome && incomeTotal > 0 && secBudget > 0 && (
              <span style={{ color: accent }}>
                {Math.round((secBudget / incomeTotal) * 100)}% מההכנסה
              </span>
            )}
            {isIncome && <span>סה״כ {fmtILS(secBudget)}</span>}
            {over && (
              <>
                {" · "}
                <span style={{ color: "#b91c1c" }}>חריגה {fmtILS(secActual - secBudget)}</span>
              </>
            )}
          </div>
        </div>

        {/* Big total */}
        <div className="shrink-0 text-left">
          <div
            className="text-[18px] font-extrabold tabular-nums leading-none"
            style={{ color: isIncome ? "#2B694D" : over ? "#b91c1c" : "#012d1d" }}
          >
            {fmtILS(secBudget)}
          </div>
          {secActual > 0 && secActual !== secBudget && (
            <div className="mt-1 text-[10px] font-bold tabular-nums" style={{ color: "#5a7a6a" }}>
              בפועל <span style={{ color: ok ? "#1B4332" : "#b91c1c" }}>{fmtILS(secActual)}</span>
            </div>
          )}
        </div>
      </button>

      {/* Collapsed → stop here */}
      {!open ? null : (
        <div className="px-5 pb-5 pt-1">
          {/* Income section explainer — passive income is auto-synced from assets */}
          {/* Passive-income note removed 2026-04-28 — info already in tooltip on locked rows. */}

          {/* Column headers — 5 columns. Label uses natural width so it sits
          tight next to the numbers; notes takes remaining space. */}
          <div
            className="mb-1 grid items-center pb-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
            style={{
              gridTemplateColumns: "minmax(120px,auto) 70px 70px 70px minmax(80px,1fr)",
              color: "#5a7a6a",
              borderBottom: "1px solid #eef2e8",
              columnGap: "10px",
            }}
          >
            <div>קטגוריה</div>
            <div className="text-left tabular-nums">תקציב</div>
            <div className="text-left tabular-nums">בפועל</div>
            <div className="text-left tabular-nums">הפרש</div>
            <div className="text-right">הערות</div>
          </div>

          {/* Rows */}
          {rows.map((row) => {
            const hasSubs = row.subItems && row.subItems.length > 0;
            const isExpanded = expanded[row.id] ?? false;
            const isLocked = row.locked === true;
            const b = hasSubs ? rowEffective(row, "budget") : Number(row.budget) || 0;
            const a = hasSubs ? rowEffective(row, "actual") : Number(row.actual) || 0;
            const gap = b - a;
            const gapPositive = isIncome ? gap <= 0 : gap >= 0;
            const gapStr = (gap > 0 ? "+" : gap < 0 ? "−" : "") + fmtILS(Math.abs(gap));
            const subOverspend = hasSubOverspend(row);

            return (
              <div key={row.id}>
                {/* Parent row — same 5-col grid as the header above */}
                <div
                  className="group relative grid items-center py-1.5"
                  style={{
                    gridTemplateColumns: "minmax(120px,auto) 70px 70px 70px minmax(80px,1fr)",
                    borderBottom: isExpanded ? "none" : "1px solid #eef2e8",
                    columnGap: "10px",
                    opacity: isLocked ? 0.85 : 1,
                  }}
                >
                  {/* Name */}
                  <div className="flex items-center gap-1.5">
                    {isLocked ? (
                      row.source === "passive" ? (
                        <div
                          className="flex items-center gap-1.5 text-[13px] font-semibold"
                          style={{ color: "#1B4332" }}
                          title="מסונכרן מנדל״ן"
                        >
                          <span
                            className="material-symbols-outlined text-[13px]"
                            style={{ color: "#2B694D" }}
                          >
                            home_work
                          </span>
                          {row.name}
                          <span
                            className="material-symbols-outlined text-[11px]"
                            style={{ color: "#8aab99" }}
                          >
                            sync
                          </span>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-1.5 text-[13px] font-semibold"
                          style={{ color: "#5a7a6a" }}
                          title="הוצאה קשיחה — נמשכת מדף חובות"
                        >
                          <span
                            className="material-symbols-outlined text-[13px]"
                            style={{ color: "#9a6458" }}
                          >
                            lock
                          </span>
                          {row.name}
                        </div>
                      )
                    ) : hasSubs ? (
                      <button
                        onClick={() => toggleExpand(row.id)}
                        className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-[13px] font-semibold transition-opacity hover:opacity-80"
                        style={{ color: subOverspend ? "#b91c1c" : "#012d1d" }}
                      >
                        <span
                          className="material-symbols-outlined text-[14px] transition-transform"
                          style={{
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            color: "#5a7a6a",
                          }}
                        >
                          chevron_left
                        </span>
                        {row.name}
                        {subOverspend && (
                          <span
                            className="material-symbols-outlined mr-0.5 text-[12px]"
                            style={{ color: "#b91c1c" }}
                          >
                            error
                          </span>
                        )}
                      </button>
                    ) : (
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => onUpdate(sectionKey, row.id, "name", e.target.value)}
                        placeholder="שם קטגוריה"
                        className="w-full border-none bg-transparent text-[13px] font-semibold focus:outline-none"
                        style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderBottomColor = "#2B694D";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderBottomColor = "transparent";
                        }}
                      />
                    )}
                  </div>
                  {/* Budget */}
                  {isLocked || hasSubs ? (
                    <div
                      className="text-left text-[13px] font-bold tabular-nums"
                      style={{
                        color: isLocked
                          ? row.source === "passive"
                            ? "#1B4332"
                            : "#9a6458"
                          : "#012d1d",
                      }}
                    >
                      {fmtILS(b)}
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={row.budget || ""}
                      onChange={(e) => onUpdate(sectionKey, row.id, "budget", e.target.value)}
                      placeholder="0"
                      className="w-full border-none bg-transparent text-left text-[13px] font-bold tabular-nums focus:outline-none"
                      style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderBottomColor = "#2B694D";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderBottomColor = "transparent";
                      }}
                    />
                  )}
                  {/* Actual */}
                  {isLocked || hasSubs ? (
                    <div
                      className="text-left text-[13px] font-bold tabular-nums"
                      style={{ color: isLocked ? "#9a6458" : subOverspend ? "#b91c1c" : "#012d1d" }}
                    >
                      {fmtILS(a)}
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={row.actual || ""}
                      onChange={(e) => onUpdate(sectionKey, row.id, "actual", e.target.value)}
                      placeholder="0"
                      className="w-full border-none bg-transparent text-left text-[13px] font-bold tabular-nums focus:outline-none"
                      style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderBottomColor = "#2B694D";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderBottomColor = "transparent";
                      }}
                    />
                  )}
                  {/* Gap */}
                  <div
                    className="text-left text-[12px] font-extrabold tabular-nums"
                    style={{ color: isLocked ? "#5a7a6a" : gapPositive ? "#1B4332" : "#b91c1c" }}
                  >
                    {isLocked ? "₪0" : gapStr}
                  </div>
                  {/* Notes + delete */}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={row.notes || ""}
                      onChange={(e) => onUpdate(sectionKey, row.id, "notes", e.target.value)}
                      placeholder="הערה…"
                      disabled={isLocked}
                      className="w-full border-none bg-transparent text-right text-[11px] focus:outline-none"
                      style={{
                        color: "#5a7a6a",
                        borderBottom: "1px dotted transparent",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderBottomColor = "#2B694D";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderBottomColor = "transparent";
                      }}
                    />
                    {/* Scope picker — explicit popover, no cycling guesswork; hidden when business scope not enabled */}
                    {!isLocked && showScopePicker && (
                      <ScopePicker
                        current={row.scope}
                        onPick={(s) => onSetScope(sectionKey, row.id, s)}
                      />
                    )}
                    {/* Delete — hover only, never for locked rows */}
                    {!isLocked && (
                      <button
                        onClick={() => onDelete(sectionKey, row.id)}
                        className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                        style={{ color: "#5a7a6a" }}
                        title="מחק"
                      >
                        <span className="material-symbols-outlined text-[14px] transition-colors hover:text-red-600">
                          close
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded sub-items */}
                {hasSubs && isExpanded && (
                  <div
                    className="mb-2 mr-6 overflow-hidden rounded-xl"
                    style={{ background: "#f8faf5", border: "1px solid #eef2e8" }}
                  >
                    {row.subItems!.map((sub) => {
                      const sb = Number(sub.budget) || 0;
                      const sa = Number(sub.actual) || 0;
                      const sg = sb - sa;
                      const sgPositive = isIncome ? sg <= 0 : sg >= 0;
                      const sgStr = (sg > 0 ? "+" : sg < 0 ? "−" : "") + fmtILS(Math.abs(sg));
                      const subOver = !isIncome && sa > sb && sb > 0;

                      return (
                        <div
                          key={sub.id}
                          className="group/sub relative grid items-center px-3 py-1.5"
                          style={{
                            gridTemplateColumns:
                              "minmax(110px,auto) 70px 70px 70px minmax(80px,1fr)",
                            borderBottom: "1px solid #eef2e8",
                            columnGap: "10px",
                          }}
                        >
                          {/* Sub name */}
                          <input
                            type="text"
                            value={sub.name}
                            onChange={(e) =>
                              onUpdateSub(sectionKey, row.id, sub.id, "name", e.target.value)
                            }
                            placeholder="פריט"
                            className="w-full border-none bg-transparent text-[12px] font-semibold focus:outline-none"
                            style={{
                              color: subOver ? "#b91c1c" : "#5a7a6a",
                              borderBottom: "1px dotted transparent",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderBottomColor = "#2B694D";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderBottomColor = "transparent";
                            }}
                          />
                          {/* Sub budget */}
                          <input
                            type="number"
                            value={sub.budget || ""}
                            onChange={(e) =>
                              onUpdateSub(sectionKey, row.id, sub.id, "budget", e.target.value)
                            }
                            placeholder="0"
                            className="w-full border-none bg-transparent text-left text-[12px] font-bold tabular-nums focus:outline-none"
                            style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderBottomColor = "#2B694D";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderBottomColor = "transparent";
                            }}
                          />
                          {/* Sub actual */}
                          <input
                            type="number"
                            value={sub.actual || ""}
                            onChange={(e) =>
                              onUpdateSub(sectionKey, row.id, sub.id, "actual", e.target.value)
                            }
                            placeholder="0"
                            className="w-full border-none bg-transparent text-left text-[12px] font-bold tabular-nums focus:outline-none"
                            style={{
                              color: subOver ? "#b91c1c" : "#012d1d",
                              borderBottom: "1px dotted transparent",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderBottomColor = "#2B694D";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderBottomColor = "transparent";
                            }}
                          />
                          {/* Sub gap */}
                          <div
                            className="text-left text-[11px] font-extrabold tabular-nums"
                            style={{ color: sgPositive ? "#1B4332" : "#b91c1c" }}
                          >
                            {sgStr}
                          </div>
                          {/* Sub notes + delete */}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={sub.notes || ""}
                              onChange={(e) =>
                                onUpdateSub(sectionKey, row.id, sub.id, "notes", e.target.value)
                              }
                              placeholder="הערה…"
                              className="w-full border-none bg-transparent text-right text-[10px] focus:outline-none"
                              style={{
                                color: "#5a7a6a",
                                borderBottom: "1px dotted transparent",
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderBottomColor = "#2B694D";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderBottomColor = "transparent";
                              }}
                            />
                            {/* Delete sub — hover only */}
                            <button
                              onClick={() => onDeleteSub(sectionKey, row.id, sub.id)}
                              className="shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-100"
                              style={{ color: "#5a7a6a" }}
                              title="מחק פריט"
                            >
                              <span className="material-symbols-outlined text-[13px] transition-colors hover:text-red-600">
                                close
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {/* Add sub-item */}
                    <button
                      onClick={() => onAddSub(sectionKey, row.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold transition-colors hover:underline"
                      style={{ color: "#1B4332" }}
                    >
                      <span className="material-symbols-outlined text-[11px]">add</span>
                      הוסף פריט
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add row */}
          <button
            onClick={() => onAdd(sectionKey)}
            className="inline-flex items-center gap-1 pt-2 text-[11px] font-bold transition-colors hover:underline"
            style={{ color: "#1B4332" }}
          >
            <span className="material-symbols-outlined text-[12px]">add</span>
            הוסף שורה
          </button>
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   ScopePicker — compact popover to assign personal/business/mixed
   Replaces the cycling dot so users never "lose" a row to a filter.
   ═══════════════════════════════════════════════════════════ */
function ScopePicker({
  current,
  onPick,
}: {
  current: Scope | undefined;
  onPick: (scope: Scope | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const eff = current;
  const color = eff ? SCOPE_COLORS[eff] : "transparent";
  const border = eff ? SCOPE_COLORS[eff] : "#c8d6c0";
  const title = eff ? `${SCOPE_LABELS[eff]} — לחץ לשינוי` : "הגדר סיווג";

  const opts: { key: Scope | undefined; label: string; color: string }[] = [
    { key: undefined, label: "פרטי", color: SCOPE_COLORS.personal },
    { key: "business", label: "עסקי", color: SCOPE_COLORS.business },
    { key: "mixed", label: "מעורב", color: SCOPE_COLORS.mixed },
  ];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full transition-all hover:scale-110"
        style={{ background: color, border: `1.5px solid ${border}` }}
        title={title}
        aria-label={title}
      />
      {open && (
        <div
          className="absolute right-0 top-5 z-20 flex flex-col gap-0.5 rounded-lg bg-white p-1 shadow-lg"
          style={{ border: "1px solid #eef2e8", minWidth: "100px" }}
        >
          {opts.map((opt) => {
            const isActive = (eff ?? undefined) === opt.key || (opt.key === undefined && !eff);
            return (
              <button
                key={opt.label}
                onClick={() => {
                  onPick(opt.key);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-right text-[11px] font-bold transition-colors hover:bg-[#f4f7ed]"
                style={{ color: "#012d1d" }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: opt.color,
                    border: isActive ? `2px solid ${opt.color}` : `1px solid ${opt.color}80`,
                    outline: isActive ? "1px solid #012d1d" : "none",
                    outlineOffset: "1px",
                  }}
                />
                <span className="flex-1 text-right">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
