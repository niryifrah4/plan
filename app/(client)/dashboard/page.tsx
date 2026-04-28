"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fmtILS, fmtPct } from "@/lib/format";
import { savingsRate as calcSavingsRate } from "@/lib/financial-math";
import type { CashflowSummary } from "@/types/db";
import { getTotalLiabilities } from "@/lib/debt-store";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import { buildBudgetLines, totalBudget, deriveMonthlyIncomeFromBudget, deriveMonthlyExpensesFromBudget } from "@/lib/budget-store";
import { loadProperties } from "@/lib/realestate-store";
import { loadPensionFunds, EVENT_NAME as PENSION_EVENT } from "@/lib/pension-store";
import { loadAccounts, totalBankBalance, totalCreditCharges, ACCOUNTS_EVENT } from "@/lib/accounts-store";
import { loadSecurities, totalSecuritiesValue } from "@/lib/securities-store";
import { loadKidsSavings, KIDS_SAVINGS_EVENT } from "@/lib/kids-savings-store";
import { loadBuckets, BUCKETS_EVENT, type Bucket } from "@/lib/buckets-store";
import { projectBucket } from "@/lib/buckets-rebalancing";
import { loadAssumptions, savingsRatio } from "@/lib/assumptions";
import {
  loadSalaryProfile,
  computeSalaryBreakdown,
  hasSavedSalaryProfile,
  SALARY_PROFILE_EVENT,
} from "@/lib/salary-engine";
import { computeFireTrajectory } from "@/lib/fire-calculator";
import { computeMonthlyIncomeTrajectory, loadTargetRetirementIncome } from "@/lib/retirement-income";
import { buildTrajectory } from "@/lib/trajectory-builder";
import { loadProactiveInsights, totalAnnualOpportunity, type ProactiveInsight } from "@/lib/proactive-insights";
import type { Assumptions } from "@/lib/assumptions";
import { AssetDonut } from "@/components/charts/AssetDonut";
import { useClient } from "@/lib/client-context";
import { MacroPanel } from "@/components/MacroPanel";
import { syncGoalsToDepositPlans, seedMonth, summaryForMonth, currentMonthKey, DEPOSITS_EVENT } from "@/lib/deposits-store";
import { DepositsWidget } from "@/components/DepositsWidget";
import { scopedKey } from "@/lib/client-scope";
import { SCOPE_COLORS, effectiveScope, type Scope } from "@/lib/scope-types";

const TRACK_COLOR: Record<string, string> = { on: "#1B4332", behind: "#f59e0b", at_risk: "#b91c1c" };
const TRACK_LABEL: Record<string, string> = { on: "בדרך", behind: "בפיגור", at_risk: "בסיכון" };
const GOAL_ICONS: Record<string, string> = {
  "קרן חירום": "savings", "חינוך": "school", "חינוך ילדים": "school",
  "רכב": "directions_car", "דירה": "home", "פרישה": "elderly",
  "פרישה מוקדמת": "elderly", "חתונה": "favorite", "חופשה": "flight_takeoff",
  "עסק": "storefront", "default": "flag",
};

function getGoalIcon(name: string): string {
  for (const [key, icon] of Object.entries(GOAL_ICONS)) {
    if (name.includes(key)) return icon;
  }
  return GOAL_ICONS.default;
}

/** Monthly check-in storage keys */
const CHECKIN_LAST_SHOWN_KEY = "checkin:last_shown";
const CHECKIN_LAST_DISMISSED_KEY = "checkin:last_dismissed";

const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;
const MS_7_DAYS  =  7 * 24 * 60 * 60 * 1000;

/**
 * Returns true only when the user has established data AND the timing gates pass.
 * New clients (no cashflow/budget data yet) always get false.
 */
function shouldShowCheckin(clientHasData: boolean): boolean {
  if (!clientHasData) return false;
  try {
    const now = Date.now();
    const lastShown    = Number(localStorage.getItem(scopedKey(CHECKIN_LAST_SHOWN_KEY))    || 0);
    const lastDismissed = Number(localStorage.getItem(scopedKey(CHECKIN_LAST_DISMISSED_KEY)) || 0);
    if (lastShown    && now - lastShown    < MS_30_DAYS) return false;
    if (lastDismissed && now - lastDismissed < MS_7_DAYS)  return false;
    return true;
  } catch {
    return false;
  }
}

type ChartRange = "ytd" | "1y" | "3y" | "5y" | "10y" | "max";
const CHART_RANGES: { key: ChartRange; label: string }[] = [
  { key: "ytd", label: "YTD" },
  { key: "1y",  label: "שנה" },
  { key: "3y",  label: "3 שנים" },
  { key: "5y",  label: "5 שנים" },
  { key: "10y", label: "10 שנים" },
  { key: "max", label: "מקסימום" },
];

