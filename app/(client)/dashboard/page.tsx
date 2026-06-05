"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { fmtILS, fmtPct } from "@/lib/format";
import { savingsRate as calcSavingsRate } from "@/lib/financial-math";
import type { CashflowSummary } from "@/types/db";
import { getTotalLiabilities, loadDebtData, getAllMortgageTracks } from "@/lib/debt-store";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import {
  buildBudgetLines,
  totalBudget,
  deriveMonthlyIncomeFromBudget,
  deriveMonthlyExpensesFromBudget,
} from "@/lib/budget-store";
import { loadProperties } from "@/lib/realestate-store";
import { loadPensionFunds, EVENT_NAME as PENSION_EVENT } from "@/lib/pension-store";
import {
  loadAccounts,
  totalBankBalance,
  totalCreditCharges,
  ACCOUNTS_EVENT,
} from "@/lib/accounts-store";
import { loadSecurities, totalSecuritiesValue } from "@/lib/securities-store";
import { loadKidsSavings, KIDS_SAVINGS_EVENT } from "@/lib/kids-savings-store";
import { loadBuckets, BUCKETS_EVENT, type Bucket } from "@/lib/buckets-store";
import { projectBucket } from "@shared/buckets-rebalancing";
import { loadAssumptions, savingsRatio } from "@/lib/assumptions";
import {
  loadSalaryProfile,
  computeSalaryBreakdown,
  hasSavedSalaryProfile,
  SALARY_PROFILE_EVENT,
} from "@/lib/salary-engine";
import { computeFireTrajectory } from "@/lib/fire-calculator";
import {
  computeMonthlyIncomeTrajectory,
  loadTargetRetirementIncome,
} from "@/lib/retirement-income";
import { buildTrajectory } from "@/lib/trajectory-builder";
import {
  loadProactiveInsights,
  totalAnnualOpportunity,
  type ProactiveInsight,
} from "@/lib/proactive-insights";
import type { Assumptions } from "@/lib/assumptions";
import { AssetDonut } from "@/components/charts/AssetDonut";
import { buildLifeCoverage } from "@/lib/life-coverage";
import { useClient } from "@/lib/client-context";
// MacroPanel makes its own network call to fetch BoI rates and renders
// a chart — fully below-fold-ish on the dashboard and not part of the
// "answer in 3 seconds" promise. Lazy-load it so it doesn't block the
// initial paint.
const MacroPanel = dynamic(
  () => import("@/components/MacroPanel").then((m) => m.MacroPanel),
  { ssr: false, loading: () => null }
);
import { buildNudges, type Nudge } from "@/lib/benchmark-advice";
import {
  syncGoalsToDepositPlans,
  seedMonth,
  summaryForMonth,
  currentMonthKey,
  DEPOSITS_EVENT,
} from "@/lib/deposits-store";
// DepositsWidget removed from dashboard 2026-05-19 per Nir — lives on /deposits.
import { scopedKey } from "@/lib/client-scope";
import { SCOPE_COLORS, effectiveScope, type Scope } from "@/lib/scope-types";
import { MacroStrip } from "@/components/MacroStrip";
import { UnmappedNudge } from "@/components/UnmappedNudge";

