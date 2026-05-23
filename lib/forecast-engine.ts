/**
 * forecast-engine — project the next N months of household cashflow.
 *
 * What goes IN each month:
 *   - Recurring household net salary (primary + spouse)
 *   - Passive income (rental net)
 *   - Annual events with kind === "income" landing on that month
 *
 * What goes OUT each month:
 *   - A variable-expense baseline. We use the user's PLANNED budget
 *     (sum of `BudgetCategory.budget`) — not actuals — because actuals
 *     are unstable and irrelevant for projection. The desktop owns the
 *     plan; the mobile reflects it.
 *   - Debt service: loans that are still active at that month +
 *     installments that haven't ended yet. The "ending" effect is the
 *     ALPHA of the forecast — months after a loan ends drop its
 *     monthly amount. This is exactly the surplus Nir wants surfaced.
 *   - Annual events with kind === "expense" landing on that month.
 *
 * What the engine does NOT do (anti-feature per simplicity philosophy):
 *   - It does not "predict" variable spend will rise/fall — uses planned.
 *   - It does not auto-inflate income — uses today's salary profile.
 *   - It does not roll over surplus from one month to the next.
 */

import { loadBudgets, type BudgetCategory } from "./budget-store";
import {
  loadDebtData,
  isLoanActive,
  type Loan,
  type Installment,
  type MortgageTrack,
  getAllMortgageTracks,
} from "./debt-store";
import { householdNetSalary } from "./salary-engine";
import { getPassiveIncomeSummary } from "./passive-income";
import { loadAnnualEventsRolling, type AnnualEvent } from "./annual-events-store";

export interface ForecastMonth {
  year: number;
  /** 1–12 */
  month: number;
  monthLabel: string; // "מאי 2026"
  shortLabel: string; // "מאי"
  income: number;
  expenses: number;
  net: number;
  /** Events that fall on this month — used to render the timeline. */
  events: AnnualEvent[];
  /** Helpful annotations for the "events list" view. */
  notes: ForecastNote[];
}

export interface ForecastNote {
  /** "loan_ending" / "installment_ending" / "event_income" / "event_expense" */
  kind:
    | "loan_ending"
    | "installment_ending"
    | "event_income"
    | "event_expense";
  amount: number;
  label: string;
}

