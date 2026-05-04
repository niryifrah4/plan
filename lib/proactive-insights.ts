/**
 * ═══════════════════════════════════════════════════════════
 *  Proactive Insights — "you're losing ₪X/month" engine
 * ═══════════════════════════════════════════════════════════
 *
 * Different from `impact-engine.ts` which is reactive (budget overage
 * → goal delay). This engine is PROACTIVE: scans the client's saved
 * profile and surfaces concrete, quantified tax/optimization gaps.
 *
 * Each insight is a small hypothesis with:
 *   – concrete ₪ impact (monthly or annual)
 *   – a named action the user can take
 *   – a link to the page where the fix lives
 *
 * Principle: if we can't put a shekel figure on it, it's noise.
 * Display only insights with impact ≥ ₪50/month or ₪500/year.
 */

import {
  loadSalaryProfile,
  computeSalaryBreakdown,
  hasSavedSalaryProfile,
  STUDY_FUND_SALARY_CAP,
} from "./salary-engine";
import { section45and47Benefit } from "./assumptions";
import { loadDebtData } from "./debt-store";
import { loadAccounts, totalBankBalance } from "./accounts-store";
import { loadAssumptions } from "./assumptions";
import { deriveMonthlyExpensesFromBudget } from "./budget-store";

export interface ProactiveInsight {
  id: string;
  title: string; // one-line headline with ₪ figure
  detail: string; // 1-2 sentence explanation + action
  monthlyImpact: number; // positive = client gains by acting
  annualImpact: number;
  severity: "critical" | "warning" | "info" | "opportunity";
  icon: string; // material-symbols name
  href?: string; // link to the page where the fix lives
  category: "tax" | "cashflow" | "liquidity" | "debt" | "retirement";
}

/* ── Individual checks ─────────────────────────────────────── */

function checkStudyFundGap(): ProactiveInsight | null {
  if (!hasSavedSalaryProfile()) return null;
  const profile = loadSalaryProfile();
  if (!profile.monthlyGross || profile.studyFundEmployeePct >= 2.5) return null;
  const br = computeSalaryBreakdown(profile);
  if (br.studyFundBenefitGap < 50) return null;
  // Gap is monthly ₪; annual tax value ≈ gap × marginal rate × 12
  const annualValue = Math.round(br.studyFundBenefitGap * br.marginalBracket * 12);
  if (annualValue < 500) return null;
  return {
    id: "study_fund_below_cap",
    title: `אתה מפסיד ${fmt(annualValue)} בשנה על הטבת קרן השתלמות`,
    detail: `הפקדת העובד לקרן השתלמות מתחת ל-2.5% מהתקרה. דבר עם המעסיק על השלמת ההפקדה — זה פטור ממס עד גיל הפרישה.`,
    monthlyImpact: Math.round(annualValue / 12),
    annualImpact: annualValue,
    severity: "opportunity",
    icon: "school",
    href: "/pension",
    category: "tax",
  };
}

function checkStudyFundFringeTax(): ProactiveInsight | null {
  if (!hasSavedSalaryProfile()) return null;
  const br = computeSalaryBreakdown(loadSalaryProfile());
  // Combined monthly cost: income tax (זקיפת שווי) + BL+בריאות on the excess.
  const monthlyCost = br.studyFundFringeTaxMonthly + br.studyFundBLTaxMonthly;
  if (monthlyCost < 50) return null;
  const annual = monthlyCost * 12;
  const capLabel = fmt(STUDY_FUND_SALARY_CAP);
  return {
    id: "study_fund_above_cap",
    title: `אתה משלם ${fmt(annual)} בשנה זקיפת שווי + ביטוח לאומי על קרן השתלמות`,
    detail: `השכר שלך מעל תקרת ${capLabel}. חלק המעסיק מעל התקרה נזקף כהכנסה חייבת (מס שולי) וגם חייב בביטוח לאומי ובריאות (~12%). שקול להגביל את ההפקדה לתקרה.`,
    monthlyImpact: -monthlyCost,
    annualImpact: -annual,
    severity: "warning",
    icon: "warning",
    href: "/pension",
    category: "tax",
  };
}

function checkVoluntaryPensionGap(): ProactiveInsight | null {
  if (!hasSavedSalaryProfile()) return null;
  const profile = loadSalaryProfile();
  if (!profile.monthlyGross) return null;
  const br = computeSalaryBreakdown(profile);
  const voluntaryPct = Math.max(0, profile.pensionEmployeePct - 6);
  const currentVoluntary = profile.monthlyGross * (voluntaryPct / 100);
  const max = section45and47Benefit(profile.monthlyGross, profile.monthlyGross, br.marginalBracket);
  const current = section45and47Benefit(currentVoluntary, profile.monthlyGross, br.marginalBracket);
  const gap = max.totalAnnual - current.totalAnnual;
  if (gap < 500) return null;
  return {
    id: "voluntary_pension_gap",
    title: `אתה מפסיד ${fmt(gap)} בשנה על הטבת סעיפים 45א/47`,
    detail: `הפקדה וולונטרית נוספת לפנסיה/ביטוח חיים מזכה ב-35% זיכוי + 11% ניכוי. מיצוי התקרה (₪${max.maxVoluntaryMonthly}/חודש) יגדיל את ההטבה השנתית שלך.`,
    monthlyImpact: Math.round(gap / 12),
    annualImpact: gap,
    severity: "opportunity",
    icon: "savings",
    href: "/pension",
    category: "retirement",
  };
}

