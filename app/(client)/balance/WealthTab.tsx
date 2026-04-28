"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { AssetDonut } from "@/components/charts/AssetDonut";
import { AllocationPie } from "@/components/charts/AllocationPie";
import { buildPensionAllocations } from "@/lib/pension-allocation";
import { buildSecuritiesAllocations } from "@/lib/securities-allocation";
import { fmtILS } from "@/lib/format";
import { getDebtAsLiabilities, type LiabilitySummaryRow } from "@/lib/debt-store";
import { loadPensionFunds, EVENT_NAME as PENSION_EVENT } from "@/lib/pension-store";
import { loadProperties, EVENT_NAME as RE_EVENT, type Property } from "@/lib/realestate-store";
import { loadSecurities, type SecurityRow } from "@/lib/securities-store";
import { getFundById, type FundAllocation } from "@/lib/fund-registry";
import { computeAllocation, generateInsights, type AssetWithAllocation } from "@/lib/allocation-engine";
import { DEFAULT_ALLOCATIONS } from "@/lib/default-allocations";
import { loadAssumptions } from "@/lib/assumptions";
import { buildBudgetLines, totalBudget } from "@/lib/budget-store";
import { loadAccounts, totalBankBalance, totalCreditCharges, ACCOUNTS_EVENT } from "@/lib/accounts-store";
import { loadKidsSavings, KIDS_SAVINGS_EVENT } from "@/lib/kids-savings-store";
import {
  loadHistory,
  deleteSnapshot,
  BALANCE_HISTORY_EVENT,
  type NetWorthSnapshot,
} from "@/lib/balance-history-store";
import { NetWorthHistoryChart } from "@/components/balance/NetWorthHistoryChart";
import { SolidKpi, SolidKpiRow } from "@/components/ui/SolidKpi";
import { QuickUpdateModal } from "@/components/balance/QuickUpdateModal";

// Groups displayed in the "נכסים לפי קטגוריה" card row. "liquid" is intentionally
// excluded here — checking/savings live under the Accounts tab. Liquid totals
// are still included in net worth via mergedAssets.
const ASSET_GROUPS: Record<string, { label: string; icon: string; color: string; href: string }> = {
  investments: { label: "ניירות ערך ותיק השקעות", icon: "candlestick_chart",      color: "#1B4332", href: "/investments" },
  pension:     { label: "פנסיוני ארוך טווח",      icon: "elderly",                color: "#1a6b42", href: "/pension" },
  realestate:  { label: "נדל״ן",                  icon: "home",                   color: "#125c38", href: "/realestate" },
  kids:        { label: "חיסכון לכל ילד",          icon: "child_care",             color: "#6366f1", href: "" },
  other:       { label: "רכב ונכסים נוספים",      icon: "directions_car",         color: "#2B694D", href: "" },
};
const LIAB_GROUPS: Record<string, { label: string; icon: string; color: string; href: string }> = {
  mortgage: { label: "משכנתא",         icon: "home_work",   color: "#7f1d1d", href: "/debt" },
  loans:    { label: "הלוואות",        icon: "credit_score", color: "#b91c1c", href: "/debt" },
  cc:       { label: "אשראי ותשלומים", icon: "credit_card",  color: "#ef4444", href: "/debt" },
};

