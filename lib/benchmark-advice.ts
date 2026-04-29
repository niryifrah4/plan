/**
 * Benchmark advisory engine — generates short, conditional nudges based on
 * the family's age, savings rate, asset mix, and risk tolerance.
 *
 * Built 2026-04-29 per Nir: "המערכת מודדת אבל לא מייעצת". This is the first
 * pass — 8 rules covering the most common gaps an Israeli CFP would surface
 * in a 1st meeting. Each nudge is short, actionable, and tied to a page.
 *
 * Inputs: read straight from the live stores so any page can call this
 * cheaply. Outputs: ranked array — most important first.
 */

import { loadAssumptions } from "./assumptions";
import { loadAccounts, totalBankBalance } from "./accounts-store";
import { loadPensionFunds } from "./pension-store";
import { loadSecurities, totalSecuritiesValue } from "./securities-store";
import { loadProperties } from "./realestate-store";
import { loadBuckets } from "./buckets-store";
import { loadDebtData } from "./debt-store";
import { fmtILS } from "./format";

export interface Nudge {
  id: string;
  severity: "critical" | "warning" | "info" | "opportunity";
  icon: string;       // material-symbols name
  title: string;      // short headline
  detail: string;     // 1-2 sentence why
  href?: string;      // page to act on it
  rank: number;       // higher = more urgent
}

function ageBucket(age: number): "young" | "mid" | "preretire" | "retired" {
  if (age >= 67) return "retired";
  if (age >= 55) return "preretire";
  if (age >= 35) return "mid";
  return "young";
}

/** Recommended savings rate by age (Israeli rules of thumb). */
function recommendedSavingsRate(age: number): number {
  // 25 → 10%, 35 → 15%, 45 → 20%, 55 → 25%
  if (age >= 55) return 25;
  if (age >= 45) return 20;
  if (age >= 35) return 15;
  return 10;
}