function checkHighMortgageRate(): ProactiveInsight | null {
  const debt = loadDebtData();
  if (!debt.mortgage || !debt.mortgage.tracks?.length) return null;
  const a = loadAssumptions();
  const cheapRate = (a.boiRate ?? 0.045) + 0.015; // prime
  let worstGap = 0;
  let worstPrincipal = 0;
  for (const t of debt.mortgage.tracks) {
    const gap = t.interestRate / 100 - cheapRate;
    if (gap > 0.015 && t.remainingBalance > worstPrincipal * 0.5) {
      // Rough saving: principal × gap × 0.5 (half-life weighted)
      const savings = t.remainingBalance * gap * 0.5;
      if (savings > worstGap) {
        worstGap = savings;
        worstPrincipal = t.remainingBalance;
      }
    }
  }
  if (worstGap < 2000) return null;
  return {
    id: "mortgage_refinance",
    title: `מיחזור משכנתא יכול לחסוך ${fmt(Math.round(worstGap))} לאורך המסלול`,
    detail: `יש לך מסלול במשכנתא שריביתו גבוהה ביותר מ-1.5% מעל הפריים. שווה לבדוק מיחזור מול הבנק.`,
    monthlyImpact: Math.round(worstGap / 120), // approximation
    annualImpact: Math.round(worstGap / 10),
    severity: "warning",
    icon: "home",
    href: "/debt",
    category: "debt",
  };
}

function checkIdleCash(): ProactiveInsight | null {
  const accounts = loadAccounts();
  const cash = totalBankBalance(accounts);
  // Pull live expenses from the budget (the authoritative source after onboarding).
  // Falls back to assumptions only if the budget hasn't been touched yet.
  const a = loadAssumptions();
  const monthlyExpenses = deriveMonthlyExpensesFromBudget(a.monthlyExpenses);
  const monthsOfExpenses = monthlyExpenses > 0 ? cash / monthlyExpenses : 0;
  if (monthsOfExpenses < 9) return null;
  const excess = cash - monthlyExpenses * 6; // keep 6 months as safety net
  if (excess < 50_000) return null;
  // Lost return vs. risk-free (~4.5% today) minus cash (say 2% in checking)
  const lostAnnual = Math.round(excess * 0.025);
  if (lostAnnual < 2_000) return null;
  return {
    id: "idle_cash",
    title: `יש לך עודף נזילות — ${fmt(lostAnnual)}/שנה תשואה מפוספסת`,
    detail: `יש לך כ-${Math.round(monthsOfExpenses)} חודשי הוצאות בעובר ושב. שקול להעביר את העודף (~${fmt(excess)}) לקרן כספית, פק"מ, או תיק השקעות.`,
    monthlyImpact: Math.round(lostAnnual / 12),
    annualImpact: lostAnnual,
    severity: "opportunity",
    icon: "account_balance",
    href: "/investments",
    category: "liquidity",
  };
}

function checkCreditPoints(): ProactiveInsight | null {
  if (!hasSavedSalaryProfile()) return null;
  const profile = loadSalaryProfile();
  if (profile.creditPoints >= 2.25) return null;
  // Each credit point = ₪2,976/year tax saving
  const missing = 2.25 - profile.creditPoints;
  const value = Math.round(missing * 2_976);
  if (value < 1_000) return null;
  return {
    id: "credit_points_low",
    title: `בדוק נקודות זיכוי — ${fmt(value)}/שנה בהישג יד`,
    detail: `מספר נקודות הזיכוי שלך נמוך מהרגיל (${profile.creditPoints}). ודא שמעודכנות נקודות לילדים, תואר, מצב משפחתי, וכדומה.`,
    monthlyImpact: Math.round(value / 12),
    annualImpact: value,
    severity: "opportunity",
    icon: "receipt_long",
    href: "/pension",
    category: "tax",
  };
}

/* ── Aggregate ─────────────────────────────────────────────── */

export function loadProactiveInsights(): ProactiveInsight[] {
  if (typeof window === "undefined") return [];
  const checks: (ProactiveInsight | null)[] = [
    checkStudyFundFringeTax(),
    checkStudyFundGap(),
    checkVoluntaryPensionGap(),
    checkHighMortgageRate(),
    checkIdleCash(),
    checkCreditPoints(),
  ];
  return checks
    .filter((x): x is ProactiveInsight => x !== null)
    .sort((a, b) => Math.abs(b.annualImpact) - Math.abs(a.annualImpact));
}

/** Total annual opportunity surfaced — the headline figure. */
export function totalAnnualOpportunity(insights: ProactiveInsight[]): number {
  return insights.filter((i) => i.annualImpact > 0).reduce((s, i) => s + i.annualImpact, 0);
}

function fmt(v: number): string {
  const abs = Math.abs(Math.round(v));
  return "₪" + abs.toLocaleString("he-IL");
}
