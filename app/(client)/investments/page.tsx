"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SolidKpi } from "@/components/ui/SolidKpi";
import { fmtILS, fmtPct } from "@/lib/format";
import { capitalGainsTax, futureValue } from "@/lib/financial-math";
import { demoSecurities, demoBenchmarks } from "@/lib/stub-data";
import { loadAssumptions } from "@/lib/assumptions";
import { netAfterTaxValue } from "@/lib/intelligence-engine";
import { triggerInvestmentSync } from "@/lib/sync-engine";
import { removeLinksForAsset } from "@/lib/asset-goal-linking";
import { GoalLinker } from "@/components/GoalLinker";
import {
  fetchQuotesBulk,
  computePerformance,
  recordSnapshot,
  fetchFXRates,
  fetchCryptoPricesBulk,
} from "@/lib/market-sync";
import type { Assumptions } from "@/lib/assumptions";
import { scopedKey } from "@/lib/client-scope";
import { pushBlobInBackground } from "@/lib/sync/blob-sync";
import { AllocationPie } from "@/components/charts/AllocationPie";
import { buildSecuritiesAllocations } from "@/lib/securities-allocation";
import { PortfolioGrowthProjector } from "@/components/investments/PortfolioGrowthProjector";
import { PortfolioImport, type ImportedRow } from "@/components/investments/PortfolioImport";

/* ─── Constants ─── */
const KIND_LABELS: Record<string, string> = {
  stock: "מניה",
  etf: "קרן סל",
  crypto: "קריפטו",
  rsu: "RSU",
  option: "אופציה",
  bond: 'אג"ח',
  fund: "קרן",
};
const KIND_COLORS: Record<string, string> = {
  stock: "#1B4332",
  etf: "#2B694D",
  crypto: "#f59e0b",
  rsu: "#2B694D",
  option: "#3b82f6",
  bond: "#06b6d4",
  fund: "#1a6b42",
};

type SortField = "symbol" | "market_value_ils" | "unrealized_pnl_ils" | "unrealized_pnl_pct";
type SortDir = "asc" | "desc";

/* ─── Securities localStorage persistence ─── */
const SECURITIES_KEY = "verdant:securities";

interface SecurityRow {
  id: string;
  household_id?: string;
  kind: string;
  symbol: string;
  broker: string | null;
  currency: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  fx_rate_to_ils: number;
  cost_basis_ils: number;
  market_value_ils: number;
  unrealized_pnl_ils: number;
  unrealized_pnl_pct: number;
  vest_date: string | null;
  strike_price: number | null;
}

