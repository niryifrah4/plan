/**
 * ═══════════════════════════════════════════════════════════
 *  Retirement Income Engine
 * ═══════════════════════════════════════════════════════════
 *
 * Converts the holistic capital TRAJECTORY (in `dashboard/page.tsx`) into
 * a MONTHLY-INCOME trajectory over the same age axis. This is "the heart
 * of the heart": every change in the system ripples through — change
 * retirement age, mortgage payoff moves, property added, pension balance
 * updates — and the income picture reflows.
 *
 * Layered model (each layer = one horizontal band on the chart):
 *   1. Pension annuity         corpus ÷ weighted conversionFactor, starts at retirementAge
 *   2. Real-estate net rent    per-property, with jump when mortgage ends
 *   3. Liquid SWR drawdown     (liquid × SWR) / 12, continuous
 *   4. Study fund (hishtalmut) one-shot withdrawal at age 60, annuitized over 10 years
 *   5. Bituach Leumi (BTL)     flat monthly from statutory age (67 default)
 *   6. Manual streams          side business / inheritance / special pension (Stage 5)
 *
 * All figures in today's shekels unless otherwise noted.
 */

import type { TrajectoryPoint } from "./fire-calculator";
import type { Property } from "./realestate-store";
import type { PensionFund } from "./pension-store";
import type { Assumptions } from "./assumptions";
import type { MortgageData } from "./debt-store";
import { scopedKey } from "./client-scope";

/** One age bucket with every income layer broken out. */
export interface IncomePoint {
  age: number;
  year: number;
  /** Pension annuity (קצבת פנסיה) — corpus ÷ conversion factor. */
  pension: number;
  /** Liquid portfolio SWR withdrawal. */
  liquidSWR: number;
  /** Real estate net rent, AFTER mortgage payoff events. */
  realestateNet: number;
  /** Study fund (קרן השתלמות) annuitized withdrawal. */
  hishtalmut: number;
  /** Bituach Leumi old-age allowance. */
  btl: number;
  /** Manual streams (placeholder until Stage 5). */
  manual: number;
  /** Sum of all layers. */
  total: number;
}

export interface IncomeStreamResult {
  points: IncomePoint[];
  /** Target income from questionnaire (`retire_income`), 0 if unset. */
  targetMonthly: number;
  /** Gap at retirementAge (target − total). Positive = shortfall. */
  gapAtRetirement: number;
  /** Average gap across retirement years (retirementAge → 90). */
  gapAverage: number;
  /** Key events for annotation on the chart. */
  events: IncomeEvent[];
}

export interface IncomeEvent {
  age: number;
  year: number;
  kind: "retirement" | "btl_start" | "hishtalmut" | "mortgage_payoff";
  label: string;
}

/* ═══════════ Helpers ═══════════ */

/** Weighted-average conversion factor across pension funds (balance-weighted). */
export function weightedConversionFactor(funds: PensionFund[], fallback = 200): number {
  const pensionOnly = funds.filter((f) => f.type === "pension" || f.type === "bituach");
  const totalBal = pensionOnly.reduce((s, f) => s + (f.balance || 0), 0);
  if (totalBal <= 0) return fallback;
  return (
    pensionOnly.reduce((s, f) => s + (f.balance || 0) * (f.conversionFactor || fallback), 0) /
    totalBal
  );
}

/** Sum of hishtalmut balances across funds. */
export function hishtalmutBalance(funds: PensionFund[]): number {
  return funds.filter((f) => f.type === "hishtalmut").reduce((s, f) => s + (f.balance || 0), 0);
}

/**
 * For each investment/commercial property, compute its net monthly rent
 * and the AGE at which its mortgage is fully paid off (derived from
 * mortgageBalance ÷ monthlyMortgage). Residence properties are skipped —
 * they generate no rent.
 */
interface PropertyRentModel {
  name: string;
  /** Net rent while mortgage is active: rent − expenses − mortgage. */
  rentWithMortgage: number;
  /** Net rent after payoff: rent − expenses (mortgage drops). */
  rentAfterPayoff: number;
  /** Client age at which the mortgage on this property is paid off. */
  payoffAge: number | null;
}