const TRACK_COLOR: Record<string, string> = {
  on: "#2C7A5A",
  behind: "#D97706",
  at_risk: "#DC2626",
};
const TRACK_LABEL: Record<string, string> = { on: "בדרך", behind: "בפיגור", at_risk: "בסיכון" };
const GOAL_ICONS: Record<string, string> = {
  "קרן חירום": "savings",
  חינוך: "school",
  "חינוך ילדים": "school",
  רכב: "directions_car",
  דירה: "home",
  פרישה: "elderly",
  "פרישה מוקדמת": "elderly",
  חתונה: "favorite",
  חופשה: "flight_takeoff",
  עסק: "storefront",
  default: "flag",
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
const MS_7_DAYS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true only when the user has established data AND the timing gates pass.
 * New clients (no cashflow/budget data yet) always get false.
 */
function shouldShowCheckin(clientHasData: boolean): boolean {
  if (!clientHasData) return false;
  try {
    const now = Date.now();
    const lastShown = Number(localStorage.getItem(scopedKey(CHECKIN_LAST_SHOWN_KEY)) || 0);
    const lastDismissed = Number(localStorage.getItem(scopedKey(CHECKIN_LAST_DISMISSED_KEY)) || 0);
    if (lastShown && now - lastShown < MS_30_DAYS) return false;
    if (lastDismissed && now - lastDismissed < MS_7_DAYS) return false;
    return true;
  } catch {
    return false;
  }
}

type ChartRange = "ytd" | "1y" | "3y" | "5y" | "10y" | "max";
const CHART_RANGES: { key: ChartRange; label: string }[] = [
  { key: "ytd", label: "מתחה״ש" },
  { key: "1y", label: "שנה" },
  { key: "3y", label: "3 שנים" },
  { key: "5y", label: "5 שנים" },
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
  const [accounts, setAccounts] = useState<ReturnType<typeof loadAccounts>>({
    banks: [],
    creditCards: [],
  });
  const [securitiesTotal, setSecuritiesTotal] = useState(0);
  const [kidsSavingsTotal, setKidsSavingsTotal] = useState(0);
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);

  // Build assets from REAL stores only — no demo fallback. An empty asset
  // group means "user hasn't added anything of that type yet" and should
  // contribute 0, not mask behind demo numbers.
  const assets = useMemo(() => {
    const result: {
      asset_group: "liquid" | "investments" | "pension" | "realestate" | "kids";
      name: string;
      balance: number;
    }[] = [];

    const liquidTotal = totalBankBalance(accounts);
    if (liquidTotal > 0) {
      result.push({
        asset_group: "liquid",
        name: `נזיל (${accounts.banks.length} חשבונות)`,
        balance: liquidTotal,
      });
    }

    if (securitiesTotal > 0) {
      result.push({ asset_group: "investments", name: "תיק השקעות עצמאי", balance: securitiesTotal });
    }

    if (pensionFunds.length > 0) {
      const totalPension = pensionFunds.reduce((s, f) => s + f.balance, 0);
      result.push({
        asset_group: "pension",
        name: `פנסיוני (${pensionFunds.length} קופות)`,
        balance: totalPension,
      });
    }

    if (reProperties.length > 0) {
      const totalRealEstateValue = reProperties.reduce((s, p) => s + p.currentValue, 0);
      result.push({
        asset_group: "realestate",
        name: `נדל״ן (${reProperties.length} נכסים)`,
        balance: totalRealEstateValue,
      });
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
  useEffect(() => {
    setTargetRetireIncome(loadTargetRetirementIncome());
  }, [clientId]);

  useEffect(() => {
    // Auto-sync onboarding data on page load
    syncOnboardingToStores();
    // 2026-04-28 perf fix: 9 separate event listeners can fire within ms of
    // each other (e.g. on initial sync). Without coalescing, each one triggers
    // 7+ setStates → 7 renders → trajectory math recomputes 7×. rAF batches
    // them into one render per frame.
    let scheduled = false;
    const reload = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        doReload();
      });
    };
    // Reference-stable setter — only updates state when the value's JSON
    // form has actually changed. Uses the functional setState form so we
    // see the LATEST committed state (the closure-captured state is stale,
    // it only refreshes when the effect re-runs on clientId change).
    //
    // Why this matters: 17 event listeners all trigger reload, and each
    // load*() helper returns a NEW object every time (same data, different
    // reference). Without this guard, every storage event invalidates the
    // trajectory useMemo (which loops 50 years × 12 months) and forces a
    // full re-render even when nothing has actually changed. (2026-05-18.)
    const stableSet = <T,>(
      setter: (updater: (prev: T) => T) => void,
      next: T
    ) => {
      setter((prev) => {
        try {
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        } catch {
          /* fall through */
        }
        return next;
      });
    };

    const doReload = () => {
      // 2026-05-18 perf: read assumptions ONCE and pass through (previously
      // loaded twice — once for setAssumptions and again 20 lines later for
      // the cashflow calculation, doubling the localStorage IO on every
      // reload, of which we get ~17 different events triggering).
      const a = loadAssumptions();
      setRealLiab(getTotalLiabilities());
      stableSet(setAssumptions, a);
      stableSet(setReProperties, loadProperties());
      stableSet(setPensionFunds, loadPensionFunds());
      stableSet(setAccounts, loadAccounts());
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

      // Recompute current-month cashflow from budget store + assumptions.
      const lines = buildBudgetLines(0);
      const totals = totalBudget(lines);
      // Live income from the budget (salary + passive + manual); falls back to
      // assumptions only if the budget has no income rows yet.
      const income = deriveMonthlyIncomeFromBudget(a.monthlyIncome || 0);
      if (income <= 0 && totals.actual <= 0) {
        setCashflow([]);
      } else {
        const now = new Date();
        setCashflow([
          {
            household_id: "household",
            month_id: `m-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            closed: false,
            income_total: income,
            expense_total: totals.actual,
            cashflow_gap: income - totals.actual,
          },
        ]);
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
    // 2026-05-03 fix (Victor): budget/goals updates were missing — dashboard
    // showed stale income/expenses + goal pins.
    window.addEventListener("verdant:budgets:updated", reload);
    window.addEventListener("verdant:goals:updated", reload);
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
      window.removeEventListener("verdant:budgets:updated", reload);
      window.removeEventListener("verdant:goals:updated", reload);
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
      const pending = sum.entries.filter((e) => !e.confirmed);
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

  // Nudges — must be client-only (reads localStorage). 2026-04-30 fix:
  // computing inside render produced different output on server (empty)
  // vs client (full list) → hydration mismatch on /dashboard.
  const [nudges, setNudges] = useState<Nudge[]>([]);
  useEffect(() => {
    const refresh = () => setNudges(buildNudges().slice(0, 3));
    refresh();
    // Re-compute when underlying data changes.
    const evs = [
      "storage",
      "verdant:assumptions",
      "verdant:realestate:updated",
      PENSION_EVENT,
      ACCOUNTS_EVENT,
      "verdant:goals:updated",
    ];
    evs.forEach((e) => window.addEventListener(e, refresh));
    return () => evs.forEach((e) => window.removeEventListener(e, refresh));
  }, []);

  const dismissDepositsBanner = () => {
    try {
      localStorage.setItem(scopedKey(DEPOSITS_DISMISSED_KEY), currentMonthKey());
    } catch {}
    setDepositsBannerDismissed(true);
  };

  const totalAssets = assets.reduce((a, x) => a + x.balance, 0);
  // Empty-state detection — true when nothing has been entered yet. Rendering
  // dozens of widgets with zeros would tell a new couple "your money is gone";
  // the welcome state instead points them at the 3 places to start.
  const [hasOnboardingFields, setHasOnboardingFields] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try {
        const raw = localStorage.getItem(scopedKey("verdant:onboarding:fields"));
        if (!raw) {
          setHasOnboardingFields(false);
          return;
        }
        const f = JSON.parse(raw);
        setHasOnboardingFields(
          Boolean(f && Object.values(f).some((v) => String(v ?? "").trim() !== ""))
        );
      } catch {
        setHasOnboardingFields(false);
      }
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:assumptions", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:assumptions", refresh);
    };
  }, [clientId]);
  const reMortgageTotal = reProperties.reduce((s, p) => s + (p.mortgageBalance ?? 0), 0);
  const creditCharges = totalCreditCharges(accounts);
  // 2026-05-03 fix (Victor): same mortgage entered in BOTH debt-store and
  // realestate-store was double-counted in dashboard NW (WealthTab already
  // dedups via reMortgageExtra; dashboard didn't). Aligned the logic.
  const debtMortgageOnly = getAllMortgageTracks(loadDebtData()).reduce(
    (s, t) => s + (t.remainingBalance || 0),
    0
  );
  const reMortgageExtra = Math.max(0, reMortgageTotal - debtMortgageOnly);
  const totalLiabilities = realLiab + reMortgageExtra + creditCharges;
  const netWorthVal = totalAssets - totalLiabilities;
  const latestGap = cashflow[0]?.cashflow_gap ?? 0;
  const latestIncome = cashflow[0]?.income_total ?? 0;
  const latestExpense = cashflow[0]?.expense_total ?? 0;
  const isEmpty =
    !hasOnboardingFields &&
    cashflow.length === 0 &&
    totalAssets === 0 &&
    totalLiabilities === 0;

  // Net worth month-over-month tracking
  const [prevNetWorth, setPrevNetWorth] = useState<number | null>(null);
  useEffect(() => {
    const NW_KEY = "verdant:net_worth_history";
    try {
      const history: { month: string; value: number }[] = JSON.parse(
        localStorage.getItem(scopedKey(NW_KEY)) || "[]"
      );
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      // Find previous month entry
      const prevMonth = history
        .filter((h) => h.month < currentMonth)
        .sort((a, b) => b.month.localeCompare(a.month))[0];
      if (prevMonth) setPrevNetWorth(prevMonth.value);
      // Save current month
      const existing = history.findIndex((h) => h.month === currentMonth);
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
        if (!raw) {
          setScopeSplit(null);
          return;
        }
        const data = JSON.parse(raw) as {
          sections?: Record<
            string,
            {
              budget?: number;
              actual?: number;
              scope?: Scope;
              subItems?: { budget?: number; actual?: number }[];
            }[]
          >;
        };
        let personal = 0,
          business = 0,
          hasBusiness = false;
        const expSections = ["fixed", "variable"] as const;
        for (const sk of expSections) {
          const rows = data.sections?.[sk] || [];
          for (const r of rows) {
            const subSum =
              Array.isArray(r.subItems) && r.subItems.length > 0
                ? r.subItems.reduce((s, sub) => s + (Number(sub.budget) || 0), 0)
                : 0;
            const amount = subSum > 0 ? subSum : Number(r.budget) || 0;
            const eff = effectiveScope(r.scope);
            if (eff === "business") {
              business += amount;
              hasBusiness = true;
            } else if (eff === "mixed") {
              business += amount / 2;
              personal += amount / 2;
              hasBusiness = true;
            } else personal += amount;
          }
        }
        setScopeSplit(hasBusiness ? { personal, business } : null);
      } catch {
        setScopeSplit(null);
      }
    };
    compute();
    window.addEventListener("storage", compute);
    return () => window.removeEventListener("storage", compute);
  }, []);

  const nwChange = prevNetWorth !== null ? netWorthVal - prevNetWorth : null;
  const nwChangePct =
    prevNetWorth !== null && prevNetWorth !== 0
      ? ((netWorthVal - prevNetWorth) / Math.abs(prevNetWorth)) * 100
      : null;

  // Savings Rate — prefer the salary-engine real rate (pension+study-fund / gross)
  // when the user has saved a salary profile; otherwise fall back to budget-derived rate.
  const hasIncomeData = latestIncome > 0 && latestExpense > 0;
  const savingsRate =
    salaryRealRate !== null
      ? salaryRealRate * 100
      : hasIncomeData
        ? calcSavingsRate(latestIncome, latestIncome - latestGap) * 100
        : 0;
  const savingsLabel =
    savingsRate >= 20 ? "מעולה" : savingsRate >= 10 ? "טוב" : savingsRate >= 5 ? "סביר" : null;
  const savingsLabelColor =
    savingsRate >= 20
      ? "#2C7A5A"
      : savingsRate >= 10
        ? "#2C7A5A"
        : savingsRate >= 5
          ? "#b45309"
          : "#DC2626";

  // Allocation slices for donut
  const allocationSlices = useMemo(() => {
    const groups: Record<string, { label: string; color: string; total: number }> = {
      liquid: { label: "נזיל", color: "#2C7A5A", total: 0 },
      investments: { label: "השקעות", color: "#4a9b7a", total: 0 },
      pension: { label: "פנסיוני", color: "#059669", total: 0 },
      realestate: { label: "נדל״ן", color: "#059669", total: 0 },
      kids: { label: "חיסכון ילדים", color: "#4a9b7a", total: 0 },
    };
    assets.forEach((a) => {
      if (groups[a.asset_group]) groups[a.asset_group].total += a.balance;
    });
    return Object.values(groups)
      .filter((g) => g.total > 0)
      .map((g) => ({
        label: g.label,
        pct: Math.round((g.total / totalAssets) * 100),
        color: g.color,
      }));
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

  const bucketProjections = useMemo(
    () => buckets.map((b) => ({ bucket: b, projection: projectBucket(b) })),
    [buckets]
  );
  const totalBucketCurrent = useMemo(
    () => buckets.reduce((s, b) => s + (b.currentAmount || 0), 0),
    [buckets]
  );
  const totalBucketTargetSum = useMemo(
    () => buckets.reduce((s, b) => s + (b.targetAmount || 0), 0),
    [buckets]
  );

  // ─── Holistic growth trajectory: March 2026 → age 100 ───
  // Single source of truth lives in lib/trajectory-builder.ts — shared with /retirement page
  // so both views always reflect the same projection math. Liabilities amortize over 20 years.
  const trajectory = useMemo(() => {
    const a = assumptions || loadAssumptions();
    const liquid = assets
      .filter((x) => x.asset_group === "liquid" || x.asset_group === "investments")
      .reduce((s, x) => s + x.balance, 0);
    const pension = assets
      .filter((x) => x.asset_group === "pension")
      .reduce((s, x) => s + x.balance, 0);
    const realestate = assets
      .filter((x) => x.asset_group === "realestate")
      .reduce((s, x) => s + x.balance, 0);
    return buildTrajectory({
      assumptions: a,
      liquid,
      pension,
      realestate,
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
    const weightedFactor =
      totalPensionBalance > 0
        ? pensionFunds.reduce((s, f) => s + (f.balance || 0) * (f.conversionFactor || 200), 0) /
          totalPensionBalance
        : 200;
    return computeFireTrajectory(trajectory, monthlyExpenses, a.safeWithdrawalRate ?? 0.04, {
      retirementAge: a.retirementAge,
      pensionConversionFactor: weightedFactor,
    });
  }, [assumptions, trajectory, pensionFunds]);

  // ─── Plan Score + Missing/Surplus pieces (rendered as 3 badges in mountain header) ───
  const lifeCoverage = useMemo(
    () => buildLifeCoverage(),
    [assumptions, buckets, totalLiabilities, assets]
  );

  // Filter trajectory by selected chart range
  const filteredTrajectory = useMemo(() => {
    if (chartRange === "max") return trajectory;
    const now = new Date();
    const currentYear = now.getFullYear();
    let maxYear: number;
    switch (chartRange) {
      case "ytd":
        maxYear = currentYear;
        break;
      case "1y":
        maxYear = currentYear + 1;
        break;
      case "3y":
        maxYear = currentYear + 3;
        break;
      case "5y":
        maxYear = currentYear + 5;
        break;
      case "10y":
        maxYear = currentYear + 10;
        break;
      default:
        return trajectory;
    }
    return trajectory.filter((p) => p.year <= maxYear);
  }, [trajectory, chartRange]);

  // Apply display mode (nominal / real-net) on top of filtered trajectory.
  // Real mode: deflate by inflation to today's ₪ AND apply 25% CGT on liquid gains.
  const displayTrajectory = useMemo(() => {
    if (displayMode === "nominal") return filteredTrajectory;
    const a = assumptions || loadAssumptions();
    const inflation = a.inflationRate ?? 0.025;
    const CGT = 0.25;
    const startAge = filteredTrajectory[0]?.age ?? 0;
    return filteredTrajectory.map((p) => {
      const yearsIn = Math.max(0, p.age - startAge);
      const deflator = Math.pow(1 + inflation, yearsIn);
      // Tax only the growth portion of liquid (gross - start - contributions)
      const liquidBasis = p.liquidStart + p.liquidContribCum;
      const liquidGrowth = Math.max(0, p.liquid - liquidBasis);
      const liquidNet = liquidBasis + liquidGrowth * (1 - CGT);
      const liquidReal = liquidNet / deflator;
      const pensionReal = p.pension / deflator; // pension taxed at annuity stage — ignored here for simplicity
      const reReal = p.realestate / deflator;
      const total =
        liquidReal +
        pensionReal +
        reReal -
        ((p.total - p.liquid - p.pension - p.realestate) / deflator) * 0; // liabilities already amortized in nominal; not double-hit
      return {
        ...p,
        liquid: liquidReal,
        pension: pensionReal,
        realestate: reReal,
        total:
          liquidReal +
          pensionReal +
          reReal +
          (p.total - p.liquid - p.pension - p.realestate) / deflator,
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
    return incomeResult.points.map((p) => ({
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
    setToday(
      new Date().toLocaleDateString("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, []);

  // Predicted balance for check-in
  const predictedBalance = useMemo(() => {
    const liquid = assets
      .filter((x) => x.asset_group === "liquid")
      .reduce((s, x) => s + x.balance, 0);
    return liquid + latestGap;
  }, [assets, latestGap]);

  // Chart dimensions — extra top padding so "פרישה" label is never clipped
  const CW = 700,
    CH = 230;
  const CHART_PAD_TOP = 36; // pixels reserved above the highest data point
  const maxNW = Math.max(
    ...chartData.map((t) => t.total),
    viewMode === "income" ? targetRetireIncome * 1.15 : 0,
    1
  );
  // Peak point (retirement or overall maximum)
  const peakPoint = useMemo(() => {
    if (!chartData.length) return null;
    return chartData.reduce((best, p) => (p.total > best.total ? p : best), chartData[0]);
  }, [chartData]);
  // Compact ILS formatter for Y-axis ticks. In income mode the numbers are monthly
  // (much smaller scale) — show them without M/K abbreviation for readability.
  const fmtAxis = (v: number) => {
    if (viewMode === "income") {
      if (v >= 1_000) return `\u2066${Math.round(v / 100) / 10}K ₪\u2069`;
      return `\u2066${Math.round(v)} ₪\u2069`;
    }
    if (v >= 1_000_000)
      return `\u2066${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M ₪\u2069`;
    if (v >= 1_000) return `\u2066${Math.round(v / 1_000)}K ₪\u2069`;
    return `\u2066${v} ₪\u2069`;
  };

  // ═══════ Empty state — first-time visitor with no data ═══════
  // A new couple landing here would otherwise see a wall of zeros and
  // empty charts — confusing and demotivating. The welcome card points
  // them at the 3 entry points that turn this dashboard into something
  // worth looking at.
  if (isEmpty) {
    return (
      <div
        className="mx-auto max-w-3xl py-8 md:py-16"
        style={{ fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif" }}
      >
        {/* MacroStrip belongs in the empty state too — it's a trust signal
            that the system has live data, even before the family has entered
            anything of their own. The Wealth Report CTA is intentionally
            omitted here (a report of zeros isn't useful). */}
        <MacroStrip />
        <div className="card-pad text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-organic"
            style={{ background: "#2C7A5A15" }}
          >
            <span className="material-symbols-outlined text-[36px] text-verdant-emerald">
              waving_hand
            </span>
          </div>
          <h2 className="mb-2 text-xl font-extrabold text-verdant-ink">
            ברוכים הבאים{familyName ? ` משפחת ${familyName}` : ""}
          </h2>
          <p className="mx-auto mb-7 max-w-md text-[13px] leading-relaxed text-verdant-muted">
            הדאשבורד יראה את התזרים, הנכסים וההתחייבויות שלכם — אחרי שתספרו לנו על
            עצמכם. השאלון הקצר לוקח כ-10 דקות, ונשמר אוטומטית.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/onboarding"
              className="card-pad block text-right transition-opacity hover:opacity-90"
            >
              <div className="icon-sm icon-forest mb-2.5">
                <span className="material-symbols-outlined text-[20px]">edit_note</span>
              </div>
              <div className="mb-1 text-[13px] font-extrabold text-verdant-ink">מילוי שאלון</div>
              <div className="text-[11px] leading-relaxed text-verdant-muted">
                פרופיל משפחתי, הכנסות, נכסים והתחייבויות
              </div>
            </Link>
            <Link
              href="/balance"
              className="card-pad block text-right transition-opacity hover:opacity-90"
            >
              <div className="icon-sm icon-forest mb-2.5">
                <span className="material-symbols-outlined text-[20px]">account_balance</span>
              </div>
              <div className="mb-1 text-[13px] font-extrabold text-verdant-ink">חשבונות ונכסים</div>
              <div className="text-[11px] leading-relaxed text-verdant-muted">
                יתרות עו״ש, חיסכון וכרטיסי אשראי
              </div>
            </Link>
            <Link
              href="/goals"
              className="card-pad block text-right transition-opacity hover:opacity-90"
            >
              <div className="icon-sm icon-forest mb-2.5">
                <span className="material-symbols-outlined text-[20px]">flag</span>
              </div>
              <div className="mb-1 text-[13px] font-extrabold text-verdant-ink">מטרה ראשונה</div>
              <div className="text-[11px] leading-relaxed text-verdant-muted">
                קרן חירום, לימודי הילדים, חופשה — מה חשוב לכם
              </div>
            </Link>
          </div>
          <div
            className="mt-7 flex items-start gap-2 rounded-xl p-3 text-right"
            style={{ background: "#FAFAF7", border: "1px solid #c9e3d4" }}
          >
            <span className="material-symbols-outlined mt-0.5 text-[16px] text-verdant-emerald">
              tips_and_updates
            </span>
            <div className="text-[11px] leading-relaxed text-verdant-ink">
              אין סדר מחייב. אפשר להתחיל מאיפה שמרגיש לכם קל יותר. כל מה שתמלאו —
              נשמר אוטומטית, ותמיד אפשר לחזור ולערוך.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-4 md:py-8" style={{ fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif" }}>
      {/* ═══════ AI categorization nudge — only visible when there's work ═══════ */}
      <UnmappedNudge />
      {/* ═══════ Live macro strip + Wealth Report CTA ═══════ */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-stretch">
        <div className="flex-1">
          <MacroStrip />
        </div>
        <Link
          href="/report"
          className="group flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13px] font-extrabold transition-opacity hover:opacity-90 md:min-w-[220px]"
          style={{
            background: "var(--morning-forest, #2c7a5a)",
            color: "#FFFFFF",
            border: "1px solid var(--morning-forest-deep, #1f5a42)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
            <span>דוח עושר Plan</span>
          </div>
          <span
            className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-0.5"
            aria-hidden
          >
            arrow_back
          </span>
        </Link>
      </div>
      {/* ═══════ Monthly Check-in Popup ═══════ */}
      {showCheckin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(10,25,41,0.4)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="mx-4 w-full max-w-md rounded-organic p-8 shadow-soft"
            style={{ background: "#FFFFFF", border: "2px solid #2C7A5A30" }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg,#2C7A5A,#1F5A42)" }}
              >
                <span className="material-symbols-outlined text-[22px] text-white">fact_check</span>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-verdant-ink">בדיקה חודשית</h3>
                <p className="text-[11px] font-bold text-verdant-muted">סטטוס תכנון</p>
              </div>
            </div>

            <div
              className="mb-6 rounded-xl p-5"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
            >
              <div className="mb-2 text-[11px] font-bold text-verdant-muted">
                יתרת עו״ש צפויה לפי התחזית:
              </div>
              <div className="tabular mb-3 text-3xl font-extrabold text-verdant-ink">
                {fmtILS(Math.round(predictedBalance))}
              </div>
              <div className="text-[12px] font-bold text-verdant-ink">האם היתרה בפועל תואמת?</div>
            </div>

            <div className="flex gap-3">
              <button onClick={dismissCheckin} className="btn-botanical flex-1 text-[12px]">
                כן, תואם
              </button>
              <button
                onClick={dismissCheckin}
                className="flex-1 rounded-xl py-3 text-[12px] font-bold transition-shadow"
                style={{ background: "#f59e0b15", color: "#b45309", border: "1px solid #f59e0b30" }}
              >
                לא, יש הפרש
              </button>
              <button
                onClick={dismissCheckin}
                className="rounded-xl px-4 py-3 text-[12px] font-bold text-verdant-muted transition-colors hover:bg-verdant-bg"
                style={{ background: "#E5E7EB" }}
              >
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
          className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: "rgba(217,119,6,0.12)", border: "1px solid #D97706" }}
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
            className="rounded-lg px-3 py-1.5 text-[12px] font-bold"
            style={{ background: "#92400E", color: "#FFFFFF" }}
          >
            לעבור →
          </Link>
          <button
            onClick={dismissDepositsBanner}
            title="דלג עד החודש הבא"
            className="rounded p-1 text-[18px] font-bold hover:bg-amber-200"
            style={{ color: "#92400E" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ═══════ Macro — BoI / Prime / Inflation control ═══════ */}
      <MacroPanel />

      {/* ═══════ Recommendations — prominent card design (2026-05-19)
          Solid white surface, strong colored accent stripe, large icon chip,
          clear title/detail hierarchy. Each links to the page that owns the fix. */}
      {(() => {
        if (nudges.length === 0) return null;
        const SEV: Record<
          string,
          { stripe: string; chipBg: string; chipFg: string; eyebrow: string }
        > = {
          critical: {
            stripe: "#DC2626",
            chipBg: "#FEE2E2",
            chipFg: "#DC2626",
            eyebrow: "דחוף לטפל",
          },
          warning: {
            stripe: "#D97706",
            chipBg: "#FEF3C7",
            chipFg: "#92400E",
            eyebrow: "שווה תשומת לב",
          },
          info: {
            stripe: "#2563EB",
            chipBg: "#DBEAFE",
            chipFg: "#1D4ED8",
            eyebrow: "לידיעה",
          },
          opportunity: {
            stripe: "#2C7A5A",
            chipBg: "#E8F4D1",
            chipFg: "#1F5A42",
            eyebrow: "הזדמנות",
          },
        };
        return (
          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: "var(--morning-leaf-tint)", color: "var(--morning-forest)" }}
                >
                  <span className="material-symbols-outlined text-[20px]">tips_and_updates</span>
                </div>
                <div>
                  <h2
                    className="text-[17px] font-bold leading-tight"
                    style={{ color: "var(--morning-ink)" }}
                  >
                    המלצות לחודש הזה
                  </h2>
                  <div className="text-[12px]" style={{ color: "var(--morning-muted)" }}>
                    {nudges.length} פעולות שכדאי לשקול
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {nudges.map((n) => {
                const c = SEV[n.severity];
                const card = (
                  <div
                    className="group relative flex items-start gap-4 overflow-hidden rounded-xl p-4 transition-all"
                    style={{
                      background: "var(--morning-surface)",
                      border: "1px solid var(--morning-border)",
                      boxShadow: "var(--morning-shadow-card)",
                    }}
                  >
                    {/* Left accent stripe (RTL) */}
                    <span
                      aria-hidden
                      className="absolute bottom-0 right-0 top-0"
                      style={{ width: 4, background: c.stripe }}
                    />
                    <div
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: c.chipBg, color: c.chipFg }}
                    >
                      <span className="material-symbols-outlined text-[22px]">{n.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[11px] font-semibold"
                        style={{ color: c.chipFg }}
                      >
                        {c.eyebrow}
                      </div>
                      <div
                        className="mt-0.5 text-[15px] font-bold leading-tight"
                        style={{ color: "var(--morning-ink)" }}
                      >
                        {n.title}
                      </div>
                      <div
                        className="mt-1.5 text-[13px] leading-relaxed"
                        style={{ color: "var(--morning-muted)" }}
                      >
                        {n.detail}
                      </div>
                    </div>
                    {n.href && (
                      <span
                        className="material-symbols-outlined self-center text-[20px] transition-transform group-hover:-translate-x-0.5"
                        style={{ color: "var(--morning-muted)" }}
                      >
                        chevron_left
                      </span>
                    )}
                  </div>
                );
                return n.href ? (
                  <Link
                    key={n.id}
                    href={n.href as any}
                    className="block transition-shadow hover:shadow-md"
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={n.id}>{card}</div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ═══════ Zone 1 + Zone 2 — Two Cards Side by Side ═══════ */}
      <section className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Zone 1 — Monthly Cashflow */}
        <Link
          href={"/balance" as any}
          className="card-pad group transition-all duration-300"
        >
          <div className="mb-5 flex items-start gap-3">
            <div className="icon-sm icon-forest">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </div>
            <div className="caption pt-2.5">תזרים חודשי</div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-x-5 gap-y-4">
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
              <div className="kpi-value" style={{ color: latestGap >= 0 ? "#2C7A5A" : "#DC2626" }}>
                {fmtILS(latestGap)}
              </div>
            </div>
            <div>
              <div
                className="caption mb-1.5"
                title={
                  salaryRealRate !== null
                    ? "חיסכון פנסיוני בלבד (פנסיה + השתלמות) מתוך השכר ברוטו. חיסכון פנוי לא נכלל."
                    : "חיסכון מתוך התקציב החודשי — (הכנסות פחות הוצאות) חלקי הכנסות."
                }
              >
                אחוז חיסכון
              </div>
              <div className="flex items-baseline gap-2">
                {hasIncomeData ? (
                  <>
                    <span className="kpi-value" style={{ color: savingsLabelColor }}>
                      {savingsRate.toFixed(1)}%
                    </span>
                    {savingsLabel && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{
                          background: savingsRate >= 10 ? "#2C7A5A" : `${savingsLabelColor}15`,
                          color: savingsLabelColor,
                        }}
                      >
                        {savingsLabel}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="kpi-value" style={{ color: "#6B7280" }}>
                    —
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Savings rate bar */}
          <div className="h-1.5 w-full rounded-full" style={{ background: "#E5E7EB" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.max(0, savingsRate) * 2.5)}%`,
                background: `linear-gradient(90deg, ${savingsLabelColor}, ${savingsLabelColor}cc)`,
              }}
            />
          </div>

          {/* Business / personal split — only when there's at least one business row */}
          {scopeSplit && (
            <div
              className="mt-4 border-t pt-3 text-[10px]"
              style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: SCOPE_COLORS.personal }}
                  />
                  פרטי
                </span>
                <span className="font-bold tabular-nums">
                  {fmtILS(Math.round(scopeSplit.personal))}
                </span>
              </div>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: SCOPE_COLORS.business }}
                  />
                  עסקי
                </span>
                <span className="font-bold tabular-nums">
                  {fmtILS(Math.round(scopeSplit.business))}
                </span>
              </div>
              <div
                className="flex items-center justify-between border-t pt-1"
                style={{ borderColor: "#E5E7EB" }}
              >
                <span className="font-extrabold" style={{ color: "#1A1A1A" }}>
                  סה״כ
                </span>
                <span className="font-extrabold tabular-nums" style={{ color: "#1A1A1A" }}>
                  {fmtILS(Math.round(scopeSplit.personal + scopeSplit.business))}
                </span>
              </div>
            </div>
          )}
        </Link>

        {/* Zone 2 — Net Worth + Donut (Forest Hero) */}
        <Link
          href={"/balance" as any}
          className="card-forest group relative overflow-hidden transition-all duration-300"
        >
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="icon-sm"
                style={{ background: "rgba(255,255,255,0.06)", color: "#2C7A5A" }}
              >
                <span className="material-symbols-outlined text-[20px]">insights</span>
              </div>
              <div className="caption">שווי נטו</div>
            </div>
            {nwChange !== null && (
              <span className={`pill ${nwChange >= 0 ? "pill-mint" : "pill-danger"}`}>
                <span className="material-symbols-outlined text-[12px]">
                  {nwChange >= 0 ? "trending_up" : "trending_down"}
                </span>
                {nwChangePct !== null && (
                  <>
                    {nwChangePct >= 0 ? "+" : ""}
                    {nwChangePct.toFixed(1)}%
                  </>
                )}
              </span>
            )}
          </div>

          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div
                className="tabular text-white"
                style={{
                  fontSize: 36,
                  lineHeight: "42px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtILS(netWorthVal)}
              </div>
                {nwChange !== null && (
                  <div
                    className="tabular mt-1 text-[11px] font-bold"
                    style={{ color: "rgba(249,250,242,0.55)" }}
                  >
                  {fmtILS(nwChange, { signed: true })} מהחודש הקודם
                  </div>
                )}
              <div className="mt-4 space-y-2">
                <div className="pill-inner flex items-center justify-between">
                  <span
                    className="text-[12px] font-bold"
                    style={{ color: "rgba(249,250,242,0.65)" }}
                  >
                    נכסים
                  </span>
                  <span
                    className="tabular text-[13px] font-extrabold text-white"
                    style={{ fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif" }}
                  >
                    {fmtILS(totalAssets)}
                  </span>
                </div>
                <div className="pill-inner flex items-center justify-between">
                  <span
                    className="text-[12px] font-bold"
                    style={{ color: "rgba(249,250,242,0.72)" }}
                  >
                    התחייבויות
                  </span>
                  <span
                    className="tabular text-[13px] font-extrabold"
                    style={{
                      color: "#FCA5A5",
                      fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
                    }}
                  >
                    {fmtILS(totalLiabilities)}
                  </span>
                </div>
                {/* Leverage = liabilities / assets. Light tones to read on the
                    forest-green hero — full saturation (#b91c1c/#D97706/#2C7A5A)
                    disappears against the dark green. */}
                {totalAssets > 0 && (() => {
                  const lev = Math.round((totalLiabilities / totalAssets) * 100);
                  const levColor =
                    lev > 60 ? "#FCA5A5" : lev > 40 ? "#FCD34D" : "#86EFAC";
                  const levLabel =
                    lev === 0
                      ? "ללא חובות"
                      : lev <= 40
                        ? "בריא"
                        : lev <= 60
                          ? "סביר"
                          : "גבוה";
                  return (
                    <div className="pill-inner flex items-center justify-between">
                      <span
                        className="text-[12px] font-bold"
                        style={{ color: "rgba(249,250,242,0.72)" }}
                      >
                        מינוף · {levLabel}
                      </span>
                      <span
                        className="tabular text-[13px] font-extrabold"
                        style={{
                          color: levColor,
                          fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
                        }}
                      >
                        {lev}%
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="w-[130px] shrink-0">
              <AssetDonut slices={allocationSlices} />
            </div>
          </div>
        </Link>
      </section>

      {/* Monthly Deposits Widget removed from dashboard per Nir (2026-05-19) —
          lives on its own /deposits page; couples don't need it on the home view. */}

      {/* ═══════ Zone 3 — Growth Chart (Full Width) ═══════ */}
      <section className="card-pad-lg relative mb-10 overflow-hidden">
        <div className="relative">
          <div className="mb-6 flex items-end justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-sm icon-forest">
                <span className="material-symbols-outlined text-[20px]">landscape</span>
              </div>
              <div>
                <div className="caption mb-1">
                  {viewMode === "capital" ? "הר העושר" : "הכנסה חודשית בפרישה"}
                </div>
                <h3 className="t-lg font-extrabold" style={{ color: "var(--morning-forest)" }}>
                  {viewMode === "capital" ? "תחזית צמיחה הוליסטית" : "הכנסה חודשית בפרישה"}
                </h3>
                {fireResult.fireAge !== null &&
                  fireResult.yearsToFire !== null &&
                  fireResult.yearsToFire >= 0 && (
                    <div
                      className="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
                      style={{ background: "var(--morning-leaf-tint)", color: "var(--morning-forest-deep)" }}
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ color: "var(--morning-forest)" }}
                      >
                        explore
                      </span>
                      חופש כלכלי בגיל {fireResult.fireAge} ({fireResult.fireYear}) · עוד{" "}
                      {fireResult.yearsToFire} שנה
                    </div>
                  )}
                {fireResult.fireAge === null && fireResult.monthlyExpenses > 0 && (
                  <div
                    className="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
                    style={{ background: "rgba(217,119,6,0.12)", color: "#92400E" }}
                  >
                    <span className="material-symbols-outlined text-[14px]">explore_off</span>
                    עוד {fmtILS(Math.round(fireResult.gapToFireCapital))} כדי להגיע לחופש כלכלי
                  </div>
                )}
                {/* Plan Score + Missing/Surplus — 3 compact badges */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
                    style={{
                      background:
                        lifeCoverage.planScore >= 75
                          ? "#2C7A5A"
                          : lifeCoverage.planScore >= 50
                            ? "rgba(217,119,6,0.12)"
                            : "rgba(220,38,38,0.12)",
                      color:
                        lifeCoverage.planScore >= 75
                          ? "#2C7A5A"
                          : lifeCoverage.planScore >= 50
                            ? "#92400E"
                            : "#DC2626",
                    }}
                    title="מדד פלאן · 0-100 · גבוה=טוב יותר. משקלל כיסוי יעדים, חיסכון, חוב, וקרן חירום."
                  >
                    <span className="material-symbols-outlined text-[13px]">speed</span>
                    מדד פלאן · {lifeCoverage.planScore}/100
                  </span>
                  {lifeCoverage.missingPiece > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
                      style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626" }}
                      title="ערך נוכחי של יעדים שלא יכוסו לפי המסלול הנוכחי"
                    >
                      <span className="material-symbols-outlined text-[13px]">remove_circle</span>
                      חתיכה חסרה · {fmtILS(lifeCoverage.missingPiece)}
                    </span>
                  )}
                  {lifeCoverage.surplusPiece > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
                      style={{ background: "#FAFAF7", color: "#78350F" }}
                      title="כסף בעו״ש מעל קרן חירום של 6 חודשים — כסף שלא עובד"
                    >
                      <span className="material-symbols-outlined text-[13px]">savings</span>
                      חתיכה עודפת · {fmtILS(lifeCoverage.surplusPiece)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-5">
              {/* Legend — adapts to view mode */}
              <div className="flex gap-4 text-[10px] font-bold text-verdant-muted">
                {viewMode === "capital" ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#059669" }} />
                      נדל&quot;ן
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#FFFFFF" }} />
                      פנסיוני
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#2C7A5A" }} />
                      נזיל + השקעות
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#059669" }} />
                      שכ&quot;ד נטו
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#FFFFFF" }} />
                      פנסיה + בט&quot;ל + השתלמות
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#2C7A5A" }} />
                      משיכה נזילה (SWR)
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Range picker + display-mode toggle + view-mode toggle */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            {/* Capital ↔ Income — the "heart of the heart" toggle */}
            <div
              className="flex w-fit gap-1 rounded-lg p-1"
              style={{ background: "rgba(44,122,90,0.06)" }}
              title="הון מצטבר מול הכנסה חודשית בפרישה"
            >
              {[
                { key: "capital", label: "הון" },
                { key: "income", label: "קצבה חודשית" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setViewMode(m.key as "capital" | "income")}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-all ${
                    viewMode === m.key
                      ? "bg-[#FFFFFF] text-verdant-ink shadow-sm"
                      : "text-verdant-muted hover:text-verdant-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div
              className="flex w-fit gap-1 rounded-lg p-1"
              style={{ background: "rgba(44,122,90,0.06)" }}
            >
              {CHART_RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setChartRange(r.key)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-all ${
                    chartRange === r.key
                      ? "bg-[#FFFFFF] text-verdant-ink shadow-sm"
                      : "text-verdant-muted hover:text-verdant-ink"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div
              className="flex w-fit gap-1 rounded-lg p-1"
              style={{ background: "rgba(44,122,90,0.06)" }}
              title="ריאלי = אחרי אינפלציה ומס 25%"
            >
              {[
                { key: "nominal", label: "נומינלי" },
                { key: "real", label: "ריאלי (נטו)" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setDisplayMode(m.key as "nominal" | "real")}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-all ${
                    displayMode === m.key
                      ? "bg-[#FFFFFF] text-verdant-ink shadow-sm"
                      : "text-verdant-muted hover:text-verdant-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {displayMode === "real" && (
              <span
                className="rounded-full px-2 py-1 text-[10px] font-bold"
                style={{ background: "var(--morning-leaf-tint)", color: "var(--morning-forest-deep)" }}
              >
                ערכי היום · כולל אינפלציה ומס 25%
              </span>
            )}
          </div>

          <svg
            viewBox={`0 0 ${CW} ${CH}`}
            className="w-full"
            style={{ height: 280, background: "#F4F5F0", borderRadius: 8 }}
          >
            <defs>
              <linearGradient id="wm-re" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="wm-pen" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="wm-liq" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2C7A5A" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#2C7A5A" stopOpacity="0.08" />
              </linearGradient>
              <linearGradient id="wm-total" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="55%" stopColor="#2C7A5A" />
                <stop offset="100%" stopColor="#059669" />
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
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const yPos = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - f);
              const tickVal = maxNW * f;
              return (
                <g key={f}>
                  <line
                    x1="0"
                    x2={CW - 44}
                    y1={yPos}
                    y2={yPos}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray={f === 0 ? undefined : "2 4"}
                  />
                  {f > 0 && (
                    <text
                      x={CW - 2}
                      y={yPos + 4}
                      textAnchor="end"
                      fontSize="9"
                      fill="#6B7280"
                      fontWeight="600"
                      fontFamily="Assistant, sans-serif"
                    >
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
                    d={
                      `M 0 ${CH} ` +
                      chartData
                        .map((t, i) => {
                          const x = xOf(i);
                          const y =
                            CHART_PAD_TOP +
                            (CH - CHART_PAD_TOP) *
                              (1 - (t.realestate + t.pension + t.liquid) / maxNW);
                          return `L ${x} ${y}`;
                        })
                        .join(" ") +
                      ` L ${chartW} ${CH} Z`
                    }
                    fill="url(#wm-liq)"
                  />
                  <path
                    d={
                      `M 0 ${CH} ` +
                      chartData
                        .map((t, i) => {
                          const x = xOf(i);
                          const y =
                            CHART_PAD_TOP +
                            (CH - CHART_PAD_TOP) * (1 - (t.realestate + t.pension) / maxNW);
                          return `L ${x} ${y}`;
                        })
                        .join(" ") +
                      ` L ${chartW} ${CH} Z`
                    }
                    fill="url(#wm-pen)"
                  />
                  <path
                    d={
                      `M 0 ${CH} ` +
                      chartData
                        .map((t, i) => {
                          const x = xOf(i);
                          const y =
                            CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - t.realestate / maxNW);
                          return `L ${x} ${y}`;
                        })
                        .join(" ") +
                      ` L ${chartW} ${CH} Z`
                    }
                    fill="url(#wm-re)"
                  />

                  {/* Total line — glow layer + crisp layer */}
                  <polyline
                    points={chartData
                      .map((t, i) => {
                        const x = xOf(i);
                        const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - t.total / maxNW);
                        return `${x},${y}`;
                      })
                      .join(" ")}
                    fill="none"
                    stroke="url(#wm-total)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.35"
                    filter="url(#wm-glow)"
                  />
                  <polyline
                    points={chartData
                      .map((t, i) => {
                        const x = xOf(i);
                        const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - t.total / maxNW);
                        return `${x},${y}`;
                      })
                      .join(" ")}
                    fill="none"
                    stroke="url(#wm-total)"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 3000,
                      strokeDashoffset: 0,
                      animation: "drawLine 2.2s ease-out forwards",
                    }}
                  />
                </>
              );
            })()}
            <style>{`@keyframes drawLine { from { stroke-dashoffset: 3000; } to { stroke-dashoffset: 0; } }`}</style>

            {/* End-point dot */}
            {chartData.length > 0 &&
              (() => {
                const chartW = CW - 44;
                const last = chartData[chartData.length - 1];
                const x = chartW;
                const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - last.total / maxNW);
                return (
                  <g>
                    <circle cx={x} cy={y} r="7" fill="#059669" opacity="0.25" />
                    <circle cx={x} cy={y} r="4" fill="#FFFFFF" stroke="#2C7A5A" strokeWidth="2" />
                  </g>
                );
              })()}

            {/* Peak value annotation — capital mode only (in income mode the peak
                sits right on the retirement spike, cluttering the chart) */}
            {peakPoint &&
              viewMode === "capital" &&
              (() => {
                const chartW = CW - 44;
                const peakIdx = chartData.findIndex(
                  (p) => p.age === peakPoint.age && p.year === peakPoint.year
                );
                if (peakIdx < 0) return null;
                const x = (peakIdx / (chartData.length - 1)) * chartW;
                const y = CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - peakPoint.total / maxNW);
                const labelW = 120;
                const labelX = Math.max(0, Math.min(x - labelW / 2, chartW - labelW));
                return (
                  <g>
                    <circle cx={x} cy={y} r="4" fill="#2C7A5A" opacity="0.5" />
                    <rect
                      x={labelX}
                      y={y - 20}
                      width={labelW}
                      height="16"
                      rx="3"
                      fill="#FFFFFF"
                      opacity="0.8"
                    />
                    <text
                      x={labelX + labelW / 2}
                      y={y - 8}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill="#FFFFFF"
                      fontWeight="700"
                      fontFamily="Assistant, sans-serif"
                    >
                      שיא: {fmtAxis(Math.round(peakPoint.total))} בגיל {peakPoint.age}
                    </text>
                  </g>
                );
              })()}

            {/* Goal target markers — capital mode only (buckets track ₪ capital
                targets, not monthly income — the Y-axis unit doesn't match in income mode) */}
            {buckets.length > 0 &&
              viewMode === "capital" &&
              (() => {
                const chartW = CW - 44;
                // Build list of {bucket, year} then dedupe/cluster by year to avoid overlap
                const pins = buckets
                  .filter((b) => b.targetDate)
                  .map((b) => {
                    const yr = new Date(b.targetDate).getFullYear();
                    const idx = chartData.findIndex((p) => p.year === yr);
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
                  const y =
                    CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - chartData[idx].total / maxNW);
                  const stack = yearCounts[idx] || 0;
                  yearCounts[idx] = stack + 1;
                  const pinY = Math.max(CHART_PAD_TOP + 8, y - 18 - stack * 18);
                  // 2026-05-03: red pin when goal is unfundable.
                  // A goal is "uncovered" if the projected NW at that year is
                  // less than the remaining target (target - already saved).
                  const remaining = Math.max(
                    0,
                    (bucket.targetAmount || 0) - (bucket.currentAmount || 0)
                  );
                  const projectedNW = chartData[idx].total;
                  const isCovered = projectedNW >= remaining;
                  const color = isCovered ? bucket.color || "#B45309" : "#DC2626";
                  const gap = isCovered ? 0 : Math.round(remaining - projectedNW);
                  return (
                    <g key={bucket.id}>
                      {/* Dotted vertical connector */}
                      <line
                        x1={x}
                        x2={x}
                        y1={pinY + 6}
                        y2={y}
                        stroke={color}
                        strokeDasharray="2 2"
                        strokeWidth="1"
                        opacity={isCovered ? 0.4 : 0.7}
                      />
                      {/* Pin head — red ring + inner cross when uncovered */}
                      <circle
                        cx={x}
                        cy={pinY}
                        r="7"
                        fill={color}
                        opacity={isCovered ? 0.18 : 0.28}
                      />
                      <circle cx={x} cy={pinY} r="4" fill={color} />
                      {isCovered ? (
                        <circle cx={x} cy={pinY} r="1.5" fill="#FFFFFF" />
                      ) : (
                        <g stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round">
                          <line x1={x - 2} y1={pinY - 2} x2={x + 2} y2={pinY + 2} />
                          <line x1={x - 2} y1={pinY + 2} x2={x + 2} y2={pinY - 2} />
                        </g>
                      )}
                      <title>
                        {bucket.name} · {bucket.targetDate} · יעד{" "}
                        {fmtILS(Math.round(bucket.targetAmount))}
                        {!isCovered && ` · חוסר ${fmtILS(gap)}`}
                      </title>
                    </g>
                  );
                });
              })()}

            {/* FIRE age marker — emerald vertical line at financial independence */}
            {fireResult.fireAge !== null &&
              (() => {
                const chartW = CW - 44;
                const fireIdx = chartData.findIndex((p) => p.age === fireResult.fireAge);
                if (fireIdx <= 0 || fireIdx >= chartData.length) return null;
                const x = (fireIdx / (chartData.length - 1)) * chartW;
                const y =
                  CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - chartData[fireIdx].total / maxNW);
                return (
                  <g>
                    <line
                      x1={x}
                      x2={x}
                      y1={CHART_PAD_TOP}
                      y2={CH}
                      stroke="#059669"
                      strokeDasharray="3 3"
                      strokeWidth="1.5"
                      opacity="0.7"
                    />
                    <circle cx={x} cy={y} r="6" fill="#059669" opacity="0.2" />
                    <circle cx={x} cy={y} r="3.5" fill="#059669" />
                    <rect
                      x={x - 22}
                      y={20}
                      width="44"
                      height="14"
                      rx="4"
                      fill="#059669"
                      opacity="0.15"
                    />
                    <text
                      x={x}
                      y={30}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#2C7A5A"
                      fontWeight="800"
                      fontFamily="Assistant, sans-serif"
                    >
                      חופש כלכלי
                    </text>
                  </g>
                );
              })()}

            {/* Retirement age marker */}
            {assumptions &&
              (() => {
                const chartW = CW - 44;
                const retIdx = chartData.findIndex((p) => p.age === assumptions.retirementAge);
                if (retIdx > 0 && retIdx < chartData.length) {
                  const x = (retIdx / (chartData.length - 1)) * chartW;
                  const y =
                    CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - chartData[retIdx].total / maxNW);
                  return (
                    <g>
                      <line
                        x1={x}
                        x2={x}
                        y1={CHART_PAD_TOP}
                        y2={CH}
                        stroke="#D97706"
                        strokeDasharray="4 3"
                        strokeWidth="1.5"
                        opacity="0.65"
                      />
                      <circle cx={x} cy={y} r="5" fill="#D97706" opacity="0.2" />
                      <circle cx={x} cy={y} r="3" fill="#D97706" />
                      {/* "פרישה" label above chart — centered on line, with background pill */}
                      <rect
                        x={x - 20}
                        y={4}
                        width="40"
                        height="14"
                        rx="4"
                        fill="#D97706"
                        opacity="0.15"
                      />
                      <text
                        x={x}
                        y={CHART_PAD_TOP - 8}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#b45309"
                        fontWeight="800"
                        fontFamily="Assistant, sans-serif"
                      >
                        פרישה
                      </text>
                    </g>
                  );
                }
                return null;
              })()}

            {/* Target-income overlay — horizontal dashed line at retire_income goal */}
            {viewMode === "income" &&
              targetRetireIncome > 0 &&
              (() => {
                const chartW = CW - 44;
                const yTarget =
                  CHART_PAD_TOP + (CH - CHART_PAD_TOP) * (1 - targetRetireIncome / maxNW);
                return (
                  <g>
                    <line
                      x1="0"
                      x2={chartW}
                      y1={yTarget}
                      y2={yTarget}
                      stroke="#DC2626"
                      strokeDasharray="6 4"
                      strokeWidth="1.5"
                      opacity="0.7"
                    />
                    <rect
                      x={4}
                      y={yTarget - 16}
                      width="104"
                      height="14"
                      rx="4"
                      fill="#DC2626"
                      opacity="0.12"
                    />
                    <text
                      x={6}
                      y={yTarget - 5}
                      fontSize="9"
                      fill="#DC2626"
                      fontWeight="800"
                      fontFamily="Assistant, sans-serif"
                    >
                      יעד · {fmtAxis(targetRetireIncome)}/חודש
                    </text>
                  </g>
                );
              })()}
          </svg>
          <div className="mt-2 flex justify-between px-1 text-[9px] font-bold text-verdant-muted">
            {chartData.length > 0 && (
              <>
                <span>
                  גיל {chartData[0].age} ({chartData[0].year})
                </span>
                {chartData.length > 2 && (
                  <span>
                    {fmtILS(Math.round(chartData[Math.floor(chartData.length / 2)].total))}
                  </span>
                )}
                <span>
                  גיל {chartData[chartData.length - 1].age} ({chartData[chartData.length - 1].year})
                </span>
              </>
            )}
          </div>

          {/* Income mode — gap summary vs. retire_income goal */}
          {viewMode === "income" &&
            incomeResult &&
            targetRetireIncome > 0 &&
            (() => {
              const retPoint = incomeResult.points.find(
                (p) => p.age === (assumptions?.retirementAge ?? 67)
              );
              const gap = incomeResult.gapAtRetirement;
              const shortfall = gap > 0;
              const sev = shortfall ? (gap / targetRetireIncome > 0.3 ? "critical" : "warn") : "ok";
              const color = sev === "critical" ? "#DC2626" : sev === "warn" ? "#B45309" : "#2C7A5A";
              const bg = sev === "critical" ? "rgba(220,38,38,0.12)" : sev === "warn" ? "rgba(217,119,6,0.12)" : "#2C7A5A";
              return (
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <div
                    className="rounded-xl p-3"
                    style={{ background: bg, border: `1px solid ${color}30` }}
                  >
                    <div className="text-[10px] font-bold" style={{ color }}>
                      יעד חודשי
                    </div>
                    <div className="tabular text-lg font-extrabold" style={{ color }}>
                      {fmtILS(Math.round(targetRetireIncome))}
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
                  >
                    <div className="text-[10px] font-bold text-verdant-muted">בפרישה צפוי</div>
                    <div className="tabular text-lg font-extrabold text-verdant-ink">
                      {fmtILS(Math.round(retPoint?.total ?? 0))}
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: bg, border: `1px solid ${color}30` }}
                  >
                    <div className="text-[10px] font-bold" style={{ color }}>
                      {shortfall ? "פער" : "עודף"}
                    </div>
                    <div className="tabular text-lg font-extrabold" style={{ color }}>
                      {fmtILS(Math.round(Math.abs(gap)))}
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
                  >
                    <div className="text-[10px] font-bold text-verdant-muted">
                      פער ממוצע (לכל תקופת פרישה)
                    </div>
                    <div
                      className="tabular text-lg font-extrabold"
                      style={{ color: incomeResult.gapAverage > 0 ? "#DC2626" : "#2C7A5A" }}
                    >
                      {fmtILS(Math.round(Math.abs(incomeResult.gapAverage)))}
                    </div>
                  </div>
                  <div className="col-span-4 mt-1">
                    <Link
                      href={"/retirement" as any}
                      className="flex items-center justify-between rounded-xl px-4 py-3 transition-all"
                      style={{
                        background: "linear-gradient(135deg,#2C7A5A,#1F5A42)",
                        color: "#FFFFFF",
                        boxShadow: "0 4px 12px rgba(44, 122, 90, 0.18)",
                      }}
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
        <div className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="icon-sm icon-forest">
              <span className="material-symbols-outlined text-[20px]">flag</span>
            </div>
            <div>
              <div className="caption mb-1">מטרות ויעדים</div>
              <h3 className="t-lg font-extrabold" style={{ color: "var(--morning-forest)" }}>
                מטרות ויעדים
              </h3>
              {buckets.length > 0 && (
                <div className="kpi-hint tabular mt-1 font-bold">
                  {fmtILS(totalBucketCurrent)} מתוך {fmtILS(totalBucketTargetSum)} ·{" "}
                  {buckets.length} יעדים
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
          <div className="card-mint py-10 text-center">
            <div
              className="icon-lg mx-auto mb-3"
              style={{ background: "rgba(0,0,0,0.35)", color: "var(--morning-forest)" }}
            >
              <span className="material-symbols-outlined text-[26px]">tips_and_updates</span>
            </div>
            <div className="t-lg font-extrabold" style={{ color: "var(--morning-ink)" }}>
              כל שקל חייב לדעת לאן הוא הולך
            </div>
            <div className="t-sm mt-2 font-bold" style={{ color: "rgba(10,25,41,0.7)" }}>
              צור מטרה ראשונה והתחל לעקוב אחרי המסלול
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {bucketProjections.map(({ bucket, projection }) => {
              // Status → botanical palette (no stray purple/blue — aligned with brand)
              const statusColor =
                projection.status === "ahead"
                  ? "#2C7A5A" // forest
                  : projection.status === "on_track"
                    ? "#059669" // emerald
                    : projection.status === "behind"
                      ? "#B45309" // amber
                      : "#DC2626"; // deep red
              const statusLabel =
                projection.status === "ahead"
                  ? "מקדים"
                  : projection.status === "on_track"
                    ? "בדרך"
                    : projection.status === "behind"
                      ? "בפיגור"
                      : "בסיכון";
              const progressPct = Math.min(100, Math.round(projection.progressPct * 100));
              const dateStr = (() => {
                try {
                  const d = new Date(bucket.targetDate);
                  const months = [
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
                  return `${months[d.getMonth()]} ${d.getFullYear()}`;
                } catch {
                  return bucket.targetDate;
                }
              })();

              return (
                <div
                  key={bucket.id}
                  className="flex items-center gap-5 rounded-2xl px-5 py-4 transition-all"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
                >
                  <div
                    className="icon-sm"
                    style={{
                      background: "rgba(44,122,90,0.12)",
                      color: "#2C7A5A",
                    }}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {bucket.icon || "flag"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div
                        className="truncate text-[14px] font-extrabold"
                        style={{ color: "#1A1A1A" }}
                      >
                        {bucket.name}
                      </div>
                      <div
                        className="tabular shrink-0 text-[11px] font-bold"
                        style={{ color: "#6B7280" }}
                      >
                        {dateStr}
                      </div>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full"
                      style={{ background: "#E5E7EB" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${progressPct}%`, background: "#2C7A5A" }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div
                        className="tabular text-[10px] font-bold"
                        style={{ color: "#6B7280" }}
                      >
                        {fmtILS(bucket.currentAmount)} / {fmtILS(bucket.targetAmount)}
                      </div>
                      <div
                        className="tabular text-[10px] font-bold"
                        style={{ color: "#1A1A1A" }}
                      >
                        {progressPct}%
                      </div>
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-[10px] font-bold"
                    style={{ background: `${statusColor}18`, color: statusColor }}
                  >
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
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-extrabold text-verdant-ink">תובנות פרואקטיביות</h2>
            {totalAnnualOpportunity(insights) > 0 && (
              <span className="tabular text-[11px] font-bold" style={{ color: "#059669" }}>
                הזדמנות שנתית כוללת: {fmtILS(totalAnnualOpportunity(insights))}
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map((ins) => {
              const bar =
                ins.severity === "critical"
                  ? "#DC2626"
                  : ins.severity === "warning"
                    ? "#d97706"
                    : ins.severity === "opportunity"
                      ? "#059669"
                      : "#2C7A5A";
              return (
                <Link
                  key={ins.id}
                  href={(ins.href || "/dashboard") as any}
                  className="card-pad transition-all"
                  style={{ borderInlineStart: `4px solid ${bar}` }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="material-symbols-outlined flex-shrink-0 text-[22px]"
                      style={{ color: bar }}
                    >
                      {ins.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-sm font-extrabold text-verdant-ink">
                        {ins.title}
                      </div>
                      <p className="text-[12px] leading-5 text-verdant-muted">{ins.detail}</p>
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