function loadSecurities(): SecurityRow[] {
  // No demo fallback — factory reset clears this key; an empty array is a
  // valid user state (means "I deleted everything") and must be respected.
  try {
    const raw = localStorage.getItem(scopedKey(SECURITIES_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveSecurities(secs: SecurityRow[]) {
  try {
    localStorage.setItem(scopedKey(SECURITIES_KEY), JSON.stringify(secs));
    pushBlobInBackground("securities", secs);
    // 2026-05-03 fix (Victor): notify dashboard + balance to recalc.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("verdant:investments:updated"));
    }
  } catch {}
}

function recalcSecurity(s: SecurityRow): SecurityRow {
  const cost_basis_ils = s.quantity * s.avg_cost * s.fx_rate_to_ils;
  const market_value_ils = s.quantity * s.current_price * s.fx_rate_to_ils;
  const unrealized_pnl_ils = market_value_ils - cost_basis_ils;
  const unrealized_pnl_pct =
    cost_basis_ils > 0
      ? (unrealized_pnl_ils / cost_basis_ils) * 100
      : market_value_ils > 0
        ? 100
        : 0;
  return { ...s, cost_basis_ils, market_value_ils, unrealized_pnl_ils, unrealized_pnl_pct };
}

/* ─── Goal Linking — now via shared lib/asset-goal-linking ─── */

export default function InvestmentsPage() {
  const [sortField, setSortField] = useState<SortField>("market_value_ils");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [selectedBenchmark, setSelectedBenchmark] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [allSecurities, setAllSecurities] = useState<SecurityRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerResult, setTickerResult] = useState<{ price: number; name: string } | null>(null);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const handleImport = useCallback((rows: ImportedRow[], mode: "append" | "replace") => {
    const mapped: SecurityRow[] = rows.map((r) => ({
      id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: r.kind,
      symbol: r.symbol,
      broker: r.broker,
      currency: r.currency,
      quantity: r.quantity,
      avg_cost: r.avg_cost,
      current_price: r.current_price,
      fx_rate_to_ils: r.fx_rate_to_ils,
      cost_basis_ils: r.cost_basis_ils,
      market_value_ils: r.market_value_ils,
      unrealized_pnl_ils: r.unrealized_pnl_ils,
      unrealized_pnl_pct: r.unrealized_pnl_pct,
      vest_date: null,
      strike_price: null,
    }));
    setAllSecurities((prev) => (mode === "replace" ? mapped : [...prev, ...mapped]));
    setShowImport(false);
  }, []);

  useEffect(() => {
    setAssumptions(loadAssumptions());
    setAllSecurities(loadSecurities());
    setLoaded(true);
  }, []);

  // Persist securities + trigger sync cascade.
  // We gate on `loaded` so the initial empty state doesn't overwrite raw,
  // and we save unconditionally once loaded (even when the user deleted
  // everything — an empty portfolio is a valid state).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveSecurities(allSecurities);
      triggerInvestmentSync();
    }, 300);
    return () => clearTimeout(t);
  }, [allSecurities, loaded]);

  const securities = useMemo(() => {
    let list = [...allSecurities];
    if (filterKind !== "all") list = list.filter((s) => s.kind === filterKind);
    list.sort((a, b) => {
      const av = a[sortField] as number | string;
      const bv = b[sortField] as number | string;
      if (typeof av === "string")
        return sortDir === "asc"
          ? av.localeCompare(bv as string)
          : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [sortField, sortDir, filterKind, allSecurities]);

  const totalMarket = allSecurities.reduce((a, s) => a + s.market_value_ils, 0);
  const totalPnl = allSecurities.reduce((a, s) => a + s.unrealized_pnl_ils, 0);
  const totalCost = allSecurities.reduce((a, s) => a + s.cost_basis_ils, 0);
  const totalTax = allSecurities.reduce(
    (a, s) => a + capitalGainsTax(s.cost_basis_ils, s.market_value_ils).tax,
    0
  );
  const totalNetAfterTax = allSecurities.reduce((a, s) => {
    const kind = s.kind === "rsu" ? "rsu" : s.kind === "option" ? "option" : "securities";
    return a + netAfterTaxValue(s.market_value_ils, s.cost_basis_ils, kind).netValue;
  }, 0);
  const overallPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const kindAlloc = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of allSecurities) map[s.kind] = (map[s.kind] || 0) + s.market_value_ils;
    return Object.entries(map)
      .map(([kind, val]) => ({
        kind,
        val,
        pct: totalMarket > 0 ? Math.round((val / totalMarket) * 100) : 0,
      }))
      .sort((a, b) => b.val - a.val);
  }, [allSecurities, totalMarket]);

  const vestingItems = allSecurities.filter((s) => s.vest_date);
  const activeBenchmark = demoBenchmarks.find((b) => b.id === selectedBenchmark);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  };
  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";

  /* ─── CRUD operations ─── */
  const deleteSecurity = useCallback((id: string) => {
    setAllSecurities((prev) => prev.filter((s) => s.id !== id));
    removeLinksForAsset("security", id);
  }, []);

  const updateSecurity = useCallback((id: string, updates: Partial<SecurityRow>) => {
    setAllSecurities((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...updates };
        return recalcSecurity(merged);
      })
    );
    setEditingId(null);
  }, []);

  const addSecurity = useCallback(
    (
      sec: Omit<
        SecurityRow,
        "id" | "cost_basis_ils" | "market_value_ils" | "unrealized_pnl_ils" | "unrealized_pnl_pct"
      >
    ) => {
      const newSec = recalcSecurity({
        ...sec,
        id: `s-${Date.now()}`,
        cost_basis_ils: 0,
        market_value_ils: 0,
        unrealized_pnl_ils: 0,
        unrealized_pnl_pct: 0,
      });
      setAllSecurities((prev) => [...prev, newSec]);
      setShowAddForm(false);
    },
    []
  );

  /* ─── Refresh ALL prices (Yahoo + CoinGecko + BOI FX) ─── */
  const refreshAllPrices = useCallback(async () => {
    if (allSecurities.length === 0) return;
    if (lastRefresh && Date.now() - new Date(`1970-01-01T${lastRefresh}`).getTime() < 60000) return; // throttle 60s
    setRefreshing(true);
    try {
      // Split securities by kind
      const stockSymbols = allSecurities
        .filter((s) => s.kind !== "crypto")
        .map((s) => s.symbol)
        .filter(Boolean);
      const cryptoIds = allSecurities
        .filter((s) => s.kind === "crypto")
        .map((s) => s.symbol)
        .filter(Boolean);

      // Fetch all in parallel
      const [quotes, fxRates, cryptoQuotes] = await Promise.all([
        stockSymbols.length > 0
          ? fetchQuotesBulk(stockSymbols)
          : Promise.resolve({} as Record<string, any>),
        fetchFXRates(),
        cryptoIds.length > 0 ? fetchCryptoPricesBulk(cryptoIds) : Promise.resolve([]),
      ]);

      // Build crypto lookup
      const cryptoMap: Record<string, number> = {};
      for (const cq of cryptoQuotes) {
        cryptoMap[cq.symbol.toLowerCase()] = cq.price;
      }

      setAllSecurities((prev) =>
        prev.map((s) => {
          let updated = { ...s };
          if (s.kind === "crypto") {
            const price = cryptoMap[s.symbol.toLowerCase()];
            if (price != null) updated.current_price = price;
            updated.fx_rate_to_ils = 1; // already in ILS from CoinGecko
          } else {
            const q = quotes[s.symbol.toUpperCase()];
            if (q) updated.current_price = q.price;
            // Update FX rate if available
            if (fxRates[s.currency]) updated.fx_rate_to_ils = fxRates[s.currency];
          }
          return recalcSecurity(updated);
        })
      );
      setLastRefresh(
        new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
      );
      // Record snapshot of total portfolio for history
      const total = allSecurities.reduce((sum, s) => {
        let price = s.current_price;
        let fx = s.fx_rate_to_ils;
        if (s.kind === "crypto") {
          const cp = cryptoMap[s.symbol.toLowerCase()];
          if (cp != null) price = cp;
          fx = 1;
        } else {
          const q = quotes[s.symbol.toUpperCase()];
          if (q) price = q.price;
          if (fxRates[s.currency]) fx = fxRates[s.currency];
        }
        return sum + s.quantity * price * fx;
      }, 0);
      recordSnapshot(total);
    } finally {
      setRefreshing(false);
    }
  }, [allSecurities, lastRefresh]);

  /* ─── Ticker lookup (Yahoo Finance via public API) ─── */
  const lookupTicker = useCallback(async (symbol: string) => {
    if (!symbol.trim()) return;
    setTickerLoading(true);
    setTickerResult(null);
    try {
      // Use a public proxy-free endpoint for demo
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.trim().toUpperCase())}?interval=1d&range=1d`
      );
      if (res.ok) {
        const data = await res.json();
        const meta = data.chart?.result?.[0]?.meta;
        if (meta) {
          setTickerResult({
            price: meta.regularMarketPrice || 0,
            name: meta.shortName || meta.symbol || symbol,
          });
        }
      }
    } catch {
      // Fallback — couldn't reach API
      setTickerResult(null);
    }
    setTickerLoading(false);
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        subtitle="Capital Markets · תיק השקעות אישי"
        title="שוק ההון"
        description="ניירות ערך, קרנות סל, קריפטו, RSU ואופציות בניהולך הישיר · לראייה הוליסטית של כלל הנכסים — המאזן"
      />

      {/* ===== Market Sync Bar ===== */}
      {(() => {
        const perf = assumptions
          ? computePerformance(
              totalMarket,
              totalCost,
              12,
              assumptions.expectedReturnInvest || 0.065
            )
          : null;
        const perfBg =
          perf?.severity === "good" ? "#f0fdf4" : perf?.severity === "bad" ? "#fef2f2" : "#f9faf2";
        const perfColor =
          perf?.severity === "good" ? "#1B4332" : perf?.severity === "bad" ? "#b91c1c" : "#012d1d";
        return (
          <section
            className="mb-5 flex items-center gap-4 rounded-2xl p-5"
            style={{ background: perfBg, border: `1.5px solid ${perfColor}25` }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `${perfColor}15` }}
            >
              <span className="material-symbols-outlined text-[22px]" style={{ color: perfColor }}>
                query_stats
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ color: perfColor }}
              >
                Market Sync · סנכרון שווי שוק בזמן אמת
              </div>
              <div className="truncate text-[12px] font-extrabold text-verdant-ink">
                {perf ? perf.summary : "לחץ לסנכרון מחירים מהבורסה"}
              </div>
              {lastRefresh && (
                <div className="mt-0.5 text-[10px] font-bold text-verdant-muted">
                  עודכן לאחרונה: {lastRefresh}
                </div>
              )}
            </div>
            <button
              onClick={refreshAllPrices}
              disabled={refreshing || allSecurities.length === 0}
              className="btn-botanical flex items-center gap-2 px-5 py-2.5 text-[12px] disabled:opacity-50"
            >
              <span
                className={`material-symbols-outlined text-[16px] ${refreshing ? "animate-spin" : ""}`}
              >
                {refreshing ? "sync" : "refresh"}
              </span>
              {refreshing ? "מסנכרן..." : "רענן מחירים"}
            </button>
          </section>
        );
      })()}

      {/* ===== KPI Row ===== */}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <SolidKpi label="שווי שוק" value={fmtILS(totalMarket)} icon="account_balance" tone="ink" />
        <SolidKpi
          label="שווי נטו (אחרי מס)"
          value={fmtILS(totalNetAfterTax)}
          icon="verified"
          tone="forest"
          sub={`מס צפוי: ${fmtILS(totalTax)}`}
        />
        <SolidKpi
          label="רווח/הפסד"
          value={`${totalPnl >= 0 ? "+" : ""}${fmtILS(totalPnl)}`}
          icon="trending_up"
          tone={totalPnl >= 0 ? "emerald" : "red"}
          sub={`תשואה: ${overallPct >= 0 ? "+" : ""}${overallPct.toFixed(1)}%`}
        />
      </section>

      {/* ===== Portfolio Allocation — 2 pies: by kind + by geography (currency proxy) ===== */}
      {allSecurities.length > 0 &&
        (() => {
          const secAlloc = buildSecuritiesAllocations(allSecurities);
          return (
            <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <AllocationPie title="לפי סוג מכשיר" slices={secAlloc.byKind} size="md" />
              <AllocationPie title="לפי גאוגרפיה" slices={secAlloc.byGeo} size="md" />
            </section>
          );
        })()}

      {/* ===== Future projection (2026-05-02) ===== */}
      {totalMarket > 0 && <PortfolioGrowthProjector currentValue={totalMarket} />}

      {/* ===== Benchmark Models ===== */}
      <section className="card-pad mb-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            compare
          </span>
          <div>
            <div className="caption mb-0.5">השוואת מודלים</div>
            <h3 className="text-sm font-extrabold text-verdant-ink">השוואה למודלים</h3>
          </div>
        </div>

        {/* Index-only nudge — 2026-04-29 per Nir.
            When the portfolio holds individual stocks (kind="stock") or
            actively-managed funds (kind="fund"/"mutual-fund"), surface a
            short note suggesting broad-index exposure for diversification
            and lower fees. Pure UI hint — no automatic action. */}
        {(() => {
          const activeKinds = new Set(["stock", "fund", "mutual-fund", "mutual_fund"]);
          const flagged = allSecurities.filter((s) =>
            activeKinds.has((s.kind || "").toLowerCase())
          );
          if (flagged.length === 0) return null;
          const flaggedValue = flagged.reduce((s, x) => s + (x.market_value_ils || 0), 0);
          const pct = totalMarket > 0 ? Math.round((flaggedValue / totalMarket) * 100) : 0;
          return (
            <div
              className="mb-4 flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}
            >
              <span
                className="material-symbols-outlined mt-0.5 text-[20px]"
                style={{ color: "#92400E" }}
              >
                tips_and_updates
              </span>
              <div className="flex-1">
                <div className="mb-0.5 text-[12px] font-extrabold" style={{ color: "#92400E" }}>
                  {flagged.length} פוזיציות אקטיביות ({pct}% מהתיק)
                </div>
                <div className="text-[12px] leading-relaxed" style={{ color: "#92400E" }}>
                  מומלץ לבחון מעבר למחקי מדד רחבים (S&amp;P 500, MSCI World) לטובת פיזור מקסימלי
                  והוזלת עלויות.
                </div>
              </div>
            </div>
          );
        })()}

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {demoBenchmarks.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBenchmark(selectedBenchmark === b.id ? null : b.id)}
              className="rounded-xl border-2 p-4 text-right transition-all"
              style={{
                borderColor: selectedBenchmark === b.id ? "#1B4332" : "#e5e7d8",
                background: selectedBenchmark === b.id ? "#f0fdf4" : "#fff",
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold text-verdant-ink">{b.name}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background:
                      b.risk === "low" ? "#dcfce7" : b.risk === "medium" ? "#fef3c7" : "#fecaca",
                    color:
                      b.risk === "low" ? "#166534" : b.risk === "medium" ? "#92400e" : "#991b1b",
                  }}
                >
                  {b.risk === "low" ? "נמוך" : b.risk === "medium" ? "בינוני" : "גבוה"}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-verdant-muted">{b.description}</p>
              <div className="text-xs font-bold" style={{ color: "#1B4332" }}>
                תשואה צפויה: {(b.expectedReturn * 100).toFixed(1)}%
              </div>
            </button>
          ))}
        </div>

        {activeBenchmark && assumptions && (
          <div className="rounded-xl p-4" style={{ background: "#f4f7ed" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-extrabold text-verdant-ink">
                {activeBenchmark.name} — סימולציה ל-10 שנים
              </span>
            </div>
            <div className="mb-3 flex h-12 items-end gap-1">
              {activeBenchmark.allocation.map((a) => (
                <div key={a.label} className="flex flex-1 flex-col items-center gap-0.5">
                  <div className="text-[9px] font-bold" style={{ color: a.color }}>
                    {a.pct}%
                  </div>
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.max(a.pct * 0.4, 3)}px`, background: a.color }}
                  />
                  <div className="w-full truncate text-center text-[8px] font-bold text-verdant-muted">
                    {a.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[10px] font-bold text-verdant-muted">תיק נוכחי (10 שנים)</div>
                <div className="tabular text-sm font-extrabold text-verdant-ink">
                  {fmtILS(
                    futureValue(
                      totalMarket,
                      assumptions.monthlyInvestment,
                      assumptions.expectedReturnInvest,
                      10
                    )
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-verdant-muted">
                  {activeBenchmark.name} (10 שנים)
                </div>
                <div className="tabular text-sm font-extrabold" style={{ color: "#1B4332" }}>
                  {fmtILS(
                    futureValue(
                      totalMarket,
                      assumptions.monthlyInvestment,
                      activeBenchmark.expectedReturn,
                      10
                    )
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-verdant-muted">הפרש</div>
                <div className="tabular text-sm font-extrabold" style={{ color: "#1B4332" }}>
                  {fmtILS(
                    futureValue(
                      totalMarket,
                      assumptions.monthlyInvestment,
                      activeBenchmark.expectedReturn,
                      10
                    ) -
                      futureValue(
                        totalMarket,
                        assumptions.monthlyInvestment,
                        assumptions.expectedReturnInvest,
                        10
                      )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* "אלוקציה לפי סוג נכס" — REMOVED 2026-04-28 per Nir.
          Same data is shown in the AllocationPie above. Bars added redundancy
          and visual noise without new information. */}

      {/* ===== Vesting Timeline ===== */}
      {vestingItems.length > 0 && (
        <section className="card-pad mb-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
              event
            </span>
            <div>
              <div className="caption mb-0.5">לוח Vesting</div>
              <h3 className="text-sm font-extrabold text-verdant-ink">
                RSU ואופציות — תאריכי הבשלה
              </h3>
            </div>
          </div>
          <div className="space-y-3">
            {vestingItems.map((s) => {
              const vestDate = new Date(s.vest_date!);
              const daysLeft = Math.max(
                0,
                Math.ceil((vestDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              );
              const isPast = daysLeft === 0;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg p-3"
                  style={{ background: "#f9faf2" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="rounded px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: (KIND_COLORS[s.kind] || "#1B4332") + "15",
                        color: KIND_COLORS[s.kind] || "#1B4332",
                      }}
                    >
                      {KIND_LABELS[s.kind] || s.kind}
                    </span>
                    <div>
                      <div className="text-sm font-extrabold text-verdant-ink">{s.symbol}</div>
                      <div className="text-[11px] text-verdant-muted">
                        {s.quantity} יח׳{s.strike_price ? ` · Strike: $${s.strike_price}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div
                      className="tabular text-sm font-extrabold"
                      style={{ color: isPast ? "#1B4332" : "#012d1d" }}
                    >
                      {vestDate.toLocaleDateString("he-IL")}
                    </div>
                    <div
                      className="text-[11px] font-bold"
                      style={{ color: isPast ? "#1B4332" : "#f59e0b" }}
                    >
                      {isPast ? "הבשיל" : `${daysLeft} ימים`}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="tabular text-sm font-extrabold text-verdant-ink">
                      {fmtILS(s.market_value_ils)}
                    </div>
                    <div
                      className="tabular text-[11px] font-bold"
                      style={{ color: s.unrealized_pnl_ils >= 0 ? "#1B4332" : "#b91c1c" }}
                    >
                      {s.unrealized_pnl_ils >= 0 ? "+" : ""}
                      {fmtILS(s.unrealized_pnl_ils)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Securities Table with Edit/Delete + Goal Linking ===== */}
      <section className="card mb-6 overflow-hidden">
        <div className="v-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-extrabold text-verdant-ink">תיק ניירות ערך</h2>
            <p className="mt-0.5 text-[11px] text-verdant-muted">
              {allSecurities.length} פוזיציות · ניתן לערוך, למחוק ולשייך ליעד
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-verdant-muted">סינון:</span>
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value)}
                className="cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}
              >
                <option value="all">הכל</option>
                {Object.entries(KIND_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-[11px] font-bold"
              style={{ borderColor: "#E8E9E1", color: "#1B4332", background: "#F3F4EC" }}
            >
              <span className="material-symbols-outlined text-[14px]">upload_file</span>טען מאקסל
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn-botanical flex items-center gap-1.5 px-4 py-2 text-[11px]"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>הוסף נייר
            </button>
          </div>
        </div>

        {/* Ticker Search Bar */}
        <div className="v-divider border-b px-5 py-3" style={{ background: "#f9faf2" }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px] text-verdant-emerald">
              search
            </span>
            <input
              type="text"
              placeholder="חפש סימול מניה (למשל AAPL, MSFT)..."
              value={tickerSearch}
              onChange={(e) => setTickerSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lookupTicker(tickerSearch);
              }}
              className="flex-1 bg-transparent text-[12px] font-bold text-verdant-ink outline-none"
              dir="ltr"
            />
            <button
              onClick={() => lookupTicker(tickerSearch)}
              disabled={tickerLoading || !tickerSearch.trim()}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-bold disabled:opacity-40"
              style={{ background: "#1B433212", color: "#1B4332" }}
            >
              {tickerLoading ? (
                <span className="material-symbols-outlined animate-spin text-[14px]">
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined text-[14px]">travel_explore</span>
              )}
              חפש מחיר
            </button>
            {tickerResult && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
              >
                <span className="text-[11px] font-extrabold text-verdant-ink">
                  {tickerResult.name}
                </span>
                <span className="tabular text-[11px] font-extrabold" style={{ color: "#1B4332" }}>
                  ${tickerResult.price.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Add Security Form */}
        {showAddForm && (
          <div className="v-divider border-b px-5 py-4" style={{ background: "#f9faf2" }}>
            <AddSecurityForm
              onSave={addSecurity}
              onCancel={() => setShowAddForm(false)}
              tickerResult={tickerResult}
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted"
                style={{ background: "#f4f7ed" }}
              >
                <th className="px-3 py-2 text-right">סוג</th>
                <th
                  className="cursor-pointer select-none px-3 py-2 text-right"
                  onClick={() => toggleSort("symbol")}
                >
                  <span className="flex items-center gap-1">
                    סימול{" "}
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("symbol")}
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2 text-right">ברוקר</th>
                <th
                  className="tabular cursor-pointer select-none px-3 py-2 text-left"
                  onClick={() => toggleSort("market_value_ils")}
                >
                  <span className="flex items-center justify-end gap-1">
                    שווי (₪){" "}
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("market_value_ils")}
                    </span>
                  </span>
                </th>
                <th
                  className="tabular cursor-pointer select-none px-3 py-2 text-left"
                  onClick={() => toggleSort("unrealized_pnl_ils")}
                >
                  <span className="flex items-center justify-end gap-1">
                    רווח/הפסד{" "}
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("unrealized_pnl_ils")}
                    </span>
                  </span>
                </th>
                <th
                  className="tabular cursor-pointer select-none px-3 py-2 text-left"
                  onClick={() => toggleSort("unrealized_pnl_pct")}
                >
                  <span className="flex items-center justify-end gap-1">
                    %{" "}
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("unrealized_pnl_pct")}
                    </span>
                  </span>
                </th>
                <th className="tabular px-3 py-2 text-left">נטו (אחרי מס)</th>
                <th className="px-3 py-2 text-right">שיוך ליעד</th>
                <th className="px-3 py-2 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {securities.map((s) => {
                const color = s.unrealized_pnl_ils >= 0 ? "#1B4332" : "#b91c1c";
                const isEditing = editingId === s.id;
                return isEditing ? (
                  <tr key={s.id} className="v-divider border-b">
                    <td colSpan={9} className="px-3 py-4">
                      <InlineEditRow
                        security={s}
                        onSave={(updates) => updateSecurity(s.id, updates)}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={s.id}
                    className="v-divider border-b transition-colors hover:bg-[#f9faf2]"
                  >
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          background: (KIND_COLORS[s.kind] || "#1B4332") + "15",
                          color: KIND_COLORS[s.kind] || "#1B4332",
                        }}
                      >
                        {KIND_LABELS[s.kind] ?? s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-extrabold text-verdant-ink">{s.symbol}</div>
                      <div className="text-[10px] text-verdant-muted">
                        {s.quantity} יח׳ · ${s.current_price}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-verdant-muted">{s.broker}</td>
                    <td className="tabular px-3 py-2.5 text-left font-bold" dir="ltr">
                      {fmtILS(s.market_value_ils)}
                    </td>
                    <td
                      className="tabular px-3 py-2.5 text-left font-bold"
                      dir="ltr"
                      style={{ color }}
                    >
                      {fmtILS(s.unrealized_pnl_ils, { signed: true })}
                    </td>
                    <td
                      className="tabular px-3 py-2.5 text-left font-bold"
                      dir="ltr"
                      style={{ color }}
                    >
                      {(s.unrealized_pnl_pct ?? 0) >= 0 ? "+" : ""}
                      {(s.unrealized_pnl_pct ?? 0).toFixed(1)}%
                    </td>
                    <td className="tabular px-3 py-2.5 text-left font-bold" dir="ltr">
                      {(() => {
                        const kind =
                          s.kind === "rsu" ? "rsu" : s.kind === "option" ? "option" : "securities";
                        const { netValue, taxProvision } = netAfterTaxValue(
                          s.market_value_ils,
                          s.cost_basis_ils,
                          kind
                        );
                        return (
                          <div>
                            <div className="text-verdant-ink">{fmtILS(netValue)}</div>
                            {taxProvision > 0 && (
                              <div className="text-[9px] text-verdant-muted">
                                מס: {fmtILS(taxProvision)}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5">
                      <GoalLinker
                        assetType="security"
                        assetId={s.id}
                        assetValue={s.market_value_ils}
                        variant="compact"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditingId(s.id)}
                          title="ערוך"
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-verdant-bg"
                          style={{ background: "#f4f7ed" }}
                        >
                          <span className="material-symbols-outlined text-[14px] text-verdant-muted">
                            edit
                          </span>
                        </button>
                        <button
                          onClick={() => deleteSecurity(s.id)}
                          title="מחק"
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-red-50"
                          style={{ background: "#fef2f2" }}
                        >
                          <span
                            className="material-symbols-outlined text-[14px]"
                            style={{ color: "#b91c1c" }}
                          >
                            delete_outline
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== Tax Insight ===== */}
      <div className="card-forest">
        <div className="flex items-start gap-4">
          <div
            className="icon-sm flex-shrink-0"
            style={{ background: "rgba(193,236,212,0.18)", color: "#C1ECD4" }}
          >
            <span className="material-symbols-outlined text-[20px]">receipt_long</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="caption mb-2">תובנת מס</div>
            <h3 className="t-lg mb-2 font-extrabold text-white">
              מס רווח הון צפוי: {fmtILS(totalTax)}
            </h3>
            <p className="text-[13px] leading-6" style={{ color: "rgba(249,250,242,0.75)" }}>
              {totalTax > 10000
                ? "שקלו פריסת מימושים על פני שנות מס שונות כדי לצמצם חבות. ייתכן שכדאי לקזז הפסדים מנכסים אחרים."
                : "חבות המס הצפויה נמוכה יחסית. מומלץ לבדוק פריסה רק אם מתכננים מימוש גדול."}
            </p>
          </div>
        </div>
      </div>

      {showImport && (
        <PortfolioImport onImport={handleImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════ */

function InlineEditRow({
  security,
  onSave,
  onCancel,
}: {
  security: SecurityRow;
  onSave: (updates: Partial<SecurityRow>) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState(security.kind);
  const [symbol, setSymbol] = useState(security.symbol);
  const [broker, setBroker] = useState(security.broker ?? "");
  const [quantity, setQuantity] = useState(security.quantity.toString());
  const [avgCost, setAvgCost] = useState(security.avg_cost.toString());
  const [currentPrice, setCurrentPrice] = useState(security.current_price.toString());
  const [fxRate, setFxRate] = useState(security.fx_rate_to_ils.toString());
  const [currency, setCurrency] = useState(security.currency);
  const [vestDate, setVestDate] = useState(security.vest_date || "");
  const [strikePrice, setStrikePrice] = useState(security.strike_price?.toString() || "");

  return (
    <div
      className="space-y-3 rounded-xl p-5"
      style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}
    >
      <div className="mb-2 text-[11px] font-extrabold text-verdant-ink">
        עריכת פוזיציה — {security.symbol}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">סוג</div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
          >
            {Object.entries(KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <SmallField label="סימול" value={symbol} onChange={setSymbol} />
        <SmallField label="ברוקר" value={broker} onChange={setBroker} />
        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">מטבע</div>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
          >
            <option value="USD">USD</option>
            <option value="ILS">ILS</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <SmallField label="כמות" value={quantity} onChange={setQuantity} type="number" />
        <SmallField label="עלות ממוצעת" value={avgCost} onChange={setAvgCost} type="number" />
        <SmallField
          label="מחיר נוכחי"
          value={currentPrice}
          onChange={setCurrentPrice}
          type="number"
        />
        <SmallField label="שע״ח ל-₪" value={fxRate} onChange={setFxRate} type="number" />
        {(kind === "rsu" || kind === "option") && (
          <>
            <SmallField label="תאריך Vesting" value={vestDate} onChange={setVestDate} type="date" />
            {kind === "option" && (
              <SmallField
                label="Strike Price"
                value={strikePrice}
                onChange={setStrikePrice}
                type="number"
              />
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 border-t pt-3" style={{ borderColor: "#d8e0d0" }}>
        <button
          onClick={() =>
            onSave({
              kind,
              symbol: symbol.toUpperCase(),
              broker,
              currency,
              quantity: parseFloat(quantity) || 0,
              avg_cost: parseFloat(avgCost) || 0,
              current_price: parseFloat(currentPrice) || 0,
              fx_rate_to_ils: parseFloat(fxRate) || 3.72,
              vest_date: vestDate || null,
              strike_price: strikePrice ? parseFloat(strikePrice) : null,
            })
          }
          className="btn-botanical px-5 py-2 text-[11px]"
        >
          שמור
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost px-4 py-2 text-[11px]">
          ביטול
        </button>
      </div>
    </div>
  );
}

function AddSecurityForm({
  onSave,
  onCancel,
  tickerResult,
}: {
  onSave: (
    sec: Omit<
      SecurityRow,
      "id" | "cost_basis_ils" | "market_value_ils" | "unrealized_pnl_ils" | "unrealized_pnl_pct"
    >
  ) => void;
  onCancel: () => void;
  tickerResult: { price: number; name: string } | null;
}) {
  const [kind, setKind] = useState("stock");
  const [symbol, setSymbol] = useState("");
  const [broker, setBroker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [fxRate, setFxRate] = useState("3.72");
  const [currency, setCurrency] = useState("USD");
  const [vestDate, setVestDate] = useState("");
  const [strikePrice, setStrikePrice] = useState("");

  // Auto-fill from ticker result
  useEffect(() => {
    if (tickerResult) {
      setCurrentPrice(tickerResult.price.toFixed(2));
    }
  }, [tickerResult]);

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-extrabold text-verdant-ink">הוספת נייר ערך חדש</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">סוג</div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
          >
            {Object.entries(KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <SmallField label="סימול" value={symbol} onChange={setSymbol} placeholder="AAPL" />
        <SmallField label="ברוקר" value={broker} onChange={setBroker} placeholder="IBKR" />
        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">מטבע</div>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
          >
            <option value="USD">USD</option>
            <option value="ILS">ILS</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <SmallField
          label="כמות"
          value={quantity}
          onChange={setQuantity}
          type="number"
          placeholder="100"
        />
        <SmallField
          label="עלות ממוצעת"
          value={avgCost}
          onChange={setAvgCost}
          type="number"
          placeholder="150"
        />
        <SmallField
          label="מחיר נוכחי"
          value={currentPrice}
          onChange={setCurrentPrice}
          type="number"
          placeholder={tickerResult ? tickerResult.price.toFixed(2) : "225"}
        />
        <SmallField label="שע״ח ל-₪" value={fxRate} onChange={setFxRate} type="number" />
        {(kind === "rsu" || kind === "option") && (
          <>
            <SmallField label="תאריך Vesting" value={vestDate} onChange={setVestDate} type="date" />
            {kind === "option" && (
              <SmallField
                label="Strike Price"
                value={strikePrice}
                onChange={setStrikePrice}
                type="number"
              />
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 border-t pt-3" style={{ borderColor: "#d8e0d0" }}>
        <button
          disabled={!symbol || !quantity}
          onClick={() =>
            onSave({
              kind,
              symbol: symbol.toUpperCase(),
              broker,
              currency,
              quantity: parseFloat(quantity) || 0,
              avg_cost: parseFloat(avgCost) || 0,
              current_price: parseFloat(currentPrice) || 0,
              fx_rate_to_ils: parseFloat(fxRate) || 3.72,
              vest_date: vestDate || null,
              strike_price: strikePrice ? parseFloat(strikePrice) : null,
            })
          }
          className="btn-botanical px-5 py-2 text-[11px] disabled:opacity-40"
        >
          הוסף נייר ערך
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost px-4 py-2 text-[11px]">
          ביטול
        </button>
      </div>
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-bold text-verdant-muted">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
        style={{ borderColor: "#d8e0d0", background: "#fff" }}
        dir="ltr"
      />
    </div>
  );
}