export function buildPropertyRentModels(
  properties: Property[],
  currentAge: number
): PropertyRentModel[] {
  return properties
    .filter((p) => p.type === "investment" || p.type === "commercial")
    .map((p) => {
      const rent = p.monthlyRent ?? 0;
      const expenses = p.monthlyExpenses ?? 0;
      const mortgage = p.monthlyMortgage ?? 0;
      const balance = p.mortgageBalance ?? 0;

      // Payoff age — derived from balance ÷ monthly (under-estimate: ignores
      // interest; this is the same simplification used in onboarding-sync).
      // Null if there's no mortgage or we can't compute.
      let payoffAge: number | null = null;
      if (mortgage > 0 && balance > 0) {
        const monthsLeft = balance / mortgage;
        payoffAge = currentAge + monthsLeft / 12;
      }

      return {
        name: p.name || "נכס השקעה",
        rentWithMortgage: Math.max(0, rent - expenses - mortgage),
        rentAfterPayoff: Math.max(0, rent - expenses),
        payoffAge,
      };
    });
}

/** Net real-estate rent for a given age, summed across all investment properties. */
function realestateNetAtAge(models: PropertyRentModel[], age: number): number {
  return models.reduce((s, m) => {
    const paidOff = m.payoffAge !== null && age >= m.payoffAge;
    return s + (paidOff ? m.rentAfterPayoff : m.rentWithMortgage);
  }, 0);
}

/**
 * Mortgage payoff age from primary residence (debt-store) — used as a fallback
 * when the user has a mortgage but no investment property to anchor it.
 */
export function mortgagePayoffAgeFromDebt(
  mortgage: MortgageData | undefined,
  currentAge: number
): number | null {
  if (!mortgage || !mortgage.tracks?.length) return null;
  // Track with the furthest end-date governs overall payoff.
  const maxEnd = mortgage.tracks.reduce((m, t) => {
    if (!t.endDate) return m;
    const [y, mo] = t.endDate.split("-").map(Number);
    const key = y * 12 + (mo - 1);
    return Math.max(m, key);
  }, 0);
  if (maxEnd === 0) return null;
  const now = new Date();
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  const monthsUntil = maxEnd - nowKey;
  return currentAge + monthsUntil / 12;
}

/* ═══════════ Main engine ═══════════ */