const HEBREW_MONTH_NAMES = [
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

/** Months between two calendar months (a, b). Both objects are {year, month1-12}. */
function monthDiff(
  a: { year: number; month: number },
  b: { year: number; month: number }
): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

function addMonths(d: Date, n: number): { year: number; month: number } {
  const dt = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
}

/**
 * Project the next `monthsAhead` months (inclusive of the current month).
 *
 * Default: 12 months — enough to surface the seasonal events the family
 * forgets about (חגים, חופשות, ארנונה שנתית).
 */
export function projectMonths(monthsAhead = 12): ForecastMonth[] {
  if (typeof window === "undefined") return [];

  // ─── Inputs (computed once) ──────────────────────────────────────
  const baseSalary = householdNetSalary();
  const passive = getPassiveIncomeSummary().totalMonthly;
  const baseIncome = Math.round(baseSalary + passive);

  // Planned variable expense — sum of BudgetCategory.budget.
  const budgets: BudgetCategory[] = (() => {
    try {
      return loadBudgets();
    } catch {
      return [];
    }
  })();
  const baseVariablePlanned = budgets.reduce((s, b) => s + (b.budget || 0), 0);

  const debt = (() => {
    try {
      return loadDebtData();
    } catch {
      return { loans: [], installments: [], mortgages: [] } as ReturnType<typeof loadDebtData>;
    }
  })();

  const activeLoans: Loan[] = debt.loans.filter(isLoanActive);
  const activeInstallments: Installment[] = debt.installments;
  const mortgageTracks: MortgageTrack[] = getAllMortgageTracks(debt);

  const events: AnnualEvent[] = loadAnnualEventsRolling(monthsAhead);

  const now = new Date();
  const out: ForecastMonth[] = [];

  for (let offset = 0; offset < monthsAhead; offset++) {
    const { year, month } = addMonths(now, offset);
    const monthLabel = `${HEBREW_MONTH_NAMES[month - 1]} ${year}`;
    const shortLabel = HEBREW_MONTH_NAMES[month - 1];

    // ─── Income ──────────────────────────────────────
    let income = baseIncome;
    const monthEvents = events.filter(
      (e) => e.year === year && e.month === month
    );
    const incomeEvents = monthEvents.filter((e) => e.kind === "income");
    const expenseEvents = monthEvents.filter((e) => e.kind === "expense");

    income += incomeEvents.reduce((s, e) => s + e.amount, 0);

    // ─── Debt service that's still active in this offset ──────────
    // For loans we know the start date and totalPayments.
    let loansActiveMonthly = 0;
    let loansEndingThisMonth = 0;
    for (const loan of activeLoans) {
      const [yStr, mStr] = (loan.startDate || "").split("-");
      const startYear = Number(yStr);
      const startMonth = Number(mStr);
      if (!Number.isFinite(startYear) || !Number.isFinite(startMonth)) continue;
      const monthsSinceStart = monthDiff(
        { year: startYear, month: startMonth },
        { year, month }
      );
      if (monthsSinceStart < 0) continue;
      const remainingAtMonth = loan.totalPayments - monthsSinceStart;
      if (remainingAtMonth > 0) {
        loansActiveMonthly += loan.monthlyPayment || 0;
        if (remainingAtMonth === 1) {
          loansEndingThisMonth += loan.monthlyPayment || 0;
        }
      }
    }

    // For installments we treat `currentPayment / totalPayments` as the
    // state THIS month, so future months decrement by `offset`.
    let installmentsActiveMonthly = 0;
    let installmentsEndingThisMonth = 0;
    for (const inst of activeInstallments) {
      const remainingNow = inst.totalPayments - inst.currentPayment;
      const remainingAtMonth = remainingNow - offset;
      if (remainingAtMonth > 0) {
        installmentsActiveMonthly += inst.monthlyAmount || 0;
        if (remainingAtMonth === 1) {
          installmentsEndingThisMonth += inst.monthlyAmount || 0;
        }
      }
    }

    // Mortgages don't carry an explicit end date in the current store
    // shape, so we treat them as continuing — closer to reality for
    // 25-30y loans and avoids over-promising surplus in 12mo windows.
    const mortgageMonthly = mortgageTracks.reduce(
      (s, t) => s + (t.monthlyPayment || 0),
      0
    );

    // ─── Expenses ────────────────────────────────────
    let expenses =
      baseVariablePlanned +
      loansActiveMonthly +
      installmentsActiveMonthly +
      mortgageMonthly;
    expenses += expenseEvents.reduce((s, e) => s + e.amount, 0);

    // ─── Notes for the timeline view ─────────────────
    const notes: ForecastNote[] = [];
    if (loansEndingThisMonth > 0) {
      notes.push({
        kind: "loan_ending",
        amount: loansEndingThisMonth,
        label: `סיום הלוואה — ${loansEndingThisMonth.toLocaleString("he-IL")} יתפנו`,
      });
    }
    if (installmentsEndingThisMonth > 0) {
      notes.push({
        kind: "installment_ending",
        amount: installmentsEndingThisMonth,
        label: `סיום עסקת תשלומים — ${installmentsEndingThisMonth.toLocaleString("he-IL")} יתפנו`,
      });
    }
    for (const e of incomeEvents) {
      notes.push({
        kind: "event_income",
        amount: e.amount,
        label: e.label,
      });
    }
    for (const e of expenseEvents) {
      notes.push({
        kind: "event_expense",
        amount: e.amount,
        label: e.label,
      });
    }

    out.push({
      year,
      month,
      monthLabel,
      shortLabel,
      income,
      expenses,
      net: income - expenses,
      events: monthEvents,
      notes,
    });
  }

  return out;
}