export function buildNudges(): Nudge[] {
  if (typeof window === "undefined") return [];

  const a = loadAssumptions();
  const accounts = loadAccounts();
  const pensions = loadPensionFunds();
  const securities = loadSecurities();
  const properties = loadProperties();
  const buckets = loadBuckets();
  const debt = loadDebtData();

  const age = a.currentAge || 0;
  const monthlyIncome = a.monthlyIncome || 0;
  const monthlyExpenses = a.monthlyExpenses || 0;
  const cashTotal = totalBankBalance(accounts);
  const securitiesTotal = totalSecuritiesValue(securities);
  const pensionTotal = pensions.reduce((s, f) => s + (f.balance || 0), 0);
  const reEquity = properties.reduce((s, p) => s + Math.max(0, (p.currentValue || 0) - (p.mortgageBalance || 0)), 0);

  const nudges: Nudge[] = [];

  // ── 1. Savings rate vs. age-appropriate target ──
  if (monthlyIncome > 0 && monthlyExpenses > 0 && age > 0) {
    const sr = ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100;
    const target = recommendedSavingsRate(age);
    if (sr < target - 3) {
      nudges.push({
        id: "savings-rate-low",
        severity: sr < target - 8 ? "critical" : "warning",
        icon: "savings",
        title: `שיעור חיסכון ${sr.toFixed(0)}% — נמוך מהמומלץ לגיל ${age}`,
        detail: `בגיל ${age} מקובל לחסוך ${target}%. כל 1% שתעלה = ${fmtILS(Math.round(monthlyIncome * 0.01))}/חודש לפרישה.`,
        href: "/budget",
        rank: 100 - sr,
      });
    }
  }

  // ── 2. Emergency fund coverage ──
  const emergency = buckets.find(b => b.isEmergency);
  if (monthlyExpenses > 0) {
    const monthsOfExpenses = cashTotal / monthlyExpenses;
    if (monthsOfExpenses < 1) {
      nudges.push({
        id: "no-emergency",
        severity: "critical",
        icon: "shield",
        title: "אין כיסוי לחודש אחד של הוצאות",
        detail: `נזיל בעו"ש ${fmtILS(cashTotal)} מול ${fmtILS(monthlyExpenses)}/חודש. כל אירוע בלתי-צפוי = הלוואה.`,
        href: "/goals",
        rank: 95,
      });
    } else if (monthsOfExpenses < 3 && (!emergency || (emergency.currentAmount || 0) < emergency.targetAmount * 0.5)) {
      nudges.push({
        id: "emergency-thin",
        severity: "warning",
        icon: "shield",
        title: `כיסוי חירום ${monthsOfExpenses.toFixed(1)} חודשים בלבד`,
        detail: "המלצה: 3 חודשים מינימום (לזוג עם 2 מפרנסים). 6 חודשים אם יש מפרנס יחיד.",
        href: "/goals",
        rank: 70,
      });
    }
  }

  // ── 3. Heavy loan burden ──
  // Loan schema doesn't carry interestRate; we use the cashflow burden as a
  // proxy. If total monthly loan payments > 30% of income, that's heavy.
  const loans = debt.loans || [];
  const monthlyLoans = loans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  if (monthlyLoans > 0 && monthlyIncome > 0 && monthlyLoans / monthlyIncome > 0.3) {
    nudges.push({
      id: "loan-burden-high",
      severity: "warning",
      icon: "local_fire_department",
      title: `החזרי הלוואות ${Math.round((monthlyLoans / monthlyIncome) * 100)}% מהכנסה`,
      detail: `${fmtILS(monthlyLoans)}/חודש על ${loans.length} הלוואות. שקול מיחזור או פירעון מואץ של ההלוואה היקרה.`,
      href: "/debt",
      rank: 80,
    });
  }

  // ── 4. Pension fees ──
  const totalPenBalance = pensions.reduce((s, f) => s + (f.balance || 0), 0);
  const weightedFee = totalPenBalance > 0
    ? pensions.reduce((s, f) => s + (f.mgmtFeeBalance || 0) * (f.balance || 0), 0) / totalPenBalance
    : 0;
  if (weightedFee > 0.5 && totalPenBalance > 100_000) {
    const annualFeeCost = totalPenBalance * (weightedFee / 100);
    nudges.push({
      id: "pension-fees-high",
      severity: "warning",
      icon: "percent",
      title: `דמי ניהול פנסיה ${weightedFee.toFixed(2)}% — מעל הממוצע`,
      detail: `עלות שנתית ${fmtILS(Math.round(annualFeeCost))}. מסלולי IRA ב-0.3-0.5% חוסכים אלפים לאורך זמן.`,
      href: "/pension",
      rank: 60,
    });
  }

  // ── 5. Cash drag (too much liquid) ──
  if (cashTotal > 0 && monthlyExpenses > 0) {
    const monthsLiquid = cashTotal / monthlyExpenses;
    if (monthsLiquid > 12 && cashTotal > 100_000) {
      nudges.push({
        id: "cash-drag",
        severity: "opportunity",
        icon: "trending_up",
        title: `${fmtILS(cashTotal)} בעו"ש — מעבר ל-12 חודשי הוצאה`,
        detail: `הסכום הזה מאבד 2-3% לאינפלציה כל שנה. שקול קרן כספית, אג״ח קצר, או הגדלת הפקדה לתיק.`,
        href: "/investments",
        rank: 50,
      });
    }
  }

  // ── 6. No retirement savings (age-aware) ──
  if (age >= 30 && pensionTotal === 0) {
    nudges.push({
      id: "no-pension",
      severity: "critical",
      icon: "elderly",
      title: "אין צבירה פנסיונית רשומה",
      detail: `בגיל ${age} צריכה להיות צבירה משמעותית. העלה דוח Mislaka כדי לראות מה יש.`,
      href: "/pension",
      rank: 90,
    });
  }

  // ── 7. Risk-tolerance mismatch ──
  if (a.riskTolerance && totalPenBalance > 0) {
    // Rough: if most pension is in "מסלול כללי" (treated as moderate) but
    // the user is "aggressive" → suggest equity track. The opposite (user
    // is conservative but pension is equity-heavy) — flag too.
    const aggressiveTrack = pensions.filter(f => /מנייתי|אגרסיבי|stock|equity/i.test(f.track || "")).length;
    const conservativeTrack = pensions.filter(f => /אג["׳]ח|שמרני|conservative|bonds?/i.test(f.track || "")).length;
    const isAggUser = a.riskTolerance === "aggressive";
    const isConsUser = a.riskTolerance === "conservative";
    if (isAggUser && aggressiveTrack === 0 && pensions.length > 0) {
      nudges.push({
        id: "risk-too-conservative",
        severity: "info",
        icon: "tune",
        title: "הצהרת על סיכון אגרסיבי, אבל המסלולים הפנסיוניים שמרניים",
        detail: "מסלול מנייתי מתאים לטווח של 15+ שנים לפרישה. שקול שינוי מסלול.",
        href: "/pension",
        rank: 40,
      });
    }
    if (isConsUser && aggressiveTrack > 0 && conservativeTrack === 0) {
      nudges.push({
        id: "risk-too-aggressive",
        severity: "warning",
        icon: "tune",
        title: "הצהרת על סיכון שמרני, אבל המסלולים מנייתיים",
        detail: "ירידה של 30% בשוק = שחיקה משמעותית. שקול מעבר למסלול מאוזן או אג״חי.",
        href: "/pension",
        rank: 65,
      });
    }
  }

  // ── 8. RE concentration ──
  const totalNetWorth = cashTotal + securitiesTotal + pensionTotal + reEquity;
  if (totalNetWorth > 0 && reEquity / totalNetWorth > 0.7) {
    nudges.push({
      id: "re-concentration",
      severity: "info",
      icon: "home",
      title: `${Math.round((reEquity / totalNetWorth) * 100)}% מההון בנדל״ן — ריכוזיות גבוהה`,
      detail: "פיזור בריא: 50-60% נדל״ן, השאר בני״ע ופנסיה. שווה לשקול הוספת תיק השקעות.",
      href: "/investments",
      rank: 30,
    });
  }

  return nudges.sort((a2, b2) => b2.rank - a2.rank);
}