export function computeMonthlyIncomeTrajectory(
  trajectory: TrajectoryPoint[],
  assumptions: Assumptions,
  opts: {
    properties?: Property[];
    pensionFunds?: PensionFund[];
    mortgage?: MortgageData;
    /** Statutory BTL age — defaults to 67. */
    btlAge?: number;
    /** Client's desired monthly income in retirement (from questionnaire retire_income). */
    targetMonthly?: number;
    /** Override pension conversion factor; otherwise computed from funds. */
    pensionConversionFactor?: number;
  } = {}
): IncomeStreamResult {
  const properties = opts.properties ?? [];
  const funds = opts.pensionFunds ?? [];
  const btlAge = opts.btlAge ?? 67;
  const swr = assumptions.safeWithdrawalRate ?? 0.04;
  const retirementAge = assumptions.retirementAge ?? 67;

  const factor = opts.pensionConversionFactor ?? weightedConversionFactor(funds);
  const hishtalmutInitial = hishtalmutBalance(funds);
  // Study fund: treat as lump withdrawn at 60, annuitized over 10 years.
  // Real clients often roll it over — this is a conservative default.
  const hishtalmutMonthly = hishtalmutInitial / (10 * 12);
  // Withdrawal window: starts at age 60 OR at retirement (whichever is later —
  // a 55yo early retiree can't touch it before 60), spans 10 years forward.
  const hishtalmutStart = Math.max(60, retirementAge);
  const hishtalmutEnd = hishtalmutStart + 10;

  const rentModels = buildPropertyRentModels(properties, assumptions.currentAge);

  const points: IncomePoint[] = trajectory.map((p) => {
    // ── Single gate: this is "monthly income IN RETIREMENT", not "passive income over time".
    // Every layer except BTL (which has its own statutory age) is zeroed before retirementAge —
    // otherwise the chart shows phantom SWR withdrawals during the accumulation phase.
    const retired = p.age >= retirementAge;

    const pension = retired && p.pension > 0 ? p.pension / factor : 0;
    const liquidSWR = retired ? (p.liquid * swr) / 12 : 0;
    const realestateNet = retired ? realestateNetAtAge(rentModels, p.age) : 0;
    const hishtalmut = p.age >= hishtalmutStart && p.age < hishtalmutEnd ? hishtalmutMonthly : 0;
    // BTL has its own statutory age — survives even if someone retires at 62
    const btl = p.age >= btlAge ? (assumptions.oldAgeAllowanceMonthly ?? 0) : 0;
    const manual = 0; // Stage 5 hook-up point.
    return {
      age: p.age,
      year: p.year,
      pension,
      liquidSWR,
      realestateNet,
      hishtalmut,
      btl,
      manual,
      total: pension + liquidSWR + realestateNet + hishtalmut + btl + manual,
    };
  });

  /* ── Events for chart annotation ──
     Robustness: age matches use Math.round — protects against non-integer
     retirement ages (e.g. 67.5) that would silently fail a strict equality.
     `findClosest` falls back to the nearest point within ±1 year if no exact match. */
  const findClosest = (targetAge: number) => {
    const rounded = Math.round(targetAge);
    return (
      points.find((p) => p.age === rounded) ?? points.find((p) => Math.abs(p.age - rounded) <= 1)
    );
  };
  const events: IncomeEvent[] = [];
  const retirePt = findClosest(retirementAge);
  if (retirePt) {
    events.push({
      age: retirePt.age,
      year: retirePt.year,
      kind: "retirement",
      label: `פרישה · גיל ${retirementAge}`,
    });
  }
  const btlPt = findClosest(btlAge);
  if (btlPt && Math.round(btlAge) !== Math.round(retirementAge)) {
    events.push({
      age: btlPt.age,
      year: btlPt.year,
      kind: "btl_start",
      label: `ביטוח לאומי · גיל ${btlAge}`,
    });
  }
  if (hishtalmutInitial > 0) {
    const hPt = findClosest(hishtalmutStart);
    if (hPt) {
      events.push({
        age: hPt.age,
        year: hPt.year,
        kind: "hishtalmut",
        label: `קרן השתלמות · גיל ${hishtalmutStart}`,
      });
    }
  }
  rentModels.forEach((m) => {
    if (m.payoffAge === null) return;
    const intAge = Math.round(m.payoffAge);
    const pt = points.find((p) => p.age === intAge);
    if (!pt) return;
    events.push({
      age: intAge,
      year: pt.year,
      kind: "mortgage_payoff",
      label: `סיום משכנתא · ${m.name}`,
    });
  });

  /* ── Gap metrics ── */
  const targetMonthly = opts.targetMonthly ?? 0;
  const gapAtRetirement = targetMonthly > 0 && retirePt ? targetMonthly - retirePt.total : 0;
  const retirementYears = points.filter((p) => p.age >= retirementAge && p.age <= 90);
  // gapAverage = target − mean(total). Explicit parens so the precedence of
  // `-` vs `/` is obvious at a glance (they don't matter here, both work).
  const gapAverage =
    targetMonthly > 0 && retirementYears.length > 0
      ? targetMonthly - retirementYears.reduce((s, p) => s + p.total, 0) / retirementYears.length
      : 0;

  return {
    points,
    targetMonthly,
    gapAtRetirement,
    gapAverage,
    events,
  };
}

/**
 * Parse `retire_income` from onboarding fields. Questionnaire stores it in
 * `verdant:onboarding:fields` under key "retire_income". This reads it
 * directly without requiring the caller to know the storage layout.
 */
export function loadTargetRetirementIncome(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(scopedKey("verdant:onboarding:fields"));
    if (!raw) return 0;
    const fields = JSON.parse(raw);
    return parseFloat(fields.retire_income) || 0;
  } catch {
    return 0;
  }
}