export function WealthTab() {
  // Global refresh tick — lets us force-reload every data source on any
  // relevant sync event (debts, goals, buckets, budget, investments, ...).
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const bump = () => setRefreshTick(t => t + 1);
    const EVENTS = [
      "storage",
      "verdant:goals:updated",
      "verdant:buckets:updated",
      "verdant:budgets:updated",
      "verdant:investments:updated",
      "verdant:debt:updated",
      KIDS_SAVINGS_EVENT,
    ];
    EVENTS.forEach(e => window.addEventListener(e, bump));
    return () => EVENTS.forEach(e => window.removeEventListener(e, bump));
  }, []);

  // Load real debt data from SSOT
  const [realLiabilities, setRealLiabilities] = useState<LiabilitySummaryRow[]>([]);
  useEffect(() => {
    setRealLiabilities(getDebtAsLiabilities());
  }, [refreshTick]);

  // Load securities from /investments (real holdings only)
  const [securities, setSecurities] = useState<SecurityRow[]>([]);
  useEffect(() => {
    setSecurities(loadSecurities());
  }, [refreshTick]);

  // Load pension funds for allocation
  const [pensionFunds, setPensionFunds] = useState<ReturnType<typeof loadPensionFunds>>([]);
  useEffect(() => {
    setPensionFunds(loadPensionFunds());
    const handler = () => setPensionFunds(loadPensionFunds());
    window.addEventListener(PENSION_EVENT, handler);
    return () => window.removeEventListener(PENSION_EVENT, handler);
  }, [refreshTick]);

  // Load real estate properties
  const [reProperties, setReProperties] = useState<Property[]>([]);
  useEffect(() => {
    setReProperties(loadProperties());
    const handler = () => setReProperties(loadProperties());
    window.addEventListener(RE_EVENT, handler);
    return () => window.removeEventListener(RE_EVENT, handler);
  }, [refreshTick]);

  // Load bank accounts & credit cards
  const [accounts, setAccounts] = useState<ReturnType<typeof loadAccounts>>({ banks: [], creditCards: [] });
  useEffect(() => {
    setAccounts(loadAccounts());
    const handler = () => setAccounts(loadAccounts());
    window.addEventListener(ACCOUNTS_EVENT, handler);
    return () => window.removeEventListener(ACCOUNTS_EVENT, handler);
  }, [refreshTick]);

  // Load kids savings (חיסכון לכל ילד)
  const [kidsSavings, setKidsSavings] = useState<ReturnType<typeof loadKidsSavings>>([]);
  useEffect(() => {
    setKidsSavings(loadKidsSavings());
    const handler = () => setKidsSavings(loadKidsSavings());
    window.addEventListener(KIDS_SAVINGS_EVENT, handler);
    return () => window.removeEventListener(KIDS_SAVINGS_EVENT, handler);
  }, [refreshTick]);

  // Balance history snapshots
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [showQuickUpdate, setShowQuickUpdate] = useState(false);
  useEffect(() => {
    setSnapshots(loadHistory());
    const handler = () => setSnapshots(loadHistory());
    window.addEventListener(BALANCE_HISTORY_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(BALANCE_HISTORY_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const liabilities = useMemo(() => {
    const creditCardLiabilities: LiabilitySummaryRow[] = accounts.creditCards
      .filter(c => c.currentCharge > 0)
      .map(c => ({
        id: c.id,
        name: `${c.company} · ${c.lastFourDigits}`,
        liability_group: "cc" as const,
        balance: c.currentCharge,
        rate_pct: 0,
        monthly_payment: c.currentCharge,
      }));
    // Real debts only — no demo fallback. Credit cards come from accounts store.
    const base = realLiabilities.filter(l => l.liability_group !== "cc");
    return [...base, ...creditCardLiabilities];
  }, [realLiabilities, accounts]);

  // Merge REAL data only — no demo fallback.
  // Asset groups: liquid (banks) + investments (securities) + pension + realestate
  const mergedAssets = useMemo(() => {
    const reTotalValue = reProperties.reduce((s, p) => s + (p.currentValue || 0), 0);
    const reMortgageTotal = reProperties.reduce((s, p) => s + (p.mortgageBalance || 0), 0);

    const bankAssets = accounts.banks.map(b => ({
      id: b.id,
      household_id: "hh",
      asset_group: "liquid" as const,
      name: `${b.bankName} · ${b.accountNumber}`,
      balance: b.balance,
      yield_annual_pct: 2.0,
      auto_sourced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const securityAssets = securities.map(s => ({
      id: s.id,
      household_id: "hh",
      asset_group: "investments" as const,
      name: `${s.symbol}${s.broker ? " · " + s.broker : ""}`,
      balance: s.market_value_ils || 0,
      yield_annual_pct: 0,
      auto_sourced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const pensionAssets = pensionFunds.map(pf => ({
      id: `pf-${pf.id}`,
      household_id: "hh",
      asset_group: "pension" as const,
      name: `${pf.company} — ${pf.track}`,
      balance: pf.balance || 0,
      yield_annual_pct: 0,
      auto_sourced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const reAssets = reProperties.map(p => ({
      id: p.id,
      household_id: "hh",
      asset_group: "realestate" as const,
      name: p.name,
      balance: p.currentValue || 0,
      yield_annual_pct: (p.annualAppreciation ?? 0.03) * 100,
      auto_sourced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const kidsAssets = kidsSavings
      .filter(k => k.currentBalance > 0)
      .map(k => ({
        id: `kids-${k.id}`,
        household_id: "hh",
        asset_group: "kids" as const,
        name: `חיסכון · ${k.childName}`,
        balance: k.currentBalance,
        yield_annual_pct: 0,
        auto_sourced: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    return {
      assets: [...bankAssets, ...securityAssets, ...pensionAssets, ...reAssets, ...kidsAssets],
      reTotalValue,
      reMortgageTotal,
    };
  }, [reProperties, accounts, securities, pensionFunds, kidsSavings]);

  const totalAssets = mergedAssets.assets.reduce((s, a) => s + a.balance, 0);
  // Add RE mortgage balances as liabilities (avoid double-count with debt-store mortgage)
  const debtMortgageBalance = liabilities.filter(l => l.liability_group === "mortgage").reduce((s, l) => s + l.balance, 0);
  const reMortgageExtra = Math.max(0, mergedAssets.reMortgageTotal - debtMortgageBalance);
  const totalLiab  = liabilities.reduce((s, l) => s + l.balance, 0) + reMortgageExtra;
  const netWorth = totalAssets - totalLiab;
  const ratio = totalAssets > 0 ? Math.round((totalLiab / totalAssets) * 100) : 0;

  // Group assets by category
  const assetGroups = useMemo(() => {
    type AssetItem = typeof mergedAssets.assets[number];
    const groups: Record<string, { total: number; items: AssetItem[] }> = {};
    for (const a of mergedAssets.assets) {
      if (!groups[a.asset_group]) groups[a.asset_group] = { total: 0, items: [] };
      groups[a.asset_group].total += a.balance;
      groups[a.asset_group].items.push(a);
    }
    return groups;
  }, [mergedAssets]);

  // Group liabilities by category
  const liabGroups = useMemo(() => {
    const groups: Record<string, { total: number; items: LiabilitySummaryRow[] }> = {};
    for (const l of liabilities) {
      if (!groups[l.liability_group]) groups[l.liability_group] = { total: 0, items: [] };
      groups[l.liability_group].total += l.balance;
      groups[l.liability_group].items.push(l);
    }
    return groups;
  }, [liabilities]);

  // Donut slices
  const assetSlices = Object.entries(ASSET_GROUPS)
    .map(([key, meta]) => ({
      label: meta.label.split("·")[0].trim(),
      pct: Math.round(((assetGroups[key]?.total || 0) / totalAssets) * 100),
      color: meta.color,
    }))
    .filter(s => s.pct > 0);
  const liabSlices = Object.entries(LIAB_GROUPS)
    .map(([key, meta]) => ({
      label: meta.label,
      pct: totalLiab > 0 ? Math.round(((liabGroups[key]?.total || 0) / totalLiab) * 100) : 0,
      color: meta.color,
    }))
    .filter(s => s.pct > 0);

  // Advisor insights based on data
  const insights: { icon: string; title: string; text: string; severity: "info" | "warn" | "good" }[] = [];
  if (ratio > 40) {
    insights.push({ icon: "warning", title: "יחס חוב גבוה", text: `יחס חוב/נכס ${ratio}% — גבוה מ-40%. שקלו מיחזור או צמצום התחייבויות.`, severity: "warn" });
  } else {
    insights.push({ icon: "verified", title: "יחס חוב בריא", text: `יחס חוב/נכס ${ratio}% — בטווח הבריא (מתחת ל-40%).`, severity: "good" });
  }
  const liquidTotal = assetGroups["liquid"]?.total || 0;
  // Real monthly expense: prefer actual transactions, fallback to assumptions.
  // Recomputes when budget/assumptions events fire via refreshTick.
  const monthlyExpense = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try {
      const lines = buildBudgetLines(0);
      const totals = totalBudget(lines);
      if (totals.actual > 0) return totals.actual;
      const a = loadAssumptions();
      if (a.monthlyExpenses > 0) return a.monthlyExpenses;
    } catch {}
    return 0;
  }, [refreshTick]);
  const emergencyMonths = liquidTotal > 0 ? (liquidTotal / monthlyExpense) : 0;
  if (emergencyMonths < 3) {
    insights.push({ icon: "savings", title: "קרן חירום נמוכה", text: `${emergencyMonths.toFixed(1)} חודשי הוצאה בנזילות — מומלץ 3-6 חודשים.`, severity: "warn" });
  }
  const pensionPct = totalAssets > 0 ? Math.round(((assetGroups["pension"]?.total || 0) / totalAssets) * 100) : 0;
  if (pensionPct > 40) {
    insights.push({ icon: "lock", title: "ריכוז פנסיוני גבוה", text: `${pensionPct}% מהנכסים נעולים בפנסיה — שקלו גיוון לנכסים נזילים יותר.`, severity: "info" });
  }

  // ─── Allocation Engine ───
  const allocationBreakdown = useMemo(() => {
    const assets: AssetWithAllocation[] = [];

    // Add pension funds with registry-based allocation
    for (const pf of pensionFunds) {
      const reg = pf.registeredFundId ? getFundById(pf.registeredFundId) : null;
      const defaultAlloc: FundAllocation = {
        currency: { ILS: 80, USD: 13, EUR: 4, OTHER: 3 },
        geography: { IL: 55, US: 25, EU: 10, EM: 5, OTHER: 5 },
        assetClass: { equity: 47, bonds: 38, cash: 9, alternative: 6 },
        liquidity: "conditional",
      };
      assets.push({
        id: `pension-${pf.id}`,
        name: `${pf.company} — ${pf.track}`,
        value: pf.balance,
        sector: "pension",
        allocation: reg ? reg.allocation : defaultAlloc,
      });
    }

    // Add other assets with default allocations
    for (const a of mergedAssets.assets) {
      // pension assets already added from pension funds above
      if (a.asset_group === "pension") continue;
      let alloc = DEFAULT_ALLOCATIONS.bank_account; // fallback
      let sector: AssetWithAllocation["sector"] = "cash";
      if (a.asset_group === "liquid") { alloc = DEFAULT_ALLOCATIONS.bank_account; sector = "cash"; }
      else if (a.asset_group === "investments") { alloc = DEFAULT_ALLOCATIONS.us_stock; sector = "investment"; }
      else if (a.asset_group === "realestate") { alloc = DEFAULT_ALLOCATIONS.realestate_il; sector = "realestate"; }
      else if (a.asset_group === "kids") { alloc = DEFAULT_ALLOCATIONS.bank_account; sector = "investment"; }

      assets.push({
        id: `asset-${a.id}`,
        name: a.name,
        value: a.balance,
        sector,
        allocation: alloc,
      });
    }

    return computeAllocation(assets);
  }, [pensionFunds, mergedAssets]);

  const allocationInsights = useMemo(() => generateInsights(allocationBreakdown), [allocationBreakdown]);

  const severityColors = { warn: "#b91c1c", good: "#1B4332", info: "#1d4ed8" };
  const severityBg = { warn: "#fef2f2", good: "#f0fdf4", info: "#eff6ff" };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Wealth Map · הון עצמי"
        title="מפת נכסים"
        description="תמונת על של הנכסים, ההתחייבויות וההון העצמי שלכם"
      />

      {/* ===== KPI Bento — solid Botanical tiles (first, right under header) ===== */}
      <SolidKpiRow>
        <SolidKpi label="סך נכסים"             value={fmtILS(totalAssets)} icon="savings"          tone="forest" />
        <SolidKpi label="סך התחייבויות"        value={fmtILS(totalLiab)}   icon="credit_card_off"  tone="red" />
        <SolidKpi label="הון עצמי (Net Worth)" value={fmtILS(netWorth)}    icon="account_balance"  tone="emerald" />
        <SolidKpi label="יחס חוב/נכס"          value={`${ratio}%`}         icon="balance"          tone={ratio > 40 ? "red" : "sage"} sub="בריא: מתחת ל-40%" />
      </SolidKpiRow>

      {/* ===== Advisor Insights (after KPIs) ===== */}
      {insights.length > 0 && (
        <section className="space-y-2 mb-6">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: severityBg[ins.severity], border: `1px solid ${severityColors[ins.severity]}22` }}>
              <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: severityColors[ins.severity] }}>{ins.icon}</span>
              <div>
                <div className="text-sm font-extrabold" style={{ color: severityColors[ins.severity] }}>{ins.title}</div>
                <div className="text-xs text-verdant-muted mt-0.5">{ins.text}</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ===== Net Worth History ===== */}
      <section className="card-pad mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">trending_up</span>
            <h2 className="text-sm font-extrabold text-verdant-ink">היסטוריית שווי נקי</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/report" className="btn btn-secondary btn-sm">
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              הפק דוח ללקוח (PDF)
            </Link>
            <button type="button" onClick={() => setShowQuickUpdate(true)} className="btn btn-primary btn-sm">
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              עדכון מהיר
            </button>
          </div>
        </div>

        <NetWorthHistoryChart snapshots={snapshots} />

        {snapshots.length > 0 && (
          <div className="mt-5 pt-4 border-t v-divider">
            <div className="caption mb-2">
              צילומים אחרונים
            </div>
            <div className="space-y-1.5">
              {[...snapshots].reverse().slice(0, 6).map(s => (
                <div
                  key={s.id}
                  className="group flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#f4f7ed] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-verdant-ink tabular">
                      {s.date.split("-").reverse().join("/")}
                    </span>
                    {s.note && (
                      <span className="text-[11px] text-verdant-muted truncate max-w-[200px]">
                        {s.note}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-extrabold tabular text-verdant-emerald">
                      {fmtILS(s.netWorth)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = deleteSnapshot(s.id);
                        setSnapshots(next);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-bold"
                      style={{ color: "#dc2626" }}
                      aria-label="מחק צילום"
                    >
                      מחק
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===== Distribution donuts ===== */}
      {/* ===== Total Exposure — 2026-04-28 unified pie ─────────
           Combines pension (by risk), securities (by kind→asset class),
           real estate (full value), and cash. This is the "אתם חשופים ל-X%
           מניות / Y% אג"ח / Z% נדל"ן" view Nir asked for. */}
      {(() => {
        const penAlloc = buildPensionAllocations(pensionFunds);
        const secAlloc = buildSecuritiesAllocations(securities);

        // Map securities kinds → asset class
        const STOCK_KINDS = new Set(["rsu", "option", "espp", "stock", "etf"]);
        const BOND_KINDS  = new Set(["bond"]);
        let secStocks = 0, secBonds = 0, secOther = 0;
        for (const s of secAlloc.byKind) {
          if (STOCK_KINDS.has(s.key)) secStocks += s.value;
          else if (BOND_KINDS.has(s.key)) secBonds += s.value;
          else secOther += s.value; // crypto, fund, other
        }

        // Pension by risk (already in ₪)
        const penEquity = penAlloc.byRisk.find(s => s.key === "equity")?.value || 0;
        const penBonds  = penAlloc.byRisk.find(s => s.key === "bonds")?.value  || 0;
        const penCash   = penAlloc.byRisk.find(s => s.key === "cash")?.value   || 0;
        const penAlt    = penAlloc.byRisk.find(s => s.key === "alternative")?.value || 0;
        const penUnknown= penAlloc.byRisk.find(s => s.key === "unknown")?.value || 0;

        // Real estate equity (value − mortgage)
        const reEquity = reProperties.reduce((sum: number, p: Property) => {
          const v = p.currentValue || 0;
          const m = p.mortgageBalance || 0;
          return sum + Math.max(0, v - m);
        }, 0);

        // Cash from bank accounts
        const cashTotal = totalBankBalance(accounts);

        const total = penEquity + penBonds + penCash + penAlt + penUnknown
                    + secStocks + secBonds + secOther + reEquity + cashTotal;

        if (total === 0) return null;

        const totalSlices = [
          { key: "equity",  label: "מניות",       value: penEquity + secStocks, color: "#7C2D12" },
          { key: "bonds",   label: "אג״ח",        value: penBonds + secBonds,   color: "#1E3A8A" },
          { key: "re",      label: "נדל״ן",       value: reEquity,              color: "#1B4332" },
          { key: "cash",    label: "מזומן",       value: penCash + cashTotal,   color: "#0F766E" },
          { key: "alt",     label: "אלטרנטיבי",   value: penAlt + secOther,     color: "#6B21A8" },
          { key: "unknown", label: "לא מזוהה",   value: penUnknown,            color: "#94a3b8" },
        ]
          .filter(s => s.value > 0.5)
          .map(s => ({ ...s, pct: (s.value / total) * 100 }))
          .sort((a, b) => b.value - a.value);

        return (
          <section className="mb-6">
            <AllocationPie
              title="חשיפה כוללת — פנסיה + תיק + נדל״ן + מזומן"
              slices={totalSlices}
              size="lg"
            />
          </section>
        );
      })()}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="card-pad">
          <div className="caption mb-3">פיזור נכסים</div>
          <AssetDonut slices={assetSlices} />
        </div>
        <div className="card-pad">
          <div className="caption mb-3">פיזור התחייבויות</div>
          <AssetDonut slices={liabSlices} />
        </div>
      </section>

      {/* ===== Multi-Dimensional Allocation ===== */}
      {allocationBreakdown.totalValue > 0 && (
        <section className="card-pad mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-extrabold text-verdant-ink">איך הכסף שלך מתחלק</h2>
              <p className="text-[11px] text-verdant-muted mt-0.5">שווי כולל: {fmtILS(allocationBreakdown.totalValue)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="caption mb-2">באיזה מטבע</div>
              <WealthDonut data={allocationBreakdown.currency} />
            </div>
            <div className="text-center">
              <div className="caption mb-2">איפה בעולם</div>
              <WealthDonut data={allocationBreakdown.geography} />
            </div>
            <div className="text-center">
              <div className="caption mb-2">מה הכסף עושה</div>
              <WealthDonut data={allocationBreakdown.assetClass} />
            </div>
            <div className="text-center">
              <div className="caption mb-2">כמה נזיל</div>
              <WealthDonut data={allocationBreakdown.liquidity} />
            </div>
          </div>

          {allocationInsights.length > 0 && (
            <div className="mt-4 pt-4 border-t v-divider space-y-2">
              {allocationInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="material-symbols-outlined text-[14px] text-verdant-accent mt-0.5">lightbulb</span>
                  <span className="text-verdant-ink font-bold">{insight}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ===== Assets Summary Cards — Drill Down ===== */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">account_balance</span>
          <h2 className="text-sm font-extrabold text-verdant-ink">נכסים לפי קטגוריה</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(ASSET_GROUPS).map(([key, meta]) => {
            const group = assetGroups[key];
            if (!group) return null;
            const pct = Math.round((group.total / totalAssets) * 100);
            const hasLink = meta.href !== "";
            const inner = (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.color + "15" }}>
                      <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>{meta.icon}</span>
                    </div>
                    <div className="text-sm font-extrabold text-verdant-ink">{meta.label}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.color + "15", color: meta.color }}>
                    {pct}%
                  </span>
                </div>
                <div className="text-xl font-extrabold tabular" style={{ color: meta.color }}>{fmtILS(group.total)}</div>
                <div className="text-[11px] text-verdant-muted mt-2">
                  {group.items.length} פריטים
                  {group.items.length <= 3 && (
                    <span> · {group.items.map(a => a.name).join(", ")}</span>
                  )}
                </div>
                {hasLink && (
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t v-divider text-[10px] font-bold" style={{ color: meta.color }}>
                    <span>צפה בפירוט</span>
                    <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                  </div>
                )}
              </>
            );
            return hasLink ? (
              <Link key={key} href={meta.href as any} className="card-pad flex flex-col justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                {inner}
              </Link>
            ) : (
              <div key={key} className="card-pad flex flex-col justify-between">
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Liabilities Summary Cards — Drill Down ===== */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#b91c1c" }}>credit_score</span>
          <h2 className="text-sm font-extrabold text-verdant-ink">התחייבויות לפי קטגוריה</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(LIAB_GROUPS).map(([key, meta]) => {
            const group = liabGroups[key];
            if (!group) return null;
            const pct = totalLiab > 0 ? Math.round((group.total / totalLiab) * 100) : 0;
            const totalMonthly = group.items.reduce((s, l) => s + l.monthly_payment, 0);
            return (
              <Link
                key={key}
                href={meta.href as any}
                className="card-pad hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.color + "15" }}>
                      <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>{meta.icon}</span>
                    </div>
                    <div className="text-sm font-extrabold text-verdant-ink">{meta.label}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.color + "15", color: meta.color }}>
                    {pct}%
                  </span>
                </div>
                <div className="text-xl font-extrabold tabular" style={{ color: meta.color }}>{fmtILS(group.total)}</div>
                <div className="text-[11px] text-verdant-muted mt-2">
                  {group.items.length} פריטים · החזר חודשי: {fmtILS(totalMonthly)}
                </div>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t v-divider text-[10px] font-bold" style={{ color: meta.color }}>
                  <span>צפה בפירוט</span>
                  <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ===== Liquid shortcut — link to Accounts tab ===== */}
      <section className="mb-6">
        <Link
          href="/balance?tab=accounts"
          className="card-pad flex items-center justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#2B694D15" }}>
              <span className="material-symbols-outlined text-[22px]" style={{ color: "#2B694D" }}>account_balance_wallet</span>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">נזילים · עו״ש וחסכון</div>
              <div className="text-base font-extrabold text-verdant-ink">
                {accounts.banks.length} חשבונות
                {accounts.creditCards.length > 0 && ` · ${accounts.creditCards.length} כרטיסי אשראי`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left">
              <div className="text-2xl font-extrabold tabular" style={{ color: "#2B694D" }}>{fmtILS(liquidTotal)}</div>
              <div className="text-[11px] text-verdant-muted mt-0.5">פירוט מלא בלשונית חשבונות</div>
            </div>
            <span className="material-symbols-outlined text-[20px] text-verdant-muted">arrow_back</span>
          </div>
        </Link>
      </section>

      {/* ===== Net Worth Insight ===== */}
      <div className="card-forest">
        <div className="flex items-start gap-4">
          <div className="icon-sm flex-shrink-0" style={{ background: "rgba(193,236,212,0.18)", color: "#C1ECD4" }}>
            <span className="material-symbols-outlined text-[20px]">insights</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="caption mb-2">סיכום הון עצמי</div>
            <h3 className="t-lg font-extrabold text-white mb-2">
              הון עצמי: {fmtILS(netWorth)} · יחס חוב {ratio}%
            </h3>
            <p className="text-[13px] leading-6" style={{ color: "rgba(249,250,242,0.75)" }}>
              {ratio <= 40
                ? "המבנה הפיננסי שלכם מאוזן. המשיכו לבנות הון עצמי דרך חיסכון שוטף והפחתת התחייבויות."
                : "יחס החוב גבוה מהמומלץ. שקלו להקדים תשלומי הלוואות או למחזר את המשכנתא בעמוד ההלוואות."}
            </p>
          </div>
        </div>
      </div>

      {showQuickUpdate && (
        <QuickUpdateModal
          onClose={() => setShowQuickUpdate(false)}
          onSaved={() => setSnapshots(loadHistory())}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*          WealthDonut — Small SVG Donut Chart          */
/* ══════════════════════════════════════════════════════ */

function WealthDonut({ data }: { data: { label: string; pct: number; color: string }[] }) {
  const r = 50, cx = 60, cy = 60;
  let cum = 0;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        {data.map((d, i) => {
          const angle = (d.pct / 100) * 360;
          const start = cum;
          cum += angle;
          if (d.pct < 1) return null;
          const sr = ((start - 90) * Math.PI) / 180;
          const er = ((start + angle - 90) * Math.PI) / 180;
          const la = angle > 180 ? 1 : 0;
          return (
            <path
              key={i}
              d={`M ${cx} ${cy} L ${cx + r * Math.cos(sr)} ${cy + r * Math.sin(sr)} A ${r} ${r} 0 ${la} 1 ${cx + r * Math.cos(er)} ${cy + r * Math.sin(er)} Z`}
              fill={d.color} stroke="#fff" strokeWidth="2"
            />
          );
        })}
        <circle cx={cx} cy={cy} r="28" fill="#f9faf2" />
      </svg>
      <div className="space-y-0.5 mt-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 justify-center">
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-[10px] text-verdant-ink font-bold">{d.label}</span>
            <span className="text-[10px] text-verdant-muted tabular">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
