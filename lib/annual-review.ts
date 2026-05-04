/**
 * Annual review engine — "the strategic brain".
 *
 * Built 2026-04-29 per Nir's killer-feature brief: at year-end the user
 * enters real numbers; the system compares to the original forecast and
 * recommends what to do with any surplus.
 *
 * Storage: every snapshot is a stand-alone record so we can show a
 * year-over-year history. The `forecast` block captures what the system
 * THOUGHT would happen, the `actual` block captures what actually did.
 */

import { scopedKey } from "./client-scope";
// fireSync used a typed SyncEvent enum; for this new event we dispatch via window directly.
import { loadAccounts, totalBankBalance } from "./accounts-store";
import { loadPensionFunds } from "./pension-store";
import { loadSecurities, totalSecuritiesValue } from "./securities-store";
import { loadProperties } from "./realestate-store";
import { loadBuckets } from "./buckets-store";
import { loadAssumptions } from "./assumptions";
import { getTotalLiabilities } from "./debt-store";

export interface AnnualSnapshot {
  /** Calendar year — e.g. 2026. */
  year: number;
  /** ISO timestamp when the user submitted this snapshot. */
  recordedAt: string;
  /** Income & expense totals (₪/year). */
  actualAnnualIncome: number;
  actualAnnualExpenses: number;
  /** Net worth at year-end. */
  actualNetWorth: number;
  /** Sum of contributions made over the year (across all buckets). */
  actualContributions: number;
  /** What the model predicted last year for THIS year (filled in at recordedAt
   *  by snapshotting current assumptions/trajectory). */
  forecastNetWorth: number;
  forecastIncome: number;
  forecastExpenses: number;
  forecastReturnPct: number;
  /** User notes for this year. */
  notes?: string;
}

export interface AnnualVerdict {
  /** Surplus from outperformance (returns > forecast) — ₪ for the year. */
  excessReturn: number;
  /** Surplus from underspend (expenses < forecast) — ₪. */
  expenseSurplus: number;
  /** Total free cash created vs the plan (excessReturn + expenseSurplus). */
  totalSurplus: number;
  /** Headline message: positive ("יש לך עודף …") / negative ("פיגרת …"). */
  headline: string;
  /** Top recommendation — most impactful redeployment of the surplus. */
  recommendation: string | null;
  /** Names of buckets this surplus could shorten by 12+ months. */
  fastTrackedGoals: string[];
}

const SNAPSHOTS_KEY = "verdant:annual_snapshots";
export const ANNUAL_REVIEW_EVENT = "verdant:annual_review:updated";

export function loadAnnualSnapshots(): AnnualSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(SNAPSHOTS_KEY));
    if (raw) return JSON.parse(raw) as AnnualSnapshot[];
  } catch {}
  return [];
}

function saveSnapshots(snaps: AnnualSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(SNAPSHOTS_KEY), JSON.stringify(snaps));
  } catch {}
  try {
    window.dispatchEvent(new Event(ANNUAL_REVIEW_EVENT));
  } catch {}
}

/** Compute the "forecast" inputs for a given snapshot using whatever the
 *  system currently models — net worth + income + expenses + assumed return. */
export function captureCurrentForecast(): Pick<
  AnnualSnapshot,
  "forecastNetWorth" | "forecastIncome" | "forecastExpenses" | "forecastReturnPct"
> {
  const a = loadAssumptions();
  const accounts = loadAccounts();
  const pensions = loadPensionFunds();
  const securities = loadSecurities();
  const props = loadProperties();

  const cash = totalBankBalance(accounts);
  const securitiesTotal = totalSecuritiesValue(securities);
  const pensionTotal = pensions.reduce((s, f) => s + (f.balance || 0), 0);
  const reTotal = props.reduce((s, p) => s + (p.currentValue || 0), 0);
  const reMortgage = props.reduce((s, p) => s + (p.mortgageBalance || 0), 0);
  const liabilities = getTotalLiabilities() + reMortgage;

  const currentNW = cash + securitiesTotal + pensionTotal + reTotal - liabilities;
  // Naive 1y projection — last year's NW × (1 + assumed real return).
  // Use the average of pension + invest as a simple blended figure.
  const expectedReturn = ((a.expectedReturnPension ?? 0.05) + (a.expectedReturnInvest ?? 0.06)) / 2;

  return {
    forecastNetWorth: Math.round(currentNW * (1 + expectedReturn)),
    forecastIncome: (a.monthlyIncome || 0) * 12,
    forecastExpenses: (a.monthlyExpenses || 0) * 12,
    forecastReturnPct: Math.round(expectedReturn * 1000) / 10,
  };
}

