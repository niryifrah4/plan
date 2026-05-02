/**
 * Family roadmap — 20-year timeline of life events and net worth.
 *
 * Built 2026-05-02 per Nir. Aggregates kids events (bar mitzvah, army),
 * goal target dates, mortgage payoff, retirement, and projects net worth
 * along the timeline.
 *
 * Display side renders this on /roadmap with one event per row + a small
 * net-worth projection sparkline.
 */

import { loadAssumptions } from "./assumptions";
import { loadBuckets } from "./buckets-store";
import { loadDebtData } from "./debt-store";
import { loadAccounts, totalBankBalance } from "./accounts-store";
import { loadPensionFunds } from "./pension-store";
import { loadSecurities, totalSecuritiesValue } from "./securities-store";
import { loadProperties } from "./realestate-store";
import { scopedKey } from "./client-scope";

export interface RoadmapEvent {
  /** Calendar year (e.g. 2028). */
  year: number;
  /** Months from today — for sorting + sparkline alignment. */
  monthsFromNow: number;
  /** Hebrew label, e.g. "בר מצווה לרני" */
  label: string;
  /** Material symbol icon. */
  icon: string;
  /** Optional cost / impact in ₪ (positive = expense, negative = freed cash). */
  amount?: number;
  /** Free-text note. */
  detail?: string;
  /** Category for color coding. */
  category: "kid" | "goal" | "debt" | "retirement" | "milestone";
}

export interface RoadmapPoint {
  year: number;
  netWorth: number;
}

export interface FamilyRoadmap {
  events: RoadmapEvent[];
  netWorthSeries: RoadmapPoint[];
  retirementYear: number | null;
  startNetWorth: number;
  endNetWorth: number;
}

interface KidRow { name?: string; dob?: string; gender?: "male" | "female" }

function loadKids(): KidRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey("verdant:onboarding:children"));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function ageOn(dob: string, year: number): number | null {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return year - d.getFullYear();
}

function monthsBetween(target: Date): number {
  const now = new Date();
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
}