export default function DashboardPage() {
  const { familyName, loading, clientId } = useClient();
  const [reProperties, setReProperties] = useState<ReturnType<typeof loadProperties>>([]);

  // Real cashflow from budget store. Empty array when no real data — never show demo.
  // Stored in state (populated in useEffect) to avoid SSR/client hydration mismatch —
  // server has no localStorage access, so initial render MUST match an empty state.
  const [cashflow, setCashflow] = useState<CashflowSummary[]>([]);

  /** Real savings rate from salary engine (pension+study-fund / gross). null = no salary profile saved. */
  const [salaryRealRate, setSalaryRealRate] = useState<number | null>(null);

  const [pensionFunds, setPensionFunds] = useState<ReturnType<typeof loadPensionFunds>>([]);
  const [accounts, setAccounts] = useState<ReturnType<typeof loadAccounts>>({ banks: [], creditCards: [] });
  const [securitiesTotal, setSecuritiesTotal] = useState(0);
  const [kidsSavingsTotal, setKidsSavingsTotal] = useState(0);
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);

  // Build assets from REAL stores only — no demo fallback. An empty asset
  // group means "user hasn't added anything of that type yet" and should
  // contribute 0, not mask behind demo numbers.
  const assets = useMemo(() => {
    const result: { asset_group: "liquid" | "investments" | "pension" | "realestate" | "kids"; name: string; balance: number }[] = [];

    const liquidTotal = totalBankBalance(accounts);
    if (liquidTotal > 0) {
      result.push({ asset_group: "liquid", name: `נזיל (${accounts.banks.length} חשבונות)`, balance: liquidTotal });
    }

    if (securitiesTotal > 0) {
      result.push({ asset_group: "investments", name: "תיק השקעות", balance: securitiesTotal });
    }

    if (pensionFunds.length > 0) {
      const totalPension = pensionFunds.reduce((s, f) => s + f.balance, 0);
      result.push({ asset_group: "pension", name: `פנסיוני (${pensionFunds.length} קופות)`, balance: totalPension });
    }

    if (reProperties.length > 0) {
      const totalRealEstateValue = reProperties.reduce((s, p) => s + p.currentValue, 0);
      result.push({ asset_group: "realestate", name: `נדל״ן (${reProperties.length} נכסים)`, balance: totalRealEstateValue });
    }

    if (kidsSavingsTotal > 0) {
      result.push({ asset_group: "kids", name: "חיסכון לכל ילד", balance: kidsSavingsTotal });
    }

    return result;
  }, [reProperties, pensionFunds, accounts, securitiesTotal, kidsSavingsTotal]);

  const [realLiab, setRealLiab] = useState(0);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinDismissed, setCheckinDismissed] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>("max");
  /** Nominal = raw future ₪ (gross). Real = today's purchasing power, 25% capital-gains tax on liquid growth. */
  const [displayMode, setDisplayMode] = useState<"nominal" | "real">("nominal");
  /** capital = net-worth mountain. income = monthly retirement income layers. */
  const [viewMode, setViewMode] = useState<"capital" | "income">("capital");
  const [targetRetireIncome, setTargetRetireIncome] = useState(0);
  useEffect(() => { setTargetRetireIncome(loadTargetRetirementIncome()); }, [clientId]);

  useEffect(() => {
    // Auto-sync onboarding data on page load
    syncOnboardingToStores();
    const reload = () => {
      setRealLiab(getTotalLiabilities());
      setAssumptions(loadAssumptions());
      setReProperties(loadProperties());
      setPensionFunds(loadPensionFunds());
      setAccounts(loadAccounts());
      setSecuritiesTotal(totalSecuritiesValue(loadSecurities()));
      setKidsSavingsTotal(loadKidsSavings().reduce((sum, k) => sum + k.currentBalance, 0));

      // Real savings rate from salary engine (only when profile was explicitly saved)
      if (hasSavedSalaryProfile()) {
        setSalaryRealRate(computeSalaryBreakdown(loadSalaryProfile()).realSavingsRate);
      } else {
        setSalaryRealRate(null);
      }

      // Proactive tax/cashflow insights
      setInsights(loadProactiveInsights());

      // Recompute current-month cashflow from budget store + assumptions
      const lines = buildBudgetLines(0);
      const totals = totalBudget(lines);
      const a = loadAssumptions();
      // Live income from the budget (salary + passive + manual); falls back to
      // assumptions only if the budget has no income rows yet.
      const income = deriveMonthlyIncomeFromBudget(a.monthlyIncome || 0);
      if (income <= 0 && totals.actual <= 0) {
        setCashflow([]);
      } else {
        const now = new Date();
        setCashflow([{
          household_id: "household",
          month_id: `m-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          closed: false,
          income_total: income,
          expense_total: totals.actual,
          cashflow_gap: income - totals.actual,
        }]);
      }
    };
    reload();
    window.addEventListener("storage", reload);
    window.addEventListener("verdant:assumptions", reload);
    window.addEventListener("verdant:realestate:updated", reload);
    window.addEventListener("verdant:investments:updated", reload);
    window.addEventListener("verdant:debt:updated", reload);
    window.addEventListener(PENSION_EVENT, reload);
    window.addEventListener(ACCOUNTS_EVENT, reload);
    window.addEventListener(KIDS_SAVINGS_EVENT, reload);
    window.addEventListener(SALARY_PROFILE_EVENT, reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("verdant:assumptions", reload);
      window.removeEventListener("verdant:realestate:updated", reload);
      window.removeEventListener("verdant:investments:updated", reload);
      window.removeEventListener("verdant:debt:updated", reload);
      window.removeEventListener(PENSION_EVENT, reload);
      window.removeEventListener(ACCOUNTS_EVENT, reload);
      window.removeEventListener(KIDS_SAVINGS_EVENT, reload);
      window.removeEventListener(SALARY_PROFILE_EVENT, reload);
    };
  }, [clientId]);

  // Monthly check-in: auto-popup disabled. The check-in is now opt-in from the
  // deposits page (עדכונים והפקדות) — users set their own reminder cadence there.
  // Keeping the modal JSX below so the page can still trigger it manually.

  const dismissCheckin = () => {
    try {
      localStorage.setItem(scopedKey(CHECKIN_LAST_DISMISSED_KEY), String(Date.now()));
    } catch {}
    setShowCheckin(false);
    setCheckinDismissed(true);
  };

  // ── Monthly deposits banner — pulses on the dashboard when there are
  // unconfirmed scheduled deposits for the current month. Dismissible
  // per-month (DEPOSITS_DISMISSED_KEY scoped to YYYY-MM). ──
  const DEPOSITS_DISMISSED_KEY = "verdant:dashboard:deposits_banner_dismissed";
  const [depositsPending, setDepositsPending] = useState({ count: 0, total: 0 });
  const [depositsBannerDismissed, setDepositsBannerDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshDeposits = () => {
      // Sync goal buckets → deposit plans (idempotent), then seed month.
      syncGoalsToDepositPlans(loadBuckets());
      const month = currentMonthKey();
      seedMonth(month);
      const sum = summaryForMonth(month);
      const pending = sum.entries.filter(e => !e.confirmed);
      setDepositsPending({
        count: pending.length,
        total: pending.reduce((s, e) => s + (e.amount || 0), 0),
      });
      const dismissedFor = localStorage.getItem(scopedKey(DEPOSITS_DISMISSED_KEY));
      setDepositsBannerDismissed(dismissedFor === month);
    };
    refreshDeposits();
    window.addEventListener(DEPOSITS_EVENT, refreshDeposits);
    window.addEventListener(BUCKETS_EVENT, refreshDeposits);
    return () => {
      window.removeEventListener(DEPOSITS_EVENT, refreshDeposits);
      window.removeEventListener(BUCKETS_EVENT, refreshDeposits);
    };
  }, []);

  const dismissDepositsBanner = () => {
    try {
      localStorage.setItem(scopedKey(DEPOSITS_DISMISSED_KEY), currentMonthKey());
    } catch {}
    setDepositsBannerDismissed(true);
  };

  const totalAssets = assets.reduce((a, x) => a + x.balance, 0);
  const reMortgageTotal = reProperties.reduce((s, p) => s + (p.mortgageBalance ?? 0), 0);
  const creditCharges = totalCreditCharges(accounts);
  const totalLiabilities = realLiab + reMortgageTotal + creditCharges;
  const netWorthVal = totalAssets - totalLiabilities;
  const latestGap = cashflow[0]?.cashflow_gap ?? 0;
  const latestIncome = cashflow[0]?.income_total ?? 0;
  const latestExpense = cashflow[0]?.expense_total ?? 0;

  // Net worth month-over-month tracking
  const [prevNetWorth, setPrevNetWorth] = useState<number | null>(null);
  useEffect(() => {
    const NW_KEY = "verdant:net_worth_history";
    try {
      const history: { month: string; value: number }[] = JSON.parse(localStorage.getItem(scopedKey(NW_KEY)) || "[]");
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      // Find previous month entry
      const prevMonth = history.filter(h => h.month < currentMonth).sort((a, b) => b.month.localeCompare(a.month))[0];
      if (prevMonth) setPrevNetWorth(prevMonth.value);
      // Save current month
      const existing = history.findIndex(h => h.month === currentMonth);
      if (existing >= 0) history[existing].value = netWorthVal;
      else history.push({ month: currentMonth, value: netWorthVal });
      // Keep last 24 months
      const trimmed = history.sort((a, b) => b.month.localeCompare(a.month)).slice(0, 24);
      localStorage.setItem(scopedKey(NW_KEY), JSON.stringify(trimmed));
    } catch {}
  }, [netWorthVal]);

  // Business/personal cashflow split, read from current month's budget JSON.
  // Returns null when no business rows tagged → widget hidden.
  const [scopeSplit, setScopeSplit] = useState<{ personal: number; business: number } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const compute = () => {
      try {
        const now = new Date();
        const key = `verdant:budget_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
        const raw = localStorage.getItem(scopedKey(key));
        if (!raw) { setScopeSplit(null); return; }
        const data = JSON.parse(raw) as { sections?: Record<string, { budget?: number; actual?: number; scope?: Scope; subItems?: { budget?: number; actual?: number }[] }[]> };
        let personal = 0, business = 0, hasBusiness = false;
        const expSections = ["fixed", "variable"] as const;
        for (const sk of expSections) {
          const rows = data.sections?.[sk] || [];
          for (const r of rows) {
            const subSum = Array.isArray(r.subItems) && r.subItems.length > 0
              ? r.subItems.reduce((s, sub) => s + (Number(sub.budget) || 0), 0)
              : 0;
            const amount = subSum > 0 ? subSum : (Number(r.budget) || 0);
            const eff = effectiveScope(r.scope);
            if (eff === "business") { business += amount; hasBusiness = true; }
            else if (eff === "mixed") { business += amount / 2; personal += amount / 2; hasBusiness = true; }
            else personal += amount;
          }
        }
        setScopeSplit(hasBusiness ? { personal, business } : null);
      } catch { setScopeSplit(null); }
    };
    compute();
    window.addEventListener("storage", compute);
    return () => window.removeEventListener("storage", compute);
  }, []);

  const nwChange = prevNetWorth !== null ? netWorthVal - prevNetWorth : null;
  const nwChangePct = prevNetWorth !== null && prevNetWorth !== 0 ? ((netWorthVal - prevNetWorth) / Math.abs(prevNetWorth)) * 100 : null;

  // Savings Rate — prefer the salary-engine real rate (pension+study-fund / gross)
  // when the user has saved a salary profile; otherwise fall back to budget-derived rate.
  const hasIncomeData = latestIncome > 0 && latestExpense > 0;
  const savingsRate = salaryRealRate !== null
    ? salaryRealRate * 100
    : hasIncomeData
      ? calcSavingsRate(latestIncome, latestIncome - latestGap) * 100
      : 0;
  const savingsLabel = savingsRate >= 20 ? "מעולה" : savingsRate >= 10 ? "טוב" : savingsRate >= 5 ? "סביר" : null;
  const savingsLabelColor = savingsRate >= 20 ? "#1B4332" : savingsRate >= 10 ? "#1B4332" : savingsRate >= 5 ? "#b45309" : "#012d1d";

  // Allocation slices for donut
  const allocationSlices = useMemo(() => {
    const groups: Record<string, { label: string; color: string; total: number }> = {
      liquid: { label: "נזיל", color: "#1B4332", total: 0 },
      investments: { label: "השקעות", color: "#012d1d", total: 0 },
      pension: { label: "פנסיוני", color: "#1e6b3a", total: 0 },
      realestate: { label: "נדל״ן", color: "#2B694D", total: 0 },
      kids: { label: "חיסכון ילדים", color: "#6366f1", total: 0 },
    };
    assets.forEach(a => { if (groups[a.asset_group]) groups[a.asset_group].total += a.balance; });
    return Object.values(groups)
      .filter(g => g.total > 0)
      .map(g => ({ label: g.label, pct: Math.round((g.total / totalAssets) * 100), color: g.color }));
  }, [assets, totalAssets]);

  // Load buckets for summary
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  useEffect(() => {
    setBuckets(loadBuckets());
    const handler = () => setBuckets(loadBuckets());
    window.addEventListener("storage", handler);
    window.addEventListener(BUCKETS_EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(BUCKETS_EVENT, handler);
    };
  }, []);

  const bucketProjections = useMemo(() => buckets.map(b => ({ bucket: b, projection: projectBucket(b) })), [buckets]);
  const totalBucketCurrent = useMemo(() => buckets.reduce((s, b) => s + (b.currentAmount || 0), 0), [buckets]);
  const totalBucketTargetSum = useMemo(() => buckets.reduce((s, b) => s + (b.targetAmount || 0), 0), [buckets]);

  // ─── Holistic growth trajectory: March 2026 → age 100 ───
  // Single source of truth lives in lib/trajectory-builder.ts — shared with /retirement page
  // so both views always reflect the same projection math. Liabilities amortize over 20 years.
  const trajectory = useMemo(() => {
    const a = assumptions || loadAssumptions();
    const liquid = assets.filter(x => x.asset_group === "liquid" || x.asset_group === "investments").reduce((s, x) => s + x.balance, 0);
    const pension = assets.filter(x => x.asset_group === "pension").reduce((s, x) => s + x.balance, 0);
    const realestate = assets.filter(x => x.asset_group === "realestate").reduce((s, x) => s + x.balance, 0);
    return buildTrajectory({
      assumptions: a,
      liquid, pension, realestate,
      liabilitiesToday: totalLiabilities,
    });
  }, [assumptions, assets, totalLiabilities]);

  // ─── FIRE Compass: when does passive income cover monthly expenses? ───
  const fireResult = useMemo(() => {
    const a = assumptions || loadAssumptions();
    // Derive from budget (live) instead of the frozen onboarding seed.
    const monthlyExpenses = deriveMonthlyExpensesFromBudget(a.monthlyExpenses || 0);
    // Weighted-average pension conversion factor across all funds: bigger
    // funds dominate. Fallback 200 matches pension-store default.
    const totalPensionBalance = pensionFunds.reduce((s, f) => s + (f.balance || 0), 0);
    const weightedFactor = totalPensionBalance > 0
      ? pensionFunds.reduce((s, f) => s + (f.balance || 0) * (f.conversionFactor || 200), 0) / totalPensionBalance
      : 200;
    return computeFireTrajectory(trajectory, monthlyExpenses, a.safeWithdrawalRate ?? 0.04, {
      retirementAge: a.retirementAge,
      pensionConversionFactor: weightedFactor,
    });
  }, [assumptions, trajectory, pensionFunds]);

  // Filter trajectory by selected chart range
  const filteredTrajectory = useMemo(() => {
    if (chartRange === "max") return trajectory;
    const now = new Date();
    const currentYear = now.getFullYear();
    let maxYear: number;
    switch (chartRange) {
      case "ytd": maxYear = currentYear; break;
      case "1y":  maxYear = currentYear + 1; break;
      case "3y":  maxYear = currentYear + 3; break;
      case "5y":  maxYear = currentYear + 5; break;
      case "10y": maxYear = currentYear + 10; break;
      default:    return trajectory;
    }
    return trajectory.filter(p => p.year <= maxYear);
  }, [trajectory, chartRange]);

  // Apply display mode (nominal / real-net) on top of filtered trajectory.
  // Real mode: deflate by inflation to today's ₪ AND apply 25% CGT on liquid gains.
  const displayTrajectory = useMemo(() => {
    if (displayMode === "nominal") return filteredTrajectory;
    const a = assumptions || loadAssumptions();
    const inflation = a.inflationRate ?? 0.025;
    const CGT = 0.25;
    const startAge = filteredTrajectory[0]?.age ?? 0;
    return filteredTrajectory.map(p => {
      const yearsIn = Math.max(0, p.age - startAge);
      const deflator = Math.pow(1 + inflation, yearsIn);
      // Tax only the growth portion of liquid (gross - start - contributions)
      const liquidBasis = p.liquidStart + p.liquidContribCum;
      const liquidGrowth = Math.max(0, p.liquid - liquidBasis);
      const liquidNet = liquidBasis + liquidGrowth * (1 - CGT);
      const liquidReal = liquidNet / deflator;
      const pensionReal = p.pension / deflator; // pension taxed at annuity stage — ignored here for simplicity
      const reReal = p.realestate / deflator;
      const total = liquidReal + pensionReal + reReal - (p.total - p.liquid - p.pension - p.realestate) / deflator * 0; // liabilities already amortized in nominal; not double-hit
      return {
        ...p,
        liquid: liquidReal,
        pension: pensionReal,
        realestate: reReal,
        total: liquidReal + pensionReal + reReal + (p.total - p.liquid - p.pension - p.realestate) / deflator,
      };
    });
  }, [filteredTrajectory, displayMode, assumptions]);

  // Monthly income trajectory — Stage 2 engine. Maps capital trajectory → monthly
  // retirement income layers (pension annuity + real-estate net rent + SWR + BTL + hishtalmut).
  const incomeResult = useMemo(() => {
    if (!assumptions) return null;
    return computeMonthlyIncomeTrajectory(filteredTrajectory, assumptions, {
      properties: reProperties,
      pensionFunds,
      btlAge: 67,
      targetMonthly: targetRetireIncome,
    });
  }, [filteredTrajectory, assumptions, reProperties, pensionFunds, targetRetireIncome]);

  // Unified chart data: either the capital mountain (liquid/pension/RE stacked)
  // or the income layers remapped to the same 3-band shape so the SVG renderer
  // below is agnostic to view mode.
  //   Bottom band (RE) : realestateNet
  //   Middle band (pen): pension + hishtalmut + btl
  //   Top band (liq)   : liquidSWR + manual
  const chartData = useMemo(() => {
    if (viewMode === "capital" || !incomeResult) return displayTrajectory;
    return incomeResult.points.map(p => ({
      age: p.age,
      year: p.year,
      month: 12,
      realestate: p.realestateNet,
      pension: p.pension + p.hishtalmut + p.btl,
      liquid: p.liquidSWR + p.manual,
      total: p.total,
    }));
  }, [viewMode, incomeResult, displayTrajectory]);

  // Client-only date string to avoid hydration mismatch
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }, []);

  // Predicted balance for check-in
  const predictedBalance = useMemo(() => {
    const liquid = assets.filter(x => x.asset_group === "liquid").reduce((s, x) => s + x.balance, 0);
    return liquid + latestGap;
  }, [assets, latestGap]);

  // Chart dimensions — extra top padding so "פרישה" label is never clipped
  const CW = 700, CH = 230;
  const CHART_PAD_TOP = 36; // pixels reserved above the highest data point
  const maxNW = Math.max(
    ...chartData.map(t => t.total),
    viewMode === "income" ? targetRetireIncome * 1.15 : 0,
    1,
  );
  // Peak point (retirement or overall maximum)
  const peakPoint = useMemo(() => {
    if (!chartData.length) return null;
    return chartData.reduce((best, p) => p.total > best.total ? p : best, chartData[0]);
  }, [chartData]);
  // Compact ILS formatter for Y-axis ticks. In income mode the numbers are monthly
  // (much smaller scale) — show them without M/K abbreviation for readability.
  const fmtAxis = (v: number) => {
    if (viewMode === "income") {
      if (v >= 1_000) return `₪${Math.round(v / 100) / 10}K`;
      return `₪${Math.round(v)}`;
    }
    if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
    if (v >= 1_000) return `₪${Math.round(v / 1_000)}K`;
    return `₪${v}`;
  };

  return (
    <div className="max-w-5xl mx-auto" style={{ fontFamily: "'Assistant', sans-serif" }}>

      {/* ═══════ Monthly Check-in Popup ═══════ */}
      {showCheckin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(1,45,29,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-organic shadow-soft p-8 max-w-md w-full mx-4" style={{ background: "#fff", border: "2px solid #1B433230" }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#012d1d,#1B4332)" }}>
                <span className="material-symbols-outlined text-[22px] text-white">fact_check</span>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-verdant-ink">בדיקה חודשית</h3>
                <p className="text-[11px] text-verdant-muted font-bold">סטטוס תכנון</p>
              </div>
            </div>

            <div className="rounded-xl p-5 mb-6" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
              <div className="text-[11px] font-bold text-verdant-muted mb-2">יתרת עו״ש צפויה לפי התחזית:</div>
              <div className="text-3xl font-extrabold tabular text-verdant-ink mb-3">{fmtILS(Math.round(predictedBalance))}</div>
              <div className="text-[12px] font-bold text-verdant-ink">האם היתרה בפועל תואמת?</div>
            </div>

            <div className="flex gap-3">
              <button onClick={dismissCheckin}
                className="btn-botanical flex-1 text-[12px]">
                כן, תואם
              </button>
              <button onClick={dismissCheckin}
                className="flex-1 text-[12px] font-bold py-3 rounded-xl transition-shadow hover:shadow-md"
                style={{ background: "#f59e0b15", color: "#b45309", border: "1px solid #f59e0b30" }}>
                לא, יש הפרש
              </button>
              <button onClick={dismissCheckin}
                className="text-[12px] font-bold py-3 px-4 rounded-xl text-verdant-muted hover:bg-verdant-bg transition-colors"
                style={{ background: "#eef2e8" }}>
                דלג
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header removed 2026-04-28 per Nir's request. */}

      {/* ── Monthly deposits banner — gentle nudge to confirm planned deposits ── */}
      {!depositsBannerDismissed && depositsPending.count > 0 && (
        <div
          className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3"
          style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ color: "#92400E" }}>
            fact_check
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-extrabold" style={{ color: "#92400E" }}>
              {depositsPending.count} הפקדות עוד לא אושרו החודש · {fmtILS(depositsPending.total)}
            </div>
            <div className="text-[11px]" style={{ color: "#92400E" }}>
              עבור ל"הפקדות" כדי לאשר ולעדכן יתרות
            </div>
          </div>
          <Link
            href="/deposits"
            className="text-[12px] font-bold px-3 py-1.5 rounded-lg"
            style={{ background: "#92400E", color: "#fff" }}
          >
            לעבור →
          </Link>
          <button
            onClick={dismissDepositsBanner}
            title="דלג עד החודש הבא"
            className="text-[18px] font-bold p-1 rounded hover:bg-amber-200"
            style={{ color: "#92400E" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ═══════ Macro — BoI / Prime / Inflation control ═══════ */}
      <MacroPanel />

      {/* ═══════ Zone 1 + Zone 2 — Two Cards Side by Side ═══════ */}
      <section className="grid grid-cols-2 gap-6 mb-10">

        {/* Zone 1 — Monthly Cashflow */}
        <Link
          href={"/balance" as any}
          className="card-pad group transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="flex items-start gap-3 mb-5">
            <div className="icon-sm icon-forest">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </div>
            <div className="caption pt-2.5">תזרים חודשי</div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 mb-5">
            <div>
              <div className="caption mb-1.5">הכנסות</div>
              <div className="kpi-value">{fmtILS(latestIncome)}</div>
            </div>
            <div>
              <div className="caption mb-1.5">הוצאות</div>
              <div className="kpi-value">{fmtILS(latestExpense)}</div>
            </div>
            <div>
              <div className="caption mb-1.5">יתרה פנויה</div>
              <div className="kpi-value" style={{ color: latestGap >= 0 ? "#1B4332" : "#b91c1c" }}>{fmtILS(latestGap)}</div>
            </div>
            <div>
              <div className="caption mb-1.5">אחוז חיסכון</div>
              <div className="flex items-baseline gap-2">
                {hasIncomeData ? (
                  <>
                    <span className="kpi-value" style={{ color: savingsLabelColor }}>{savingsRate.toFixed(1)}%</span>
                    {savingsLabel && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: savingsRate >= 10 ? "#C1ECD4" : `${savingsLabelColor}15`,
                        color: savingsLabelColor,
                      }}>{savingsLabel}</span>
                    )}
                  </>
                ) : (
                  <span className="kpi-value" style={{ color: "#8aab99" }}>—</span>
                )}
              </div>
            </div>
          </div>

          {/* Savings rate bar */}
          <div className="w-full h-1.5 rounded-full" style={{ background: "#eef2e8" }}>
            <div className="h-full rounded-full transition-all duration-700" style={{
              width: `${Math.min(100, Math.max(0, savingsRate) * 2.5)}%`,
              background: `linear-gradient(90deg, ${savingsLabelColor}, ${savingsLabelColor}cc)`,
            }} />
          </div>

          {/* Business / personal split — only when there's at least one business row */}
          {scopeSplit && (
            <div className="mt-4 pt-3 border-t text-[10px]" style={{ borderColor: "#eef2e8", color: "#5a7a6a" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: SCOPE_COLORS.personal }} />
                  פרטי
                </span>
                <span className="tabular-nums font-bold">{fmtILS(Math.round(scopeSplit.personal))}</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: SCOPE_COLORS.business }} />
                  עסקי
                </span>
                <span className="tabular-nums font-bold">{fmtILS(Math.round(scopeSplit.business))}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "#eef2e8" }}>
                <span className="font-extrabold" style={{ color: "#012d1d" }}>סה״כ</span>
                <span className="tabular-nums font-extrabold" style={{ color: "#012d1d" }}>
                  {fmtILS(Math.round(scopeSplit.personal + scopeSplit.business))}
                </span>
              </div>
            </div>
          )}
        </Link>

        {/* Zone 2 — Net Worth + Donut (Forest Hero) */}
        <Link
          href={"/balance" as any}
          className="card-forest group transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="icon-sm" style={{ background: "rgba(255,255,255,0.08)", color: "#C1ECD4" }}>
                <span className="material-symbols-outlined text-[20px]">insights</span>
              </div>
              <div className="caption">Net Worth · שווי נקי</div>
            </div>
            {nwChange !== null && (
              <span className={`pill ${nwChange >= 0 ? "pill-mint" : "pill-danger"}`}>
                <span className="material-symbols-outlined text-[12px]">
                  {nwChange >= 0 ? "trending_up" : "trending_down"}
                </span>
                {nwChangePct !== null && (<>{nwChangePct >= 0 ? "+" : ""}{nwChangePct.toFixed(1)}%</>)}
              </span>
            )}
          </div>

          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div className="kpi-value tabular" style={{ fontSize: 30, lineHeight: "36px", color: "#FFFFFF" }}>
                {fmtILS(netWorthVal)}
              </div>
              {nwChange !== null && (
                <div className="text-[11px] font-bold tabular mt-1" style={{ color: "rgba(249,250,242,0.55)" }}>
                  {nwChange >= 0 ? "+" : ""}{fmtILS(nwChange)} מהחודש הקודם
                </div>
              )}
              <div className="space-y-2 mt-4">
                <div className="pill-inner flex items-center justify-between">
                  <span className="text-[12px] font-bold" style={{ color: "rgba(249,250,242,0.65)" }}>נכסים</span>
                  <span className="text-[13px] font-extrabold tabular text-white">{fmtILS(totalAssets)}</span>
                </div>
                <div className="pill-inner flex items-center justify-between">
                  <span className="text-[12px] font-bold" style={{ color: "rgba(249,250,242,0.65)" }}>התחייבויות</span>
                  <span className="text-[13px] font-extrabold tabular" style={{ color: "#fca5a5" }}>{fmtILS(totalLiabilities)}</span>
                </div>
              </div>
            </div>

            <div className="w-[130px] shrink-0">
              <AssetDonut slices={allocationSlices} />
            </div>
          </div>
        </Link>
      </section>

      {/* ═══════ Zone 2.5 — Monthly Deposits Widget ═══════ */}
      <section className="mb-10">
        <DepositsWidget />
      </section>

      {/* ═══════ Zone 3 — Growth Chart (Full Width) ═══════ */}
      <section className="card-pad-lg relative overflow-hidden mb-10">
        <div className="relative">
          <div className="flex items-end justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="icon-sm icon-forest">
                <span className="material-symbols-outlined text-[20px]">landscape</span>
              </div>
              <div>
                <div className="caption mb-1">
                  {viewMode === "capital" ? "Wealth Mountain · הר העושר" : "Retirement Income · הכנסה חודשית בפרישה"}
                </div>
                <h3 className="t-lg font-extrabold" style={{ color: "var(--botanical-forest)" }}>
                  {viewMode === "capital" ? "תחזית צמיחה הוליסטית" : "הכנסה חודשית בפרישה"}
                </h3>
                {fireResult.fireAge !== null && fireResult.yearsToFire !== null && fireResult.yearsToFire >= 0 && (
                  <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-extrabold" style={{ background: "#D6EFDC", color: "#1B4332" }}>
                    <span className="material-symbols-outlined text-[14px]" style={{ color: "#2B694D" }}>explore</span>
                    FIRE · חופש כלכלי בגיל {fireResult.fireAge} ({fireResult.fireYear}) · עוד {fireResult.yearsToFire} שנה
                  </div>
                )}
                {fireResult.fireAge === null && fireResult.monthlyExpenses > 0 && (
                  <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-extrabold" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    <span className="material-symbols-outlined text-[14px]">explore_off</span>
                    FIRE · חסרים {fmtILS(Math.round(fireResult.gapToFireCapital))} הון להון עצמאי
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-5">
              {/* Legend — adapts to view mode */}
              <div className="flex gap-4 text-[10px] font-bold text-verdant-muted">
                {viewMode === "capital" ? (
                  <>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#2B694D" }} />נדל&quot;ן</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#012d1d" }} />פנסיוני</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#1B4332" }} />נזיל + השקעות</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#2B694D" }} />שכ&quot;ד נטו</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#012d1d" }} />פנסיה + בט&quot;ל + השתלמות</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#1B4332" }} />משיכה נזילה (SWR)</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Range picker + display-mode toggle + view-mode toggle */}
          <div className="flex flex-wrap gap-3 mb-5 items-center">
            {/* Capital ↔ Income — the "heart of the heart" toggle */}
            <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "rgba(1,45,29,0.04)" }}
              title="הון מצטבר מול הכנסה חודשית בפרישה">
              {[
                { key: "capital", label: "הון" },
                { key: "income",  label: "קצבה חודשית" },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setViewMode(m.key as "capital" | "income")}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    viewMode === m.key
                      ? "bg-white text-verdant-ink shadow-sm"
                      : "text-verdant-muted hover:text-verdant-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "rgba(1,45,29,0.04)" }}>
              {CHART_RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setChartRange(r.key)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    chartRange === r.key
                      ? "bg-white text-verdant-ink shadow-sm"
                      : "text-verdant-muted hover:text-verdant-ink"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "rgba(1,45,29,0.04)" }}
              title="ריאלי = אחרי אינפלציה ומס 25%">
              {[
                { key: "nominal", label: "נומינלי" },
                { key: "real", label: "ריאלי (נטו)" },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setDisplayMode(m.key as "nominal" | "real")}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    displayMode === m.key
                      ? "bg-white text-verdant-ink shadow-sm"
                      : "text-verdant-muted hover:text-verdant-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {displayMode === "real" && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "#D6EFDC", color: "#1B4332" }}>
                ערכי היום · כולל אינפלציה ומס 25%
              </span>
            )}
          </div>

          <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ height: 280, background: "#fafcf8", borderRadius: 8 }}>
            <defs>
              <linearGradient id="wm-re" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2B694D" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#2B694D" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="wm-pen" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#1e6b3a" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#1e6b3a" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="wm-liq" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#1B4332" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#1B4332" stopOpacity="0.08" />
              </linearGradient>
              <linearGradient id="wm-total" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#012d1d" />
                <stop offset="55%" stopColor="#1B4332" />
                <stop offset="100%" stopColor="#2B694D" />
              </linearGradient>
              <filter id="wm-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid + Y-axis tick labels — labels on RIGHT side (RTL convention) */}
            {[0, 0.25, 0.5, 0.75, 1].map(f => {
              const yPos = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - f);
              const tickVal = maxNW * f;
              return (
                <g key={f}>
                  <line x1="0" x2={CW - 44} y1={yPos} y2={yPos} stroke="#eef2e8" strokeWidth="1" strokeDasharray={f === 0 ? undefined : "2 4"} />
                  {f > 0 && (
                    <text x={CW - 2} y={yPos + 4} textAnchor="end" fontSize="9" fill="#8aab99" fontWeight="600" fontFamily="Assistant, sans-serif">
                      {fmtAxis(Math.round(tickVal))}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Stacked areas: RE base → pension → liquid top — mountain layers */}
            {(() => {
              const chartW = CW - 44; // leave 44px for Y-axis labels on right
              const xOf = (i: number) => (i / (chartData.length - 1)) * chartW;
              return (
                <>
                  <path
                    d={`M 0 ${CH} ` + chartData.map((t, i) => {
                      const x = xOf(i);
                      const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - (t.realestate + t.pension + t.liquid) / maxNW);
                      return `L ${x} ${y}`;
                    }).join(" ") + ` L ${chartW} ${CH} Z`}
                    fill="url(#wm-liq)"
                  />
                  <path
                    d={`M 0 ${CH} ` + chartData.map((t, i) => {
                      const x = xOf(i);
                      const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - (t.realestate + t.pension) / maxNW);
                      return `L ${x} ${y}`;
                    }).join(" ") + ` L ${chartW} ${CH} Z`}
                    fill="url(#wm-pen)"
                  />
                  <path
                    d={`M 0 ${CH} ` + chartData.map((t, i) => {
                      const x = xOf(i);
                      const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - t.realestate / maxNW);
                      return `L ${x} ${y}`;
                    }).join(" ") + ` L ${chartW} ${CH} Z`}
                    fill="url(#wm-re)"
                  />

                  {/* Total line — glow layer + crisp layer */}
                  <polyline
                    points={chartData.map((t, i) => {
                      const x = xOf(i);
                      const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - t.total / maxNW);
                      return `${x},${y}`;
                    }).join(" ")}
                    fill="none" stroke="url(#wm-total)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
                    opacity="0.35" filter="url(#wm-glow)"
                  />
                  <polyline
                    points={chartData.map((t, i) => {
                      const x = xOf(i);
                      const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - t.total / maxNW);
                      return `${x},${y}`;
                    }).join(" ")}
                    fill="none" stroke="url(#wm-total)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"
                    style={{ strokeDasharray: 3000, strokeDashoffset: 0, animation: "drawLine 2.2s ease-out forwards" }}
                  />
                </>
              );
            })()}
            <style>{`@keyframes drawLine { from { stroke-dashoffset: 3000; } to { stroke-dashoffset: 0; } }`}</style>

            {/* End-point dot */}
            {chartData.length > 0 && (() => {
              const chartW = CW - 44;
              const last = chartData[chartData.length - 1];
              const x = chartW;
              const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - last.total / maxNW);
              return (
                <g>
                  <circle cx={x} cy={y} r="7" fill="#2B694D" opacity="0.25" />
                  <circle cx={x} cy={y} r="4" fill="#ffffff" stroke="#1B4332" strokeWidth="2" />
                </g>
              );
            })()}

            {/* Peak value annotation — capital mode only (in income mode the peak
                sits right on the retirement spike, cluttering the chart) */}
            {peakPoint && viewMode === "capital" && (() => {
              const chartW = CW - 44;
              const peakIdx = chartData.findIndex(p => p.age === peakPoint.age && p.year === peakPoint.year);
              if (peakIdx < 0) return null;
              const x = (peakIdx / (chartData.length - 1)) * chartW;
              const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - peakPoint.total / maxNW);
              const labelW = 120;
              const labelX = Math.max(0, Math.min(x - labelW / 2, chartW - labelW));
              return (
                <g>
                  <circle cx={x} cy={y} r="4" fill="#1B4332" opacity="0.5" />
                  <rect x={labelX} y={y - 20} width={labelW} height="16" rx="3" fill="#012d1d" opacity="0.8" />
                  <text x={labelX + labelW / 2} y={y - 8} textAnchor="middle" fontSize="8.5" fill="#ffffff" fontWeight="700" fontFamily="Assistant, sans-serif">
                    שיא: {fmtAxis(Math.round(peakPoint.total))} בגיל {peakPoint.age}
                  </text>
                </g>
              );
            })()}

            {/* Goal target markers — capital mode only (buckets track ₪ capital
                targets, not monthly income — the Y-axis unit doesn't match in income mode) */}
            {buckets.length > 0 && viewMode === "capital" && (() => {
              const chartW = CW - 44;
              // Build list of {bucket, year} then dedupe/cluster by year to avoid overlap
              const pins = buckets
                .filter(b => b.targetDate)
                .map(b => {
                  const yr = new Date(b.targetDate).getFullYear();
                  const idx = chartData.findIndex(p => p.year === yr);
                  if (idx < 0) return null;
                  return { bucket: b, idx, year: yr };
                })
                .filter((x): x is { bucket: Bucket; idx: number; year: number } => x !== null);

              // Sort by year for stable stacking
              pins.sort((a, b) => a.year - b.year);

              // Stack vertically if multiple goals share a year
              const yearCounts: Record<number, number> = {};
              return pins.map(({ bucket, idx }) => {
                const x = (idx / (chartData.length - 1)) * chartW;
                const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - chartData[idx].total / maxNW);
                const stack = yearCounts[idx] || 0;
                yearCounts[idx] = stack + 1;
                const pinY = Math.max(CHART_PAD_TOP + 8, y - 18 - stack * 18);
                const color = bucket.color || "#B45309";
                return (
                  <g key={bucket.id}>
                    {/* Dotted vertical connector */}
                    <line x1={x} x2={x} y1={pinY + 6} y2={y} stroke={color} strokeDasharray="2 2" strokeWidth="1" opacity="0.4" />
                    {/* Pin head */}
                    <circle cx={x} cy={pinY} r="7" fill={color} opacity="0.18" />
                    <circle cx={x} cy={pinY} r="4" fill={color} />
                    <circle cx={x} cy={pinY} r="1.5" fill="#ffffff" />
                    {/* Bucket name — rotated for readability, truncated */}
                    <title>{bucket.name} · {bucket.targetDate} · יעד {fmtILS(Math.round(bucket.targetAmount))}</title>
                  </g>
                );
              });
            })()}

            {/* FIRE age marker — emerald vertical line at financial independence */}
            {fireResult.fireAge !== null && (() => {
              const chartW = CW - 44;
              const fireIdx = chartData.findIndex(p => p.age === fireResult.fireAge);
              if (fireIdx <= 0 || fireIdx >= chartData.length) return null;
              const x = (fireIdx / (chartData.length - 1)) * chartW;
              const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - chartData[fireIdx].total / maxNW);
              return (
                <g>
                  <line x1={x} x2={x} y1={CHART_PAD_TOP} y2={CH} stroke="#2B694D" strokeDasharray="3 3" strokeWidth="1.5" opacity="0.7" />
                  <circle cx={x} cy={y} r="6" fill="#2B694D" opacity="0.2" />
                  <circle cx={x} cy={y} r="3.5" fill="#2B694D" />
                  <rect x={x - 22} y={20} width="44" height="14" rx="4" fill="#2B694D" opacity="0.15" />
                  <text x={x} y={30} textAnchor="middle" fontSize="9" fill="#1B4332" fontWeight="800" fontFamily="Assistant, sans-serif">FIRE</text>
                </g>
              );
            })()}

            {/* Retirement age marker */}
            {assumptions && (() => {
              const chartW = CW - 44;
              const retIdx = chartData.findIndex(p => p.age === assumptions.retirementAge);
              if (retIdx > 0 && retIdx < chartData.length) {
                const x = (retIdx / (chartData.length - 1)) * chartW;
                const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - chartData[retIdx].total / maxNW);
                return (
                  <g>
                    <line x1={x} x2={x} y1={CHART_PAD_TOP} y2={CH} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth="1.5" opacity="0.65" />
                    <circle cx={x} cy={y} r="5" fill="#f59e0b" opacity="0.2" />
                    <circle cx={x} cy={y} r="3" fill="#f59e0b" />
                    {/* "פרישה" label above chart — centered on line, with background pill */}
                    <rect x={x - 20} y={4} width="40" height="14" rx="4" fill="#f59e0b" opacity="0.15" />
                    <text x={x} y={CHART_PAD_TOP - 8} textAnchor="middle" fontSize="9" fill="#b45309" fontWeight="800" fontFamily="Assistant, sans-serif">פרישה</text>
                  </g>
                );
              }
              return null;
            })()}

            {/* Target-income overlay — horizontal dashed line at retire_income goal */}
            {viewMode === "income" && targetRetireIncome > 0 && (() => {
              const chartW = CW - 44;
              const yTarget = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - targetRetireIncome / maxNW);
              return (
                <g>
                  <line x1="0" x2={chartW} y1={yTarget} y2={yTarget} stroke="#b91c1c" strokeDasharray="6 4" strokeWidth="1.5" opacity="0.7" />
                  <rect x={4} y={yTarget - 16} width="104" height="14" rx="4" fill="#b91c1c" opacity="0.12" />
                  <text x={6} y={yTarget - 5} fontSize="9" fill="#8B2E2E" fontWeight="800" fontFamily="Assistant, sans-serif">
                    יעד · {fmtAxis(targetRetireIncome)}/חודש
                  </text>
                </g>
              );
            })()}
          </svg>
          <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-2 px-1">
            {chartData.length > 0 && (
              <>
                <span>גיל {chartData[0].age} ({chartData[0].year})</span>
                {chartData.length > 2 && (
                  <span>{fmtILS(Math.round(chartData[Math.floor(chartData.length / 2)].total))}</span>
                )}
                <span>גיל {chartData[chartData.length - 1].age} ({chartData[chartData.length - 1].year})</span>
              </>
            )}
          </div>

          {/* Income mode — gap summary vs. retire_income goal */}
          {viewMode === "income" && incomeResult && targetRetireIncome > 0 && (() => {
            const retPoint = incomeResult.points.find(p => p.age === (assumptions?.retirementAge ?? 67));
            const gap = incomeResult.gapAtRetirement;
            const shortfall = gap > 0;
            const sev = shortfall ? (gap / targetRetireIncome > 0.3 ? "critical" : "warn") : "ok";
            const color = sev === "critical" ? "#8B2E2E" : sev === "warn" ? "#B45309" : "#1B4332";
            const bg    = sev === "critical" ? "#FEE2E2" : sev === "warn" ? "#FEF3C7" : "#D6EFDC";
            return (
              <div className="mt-4 grid grid-cols-4 gap-3">
                <div className="rounded-xl p-3" style={{ background: bg, border: `1px solid ${color}30` }}>
                  <div className="text-[10px] font-bold" style={{ color }}>יעד חודשי</div>
                  <div className="text-lg font-extrabold tabular" style={{ color }}>{fmtILS(Math.round(targetRetireIncome))}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
                  <div className="text-[10px] font-bold text-verdant-muted">בפרישה צפוי</div>
                  <div className="text-lg font-extrabold tabular text-verdant-ink">{fmtILS(Math.round(retPoint?.total ?? 0))}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: bg, border: `1px solid ${color}30` }}>
                  <div className="text-[10px] font-bold" style={{ color }}>{shortfall ? "פער" : "עודף"}</div>
                  <div className="text-lg font-extrabold tabular" style={{ color }}>{fmtILS(Math.round(Math.abs(gap)))}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
                  <div className="text-[10px] font-bold text-verdant-muted">פער ממוצע (לכל תקופת פרישה)</div>
                  <div className="text-lg font-extrabold tabular" style={{ color: incomeResult.gapAverage > 0 ? "#8B2E2E" : "#1B4332" }}>
                    {fmtILS(Math.round(Math.abs(incomeResult.gapAverage)))}
                  </div>
                </div>
                <div className="col-span-4 mt-1">
                  <Link
                    href={"/retirement" as any}
                    className="flex items-center justify-between px-4 py-3 rounded-xl transition-all hover:shadow-md"
                    style={{ background: "linear-gradient(135deg,#012d1d,#1B4332)", color: "#fff" }}
                  >
                    <span className="flex items-center gap-2 text-[12px] font-extrabold">
                      <span className="material-symbols-outlined text-[18px]">beach_access</span>
                      תכנן איתי פרישה · משוך מחוונים, קבל תובנות, סגור את הפער
                    </span>
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  </Link>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* ═══════ Zone 4 — Goals Summary (Full Width) ═══════ */}
      <section className="card-pad-lg">
        <div className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-3">
            <div className="icon-sm icon-forest">
              <span className="material-symbols-outlined text-[20px]">flag</span>
            </div>
            <div>
              <div className="caption mb-1">מטרות ויעדים</div>
              <h3 className="t-lg font-extrabold" style={{ color: "var(--botanical-forest)" }}>מטרות ויעדים</h3>
              {buckets.length > 0 && (
                <div className="kpi-hint font-bold mt-1 tabular">
                  {fmtILS(totalBucketCurrent)} מתוך {fmtILS(totalBucketTargetSum)} · {buckets.length} יעדים
                </div>
              )}
            </div>
          </div>
          <Link href={"/goals" as any} className="btn btn-secondary btn-sm">
            צפה במפה המלאה
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          </Link>
        </div>

        {buckets.length === 0 ? (
          <div className="card-mint text-center py-10">
            <div className="icon-lg mx-auto mb-3" style={{ background: "rgba(27,67,50,0.08)", color: "var(--botanical-forest)" }}>
              <span className="material-symbols-outlined text-[26px]">tips_and_updates</span>
            </div>
            <div className="t-lg font-extrabold" style={{ color: "var(--botanical-deep)" }}>כל שקל חייב לדעת לאן הוא הולך</div>
            <div className="t-sm font-bold mt-2" style={{ color: "rgba(1,45,29,0.7)" }}>צור מטרה ראשונה והתחל לעקוב אחרי המסלול</div>
          </div>
        ) : (
          <div className="space-y-4">
            {bucketProjections.map(({ bucket, projection }) => {
              // Status → botanical palette (no stray purple/blue — aligned with brand)
              const statusColor =
                projection.status === "ahead"    ? "#1B4332" :  // forest
                projection.status === "on_track" ? "#2B694D" :  // emerald
                projection.status === "behind"   ? "#B45309" :  // amber
                                                   "#8B2E2E";   // deep red
              const statusLabel =
                projection.status === "ahead" ? "מקדים" :
                projection.status === "on_track" ? "בדרך" :
                projection.status === "behind" ? "בפיגור" : "בסיכון";
              const progressPct = Math.min(100, Math.round(projection.progressPct * 100));
              const dateStr = (() => {
                try {
                  const d = new Date(bucket.targetDate);
                  const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
                  return `${months[d.getMonth()]} ${d.getFullYear()}`;
                } catch { return bucket.targetDate; }
              })();

              return (
                <div key={bucket.id} className="flex items-center gap-5 py-4 px-5 rounded-2xl transition-all hover:-translate-y-0.5"
                  style={{ background: "#D6EFDC", boxShadow: "0 1px 2px rgba(27,67,50,0.06)" }}>
                  <div className="icon-sm" style={{ background: "rgba(27,67,50,0.12)", color: "var(--botanical-forest)" }}>
                    <span className="material-symbols-outlined text-[20px]">{bucket.icon || "flag"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-[14px] font-extrabold truncate" style={{ color: "var(--botanical-deep)" }}>{bucket.name}</div>
                      <div className="text-[11px] font-bold tabular shrink-0" style={{ color: "rgba(1,45,29,0.60)" }}>{dateStr}</div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(1,45,29,0.10)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: "var(--botanical-forest)" }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="text-[10px] font-bold tabular" style={{ color: "rgba(1,45,29,0.65)" }}>
                        {fmtILS(bucket.currentAmount)} / {fmtILS(bucket.targetAmount)}
                      </div>
                      <div className="text-[10px] font-bold tabular" style={{ color: "var(--botanical-deep)" }}>{progressPct}%</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full shrink-0"
                    style={{ background: `${statusColor}18`, color: statusColor }}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ Proactive Insights — Gap 8 ═══
       * Scans the household profile and surfaces concrete ₪ gaps:
       * study-fund cap, Section 45א/47, refinance opportunity, idle cash,
       * missing credit points. Each item links to the page where the fix lives. */}
      {insights.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-extrabold text-verdant-ink">תובנות פרואקטיביות</h2>
            {totalAnnualOpportunity(insights) > 0 && (
              <span className="text-[11px] font-bold tabular" style={{ color: "#2B694D" }}>
                הזדמנות שנתית כוללת: {fmtILS(totalAnnualOpportunity(insights))}
              </span>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {insights.map((ins) => {
              const bar =
                ins.severity === "critical" ? "#b91c1c" :
                ins.severity === "warning"  ? "#d97706" :
                ins.severity === "opportunity" ? "#2B694D" : "#1B4332";
              return (
                <Link
                  key={ins.id}
                  href={(ins.href || "/dashboard") as any}
                  className="card-pad hover:-translate-y-0.5 transition-all"
                  style={{ borderInlineStart: `4px solid ${bar}` }}
                >
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[22px] flex-shrink-0" style={{ color: bar }}>
                      {ins.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-extrabold text-verdant-ink mb-1">{ins.title}</div>
                      <p className="text-[12px] text-verdant-muted leading-5">{ins.detail}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