/**
 * Save a year-end snapshot. If a snapshot for the same year already exists,
 * it gets replaced (we trust the latest data the user provided).
 */
export function recordAnnualSnapshot(input: Omit<AnnualSnapshot, "recordedAt">): AnnualSnapshot {
  const snap: AnnualSnapshot = { ...input, recordedAt: new Date().toISOString() };
  const all = loadAnnualSnapshots().filter((s) => s.year !== snap.year);
  all.push(snap);
  all.sort((a, b) => a.year - b.year);
  saveSnapshots(all);
  return snap;
}

/**
 * Analyze a snapshot and return a recommendation. Compares actual vs forecast,
 * detects surplus, and proposes redeployment toward the closest active goal.
 */
export function analyzeSnapshot(snap: AnnualSnapshot): AnnualVerdict {
  const excessReturn = Math.max(0, snap.actualNetWorth - snap.forecastNetWorth);
  const expenseSurplus = Math.max(0, snap.forecastExpenses - snap.actualAnnualExpenses);
  const totalSurplus = excessReturn + expenseSurplus;

  // Headline message
  let headline: string;
  if (totalSurplus > 0) {
    const parts: string[] = [];
    if (excessReturn > 0) parts.push(`תשואה עודפת ${fmt(excessReturn)}`);
    if (expenseSurplus > 0) parts.push(`חיסכון בהוצאות ${fmt(expenseSurplus)}`);
    headline = `יש לך עודף של ${fmt(totalSurplus)} (${parts.join(" + ")}).`;
  } else if (snap.actualNetWorth < snap.forecastNetWorth) {
    headline = `פיגור של ${fmt(snap.forecastNetWorth - snap.actualNetWorth)} מהתחזית.`;
  } else {
    headline = "השנה התנהלה לפי התכנון.";
  }

  // Recommendation — find the highest-priority active bucket that the
  // surplus could meaningfully shorten.
  const buckets = loadBuckets()
    .filter((b) => !b.archived)
    .filter((b) => (b.targetAmount || 0) > (b.currentAmount || 0));

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  buckets.sort((a, b) => (rank[a.priority] || 1) - (rank[b.priority] || 1));

  let recommendation: string | null = null;
  const fastTracked: string[] = [];

  if (totalSurplus > 0 && buckets.length > 0) {
    const target = buckets[0];
    const gap = target.targetAmount - (target.currentAmount || 0);
    if (gap > 0 && totalSurplus >= gap * 0.2) {
      recommendation = `נצל עודף ${fmt(totalSurplus)} כדי לזרז את "${target.name}" (חסר ${fmt(gap)}).`;
    } else if (gap > 0) {
      recommendation = `הפנה עודף ${fmt(totalSurplus)} ל-"${target.name}" כתוספת חד-פעמית.`;
    }

    // Identify goals where the surplus reduces remaining months by 12+
    for (const b of buckets) {
      const monthly = b.monthlyContribution || 0;
      if (monthly <= 0) continue;
      const gap2 = b.targetAmount - (b.currentAmount || 0);
      if (gap2 <= 0) continue;
      const monthsBefore = Math.ceil(gap2 / monthly);
      const monthsAfter = Math.ceil(Math.max(0, gap2 - totalSurplus) / monthly);
      if (monthsBefore - monthsAfter >= 12) fastTracked.push(b.name);
    }
  } else if (totalSurplus > 0) {
    recommendation = `העברת העודף ל-/goals — הוסף יעד חיים חדש או הגדל קרן חירום.`;
  } else if (snap.actualNetWorth < snap.forecastNetWorth) {
    recommendation = `הפיגור משמעותי. שקול הקטנת הוצאות או הגדלת הפקדות החודש הבא.`;
  }

  return {
    excessReturn,
    expenseSurplus,
    totalSurplus,
    headline,
    recommendation,
    fastTrackedGoals: fastTracked,
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
}