export function buildFamilyRoadmap(): FamilyRoadmap {
  if (typeof window === "undefined") {
    return { events: [], netWorthSeries: [], retirementYear: null, startNetWorth: 0, endNetWorth: 0 };
  }

  const a = loadAssumptions();
  const buckets = loadBuckets();
  const debt = loadDebtData();
  const kids = loadKids();
  const accounts = loadAccounts();
  const pensions = loadPensionFunds();
  const securities = loadSecurities();
  const properties = loadProperties();

  const currentYear = new Date().getFullYear();
  const currentAge = a.currentAge || 35;
  const retirementAge = a.retirementAge || 67;
  const retirementYear = currentYear + (retirementAge - currentAge);
  const horizonYear = Math.min(retirementYear + 5, currentYear + 30);

  const events: RoadmapEvent[] = [];

  // ── Kid events ──
  for (const kid of kids) {
    if (!kid.dob || !kid.name) continue;
    const name = kid.name.trim();
    const isFemale = kid.gender === "female";

    // Bar/Bat mitzvah
    const mitzvahAge = isFemale ? 12 : 13;
    const mitzvahYear = new Date(kid.dob).getFullYear() + mitzvahAge;
    if (mitzvahYear >= currentYear && mitzvahYear <= horizonYear) {
      events.push({
        year: mitzvahYear,
        monthsFromNow: monthsBetween(new Date(`${mitzvahYear}-06-01`)),
        label: `${isFemale ? "בת" : "בר"} מצווה ל${name}`,
        icon: "celebration",
        amount: isFemale ? 60_000 : 80_000,
        category: "kid",
      });
    }

    // Army release
    const armyAge = isFemale ? 20 : 21;
    const armyYear = new Date(kid.dob).getFullYear() + armyAge;
    if (armyYear >= currentYear && armyYear <= horizonYear) {
      events.push({
        year: armyYear,
        monthsFromNow: monthsBetween(new Date(`${armyYear}-06-01`)),
        label: `שחרור מהצבא — ${name}`,
        icon: "military_tech",
        amount: 30_000,
        category: "kid",
      });
    }

    // Leaves home (~25)
    const leaveYear = new Date(kid.dob).getFullYear() + 25;
    if (leaveYear >= currentYear && leaveYear <= horizonYear) {
      events.push({
        year: leaveYear,
        monthsFromNow: monthsBetween(new Date(`${leaveYear}-06-01`)),
        label: `${name} עוזב/ת את הבית`,
        icon: "directions_walk",
        amount: -2000 * 12, // saves ₪2K/month going forward
        detail: "פנאי בתקציב המשפחתי",
        category: "kid",
      });
    }
  }

  // ── Goal target dates ──
  for (const b of buckets) {
    if (!b.targetDate || b.archived) continue;
    const yr = new Date(b.targetDate).getFullYear();
    if (yr >= currentYear && yr <= horizonYear) {
      events.push({
        year: yr,
        monthsFromNow: monthsBetween(new Date(b.targetDate)),
        label: b.name,
        icon: b.icon || "flag",
        amount: b.targetAmount,
        category: "goal",
      });
    }
  }

  // ── Mortgage payoff ──
  const mortgageTracks = debt.mortgage?.tracks || [];
  const totalMortgageBalance = mortgageTracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const totalMortgageMonthly = mortgageTracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  if (totalMortgageBalance > 0 && totalMortgageMonthly > 0) {
    const avgRate = mortgageTracks.reduce((s, t) => s + (t.interestRate || 0.05) * (t.remainingBalance || 0), 0) / totalMortgageBalance;
    const r = avgRate / 12;
    const ratio = (totalMortgageBalance * r) / totalMortgageMonthly;
    const monthsLeft = ratio > 0 && ratio < 1 ? Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r)) : 360;
    const payoffYear = currentYear + Math.ceil(monthsLeft / 12);
    if (payoffYear <= horizonYear) {
      events.push({
        year: payoffYear,
        monthsFromNow: monthsLeft,
        label: "סיום מסלול משכנתא",
        icon: "celebration",
        amount: -totalMortgageMonthly * 12, // freed cash per year
        detail: `${Math.round(totalMortgageMonthly)} ₪/חודש מתפנה`,
        category: "debt",
      });
    }
  }

  // ── Retirement ──
  events.push({
    year: retirementYear,
    monthsFromNow: monthsBetween(new Date(`${retirementYear}-01-01`)),
    label: `פרישה — גיל ${retirementAge}`,
    icon: "beach_access",
    detail: "התחלת קצבת זקנה",
    category: "retirement",
  });

  // Sort by year
  events.sort((x, y) => x.monthsFromNow - y.monthsFromNow);

  // ── Net worth projection ──
  // Compute current net worth + project forward year-by-year using assumption returns.
  const cash = totalBankBalance(accounts);
  const securitiesTotal = totalSecuritiesValue(securities);
  const pensionTotal = pensions.reduce((s, f) => s + (f.balance || 0), 0);
  const reTotal = properties.reduce((s, p) => s + (p.currentValue || 0), 0);
  const liabilities = totalMortgageBalance + (debt.loans || []).reduce((s, l) => s + (l.totalPayments || 0) * (l.monthlyPayment || 0) * 0.5, 0);
  const startNetWorth = Math.max(0, cash + securitiesTotal + pensionTotal + reTotal - liabilities);

  const annualReturn = ((a.expectedReturnPension || 0.05) + (a.expectedReturnInvest || 0.07)) / 2;
  const annualSavings = (a.monthlyInvestment || 0) * 12;
  const reAppreciation = 0.03;

  const series: RoadmapPoint[] = [];
  let nw = startNetWorth;
  for (let y = currentYear; y <= horizonYear; y++) {
    series.push({ year: y, netWorth: Math.round(nw) });
    // Apply growth + savings
    nw = nw * (1 + annualReturn * 0.5) // average for blended portfolio
       + reTotal * reAppreciation
       + annualSavings;
  }

  return {
    events: events.slice(0, 30),
    netWorthSeries: series,
    retirementYear,
    startNetWorth,
    endNetWorth: series[series.length - 1]?.netWorth || startNetWorth,
  };
}
