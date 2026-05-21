"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  /investments — Unified investments + equity comp + deposits link
 * ═══════════════════════════════════════════════════════════
 *
 * Single home for everything money-in-markets:
 *   Tab 1 — תיק השקעות   (stocks, ETFs, crypto, bonds, funds)
 *   Tab 2 — RSU / ESPP   (employee equity with §102 vesting)
 *   Tab 3 — הפקדות חודשיות (cross-link to /deposits)
 *
 * Data layer: portfolio-store (unified). The legacy /equity page still
 * reads its own store until removed in a later cleanup step.
 *
 * On first mount, a one-shot migration moves any legacy
 * `verdant:securities` + `verdant:equity_grants` into the unified store.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { SolidKpi } from "@/components/ui/SolidKpi";
import { AllocationPie } from "@/components/charts/AllocationPie";
import { GoalLinker } from "@/components/GoalLinker";
import { PortfolioGrowthProjector } from "@/components/investments/PortfolioGrowthProjector";
import { PortfolioImport, type ImportedRow } from "@/components/investments/PortfolioImport";
import { useConfirm } from "@/components/ui/ConfirmModal";

import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { loadAssumptions, type Assumptions } from "@/lib/assumptions";
import { demoBenchmarks } from "@/lib/stub-data";
import { triggerInvestmentSync } from "@/lib/sync-engine";
import { removeLinksForAsset } from "@/lib/asset-goal-linking";
import { buildSecuritiesAllocations } from "@/lib/securities-allocation";
import { loadSecurities } from "@/lib/securities-store";
import {
  computePerformance,
  fetchCryptoPricesBulk,
  fetchFXRates,
  fetchQuotesBulk,
  recordSnapshot,
} from "@/lib/market-sync";
import {
  PORTFOLIO_EVENT,
  addAccount,
  addPosition,
  deletePosition,
  isEquityComp,
  loadAccounts,
  loadPositions,
  summarizePortfolio,
  updatePosition,
  valuePosition,
  type Account,
  type AssetKind,
  type Currency,
  type Position,
  type VestingSchedule,
} from "@/lib/portfolio-store";
import { migrateLegacyToPortfolio } from "@/lib/portfolio-migration";
import {
  DEPOSITS_EVENT,
  currentMonthKey,
  loadPlans,
  summaryForMonth,
} from "@/lib/deposits-store";
import {
  CRYPTO_CREDS_EVENT,
  addCryptoCredential,
  deleteCryptoCredential,
  loadCryptoCredentials,
  markCryptoSyncFailed,
  markCryptoSyncOk,
  type CryptoCredentials,
} from "@/lib/crypto-credentials";
import { syncBinance, type CryptoSyncResult } from "@/lib/crypto-sync";

/* ─────────────────────────────────────────────────────────────
   Constants & helpers
   ───────────────────────────────────────────────────────────── */

const KIND_LABELS: Record<AssetKind, string> = {
  stock: "מניה",
  etf: "קרן סל",
  crypto: "קריפטו",
  bond: 'אג"ח',
  fund: "קרן",
  rsu: "RSU",
  espp: "ESPP",
  option: "אופציה",
};

const KIND_COLORS: Record<AssetKind, string> = {
  stock: "#2C7A5A",
  etf: "#059669",
  crypto: "#D97706",
  bond: "#06b6d4",
  fund: "#059669",
  rsu: "#059669",
  espp: "#10b981",
  option: "#2563EB",
};

const TRADEABLE_KINDS: AssetKind[] = ["stock", "etf", "crypto", "bond", "fund"];
const EQUITY_KINDS: AssetKind[] = ["rsu", "espp", "option"];

type TabId = "portfolio" | "equity" | "deposits";
type SortField = "symbol" | "marketValue" | "unrealizedPnl" | "unrealizedPnlPct";
type SortDir = "asc" | "desc";

const FX_DEFAULT: Record<Currency, number> = { ILS: 1, USD: 3.72, EUR: 4.0, GBP: 4.65 };

/* ─────────────────────────────────────────────────────────────
   Main page
   ───────────────────────────────────────────────────────────── */

export default function InvestmentsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "portfolio";
  const [tab, setTab] = useState<TabId>(
    ["portfolio", "equity", "deposits"].includes(initialTab) ? initialTab : "portfolio"
  );
  const [positions, setPositions] = useState<Position[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Bootstrap: run migration once, then load + subscribe to updates.
  useEffect(() => {
    migrateLegacyToPortfolio();
    const reload = () => {
      setPositions(loadPositions());
      setAccounts(loadAccounts());
    };
    reload();
    setAssumptions(loadAssumptions());
    setLoaded(true);
    window.addEventListener(PORTFOLIO_EVENT, reload);
    return () => window.removeEventListener(PORTFOLIO_EVENT, reload);
  }, []);

  // Unified summary across ALL positions (vested only).
  const summary = useMemo(() => summarizePortfolio(positions), [positions]);

  // Split for tab counts.
  const tradeablePositions = useMemo(
    () => positions.filter((p) => !isEquityComp(p.kind)),
    [positions]
  );
  const equityPositions = useMemo(
    () => positions.filter((p) => isEquityComp(p.kind)),
    [positions]
  );

  return (
    <div className="mx-auto max-w-6xl" dir="rtl">
      <PageHeader
        subtitle="Investments · השקעות"
        title="השקעות"
        description="תיק השקעות עצמאי, RSU/ESPP והפקדות חודשיות — מקום אחד, KPI אחד"
      />

      {/* ── Unified KPI ─────────────────────────────────────── */}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SolidKpi
          label="שווי שוק"
          value={fmtILS(summary.totalMarketValueIls)}
          icon="account_balance"
          tone="ink"
          sub={`${summary.positions} פוזיציות`}
        />
        <SolidKpi
          label="נטו אחרי מס"
          value={fmtILS(summary.totalNetAfterTaxIls)}
          icon="verified"
          tone="forest"
          sub={`מס צפוי: ${fmtILS(summary.totalTaxIls)}`}
        />
        <SolidKpi
          label="רווח/הפסד"
          value={`${summary.totalUnrealizedPnlIls >= 0 ? "+" : ""}${fmtILS(summary.totalUnrealizedPnlIls)}`}
          icon="trending_up"
          tone={summary.totalUnrealizedPnlIls >= 0 ? "emerald" : "red"}
          sub={
            summary.totalCostBasisIls > 0
              ? `${((summary.totalUnrealizedPnlIls / summary.totalCostBasisIls) * 100).toFixed(1)}%`
              : "—"
          }
        />
        <SolidKpi
          label="עוד יבשיל"
          value={fmtILS(summary.totalUnvestedValueIls)}
          icon="schedule"
          tone="ink"
          sub="RSU/ESPP בהבשלה"
        />
      </section>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <TabBar
        active={tab}
        onChange={setTab}
        counts={{
          portfolio: tradeablePositions.length,
          equity: equityPositions.length,
        }}
      />

      {/* ── Tab content ─────────────────────────────────────── */}
      {loaded && tab === "portfolio" && (
        <PortfolioTab
          positions={tradeablePositions}
          accounts={accounts}
          assumptions={assumptions}
          marketSummary={summary}
        />
      )}
      {loaded && tab === "equity" && (
        <EquityTab positions={equityPositions} accounts={accounts} />
      )}
      {loaded && tab === "deposits" && <DepositsTab />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab bar
   ───────────────────────────────────────────────────────────── */

function TabBar({
  active,
  onChange,
  counts,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  counts: { portfolio: number; equity: number };
}) {
  const tabs: { id: TabId; label: string; icon: string; count?: number }[] = [
    { id: "portfolio", label: "תיק השקעות", icon: "candlestick_chart", count: counts.portfolio },
    { id: "equity", label: "RSU / ESPP", icon: "stacked_bar_chart", count: counts.equity },
    { id: "deposits", label: "הפקדות חודשיות", icon: "savings" },
  ];

  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-0">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-[13px] font-extrabold transition-colors"
            style={{
              background: isActive ? "#FAFAF7" : "transparent",
              color: isActive ? "#2C7A5A" : "#6B7280",
              borderBottom: isActive ? "2px solid #2C7A5A" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: isActive ? "#2C7A5A" : "#E5E7EB",
                  color: isActive ? "#FFFFFF" : "#6B7280",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   TAB 1 — Portfolio (tradeable)
   ═════════════════════════════════════════════════════════════ */

function PortfolioTab({
  positions,
  accounts,
  assumptions,
  marketSummary,
}: {
  positions: Position[];
  accounts: Account[];
  assumptions: Assumptions | null;
  marketSummary: ReturnType<typeof summarizePortfolio>;
}) {
  const [sortField, setSortField] = useState<SortField>("marketValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterKind, setFilterKind] = useState<"all" | AssetKind>("all");
  const [filterAccountId, setFilterAccountId] = useState<"all" | string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerResult, setTickerResult] = useState<{ price: number; name: string } | null>(null);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Epoch ms of the last successful refresh — used both for 60-sec throttle
  // and (formatted) for the "עודכן לאחרונה" display. Previously a time-string
  // ("14:35") which broke the throttle comparison (epoch-ms vs string-time).
  const [lastRefreshMs, setLastRefreshMs] = useState<number | null>(null);
  const [selectedBenchmark, setSelectedBenchmark] = useState<string | null>(null);

  const accountsForTradeable = useMemo(() => {
    const ids = new Set(positions.map((p) => p.accountId));
    return accounts.filter((a) => ids.has(a.id));
  }, [positions, accounts]);

  const valued = useMemo(
    () =>
      positions.map((p) => ({
        position: p,
        valuation: valuePosition(p),
      })),
    [positions]
  );

  const filtered = useMemo(() => {
    let list = valued;
    if (filterKind !== "all") list = list.filter((x) => x.position.kind === filterKind);
    if (filterAccountId !== "all")
      list = list.filter((x) => x.position.accountId === filterAccountId);

    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "symbol":
          return dir * a.position.symbol.localeCompare(b.position.symbol);
        case "marketValue":
          return dir * (a.valuation.marketValueIls - b.valuation.marketValueIls);
        case "unrealizedPnl":
          return dir * (a.valuation.unrealizedPnlIls - b.valuation.unrealizedPnlIls);
        case "unrealizedPnlPct":
          return dir * (a.valuation.unrealizedPnlPct - b.valuation.unrealizedPnlPct);
      }
    });
  }, [valued, filterKind, filterAccountId, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  };
  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";

  /* ─── CRUD ─── */

  const onDelete = useCallback((id: string) => {
    deletePosition(id);
    removeLinksForAsset("security", id);
    triggerInvestmentSync();
  }, []);

  const onSaveEdit = useCallback((id: string, patch: Partial<Position>) => {
    updatePosition(id, patch);
    triggerInvestmentSync();
    setEditingId(null);
  }, []);

  const onAdd = useCallback((input: Omit<Position, "id" | "createdAt" | "updatedAt">) => {
    addPosition(input);
    triggerInvestmentSync();
    setShowAddForm(false);
  }, []);

  const onImport = useCallback(
    (rows: ImportedRow[], mode: "append" | "replace") => {
      if (mode === "replace") {
        for (const p of positions) deletePosition(p.id);
      }
      // Pick (or create) a generic "Import" account if user has none.
      let importAccountId: string;
      const existing = accounts.find((a) => a.label === "ייבוא");
      if (existing) importAccountId = existing.id;
      else {
        const created = addAccount({
          label: "ייבוא",
          currency: "ILS",
        });
        importAccountId = created.id;
      }
      for (const r of rows) {
        addPosition({
          accountId: importAccountId,
          kind: (TRADEABLE_KINDS as string[]).includes(r.kind)
            ? (r.kind as AssetKind)
            : "stock",
          symbol: r.symbol,
          quantity: r.quantity,
          avgCost: r.avg_cost,
          currentPrice: r.current_price,
          currency: (r.currency as Currency) || "ILS",
          fxRateToIls: r.fx_rate_to_ils,
        });
      }
      triggerInvestmentSync();
      setShowImport(false);
    },
    [positions, accounts]
  );

  /* ─── Refresh all prices ─── */

  const refreshAllPrices = useCallback(async () => {
    if (positions.length === 0) return;
    if (lastRefreshMs && Date.now() - lastRefreshMs < 60_000) return;
    setRefreshing(true);
    try {
      const stockSymbols = positions
        .filter((p) => p.kind !== "crypto")
        .map((p) => p.symbol)
        .filter(Boolean);
      const cryptoIds = positions
        .filter((p) => p.kind === "crypto")
        .map((p) => p.symbol)
        .filter(Boolean);

      const [quotes, fxRates, cryptoQuotes] = await Promise.all([
        stockSymbols.length > 0
          ? fetchQuotesBulk(stockSymbols)
          : Promise.resolve({} as Record<string, { price: number }>),
        fetchFXRates(),
        cryptoIds.length > 0 ? fetchCryptoPricesBulk(cryptoIds) : Promise.resolve([]),
      ]);

      const cryptoMap: Record<string, number> = {};
      for (const cq of cryptoQuotes) cryptoMap[cq.symbol.toLowerCase()] = cq.price;

      for (const p of positions) {
        const patch: Partial<Position> = {};
        if (p.kind === "crypto") {
          const price = cryptoMap[p.symbol.toLowerCase()];
          if (price != null) patch.currentPrice = price;
          patch.fxRateToIls = 1;
        } else {
          const q = quotes[p.symbol.toUpperCase()];
          if (q) patch.currentPrice = q.price;
          if (fxRates[p.currency]) patch.fxRateToIls = fxRates[p.currency];
        }
        if (Object.keys(patch).length > 0) updatePosition(p.id, patch);
      }

      // Snapshot total wealth for history charts.
      const total = positions.reduce((sum, p) => {
        let price = p.currentPrice;
        let fx = p.fxRateToIls;
        if (p.kind === "crypto") {
          const cp = cryptoMap[p.symbol.toLowerCase()];
          if (cp != null) price = cp;
          fx = 1;
        } else {
          const q = quotes[p.symbol.toUpperCase()];
          if (q) price = q.price;
          if (fxRates[p.currency]) fx = fxRates[p.currency];
        }
        return sum + p.quantity * price * fx;
      }, 0);
      recordSnapshot(total);
      setLastRefreshMs(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, [positions, lastRefreshMs]);

  const lookupTicker = useCallback(async (symbol: string) => {
    if (!symbol.trim()) return;
    setTickerLoading(true);
    setTickerResult(null);
    try {
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
      setTickerResult(null);
    }
    setTickerLoading(false);
  }, []);

  // Performance summary vs assumption
  const perf =
    assumptions && marketSummary.totalCostBasisIls > 0
      ? computePerformance(
          marketSummary.totalMarketValueIls,
          marketSummary.totalCostBasisIls,
          12,
          assumptions.expectedReturnInvest || 0.065
        )
      : null;

  const allocationData = useMemo(() => {
    // Re-use legacy adapter; bridged loadSecurities reads from portfolio store.
    const rows = loadSecurities().filter((r) => !EQUITY_KINDS.includes(r.kind as AssetKind));
    return buildSecuritiesAllocations(rows);
  }, [positions]);

  const totalMarket = marketSummary.totalMarketValueIls;
  const activeBenchmark = demoBenchmarks.find((b) => b.id === selectedBenchmark);

  /* ─── Render ─── */

  return (
    <>
      {/* Market sync bar */}
      <section
        className="mb-5 flex items-center gap-4 rounded-2xl p-5"
        style={{
          background:
            perf?.severity === "good"
              ? "#FAFAF7"
              : perf?.severity === "bad"
                ? "rgba(248,113,113,0.08)"
                : "#FAFAF7",
          border: `1.5px solid ${
            perf?.severity === "good"
              ? "#2C7A5A25"
              : perf?.severity === "bad"
                ? "#DC262625"
                : "#2C7A5A15"
          }`,
        }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "#2C7A5A15" }}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ color: "#2C7A5A" }}>
            query_stats
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: "#2C7A5A" }}
          >
            Market Sync · סנכרון שווי שוק בזמן אמת
          </div>
          <div className="truncate text-[12px] font-extrabold text-verdant-ink">
            {perf ? perf.summary : "לחץ לסנכרון מחירים מהבורסה"}
          </div>
          {lastRefreshMs && (
            <div className="mt-0.5 text-[10px] font-bold text-verdant-muted">
              עודכן לאחרונה:{" "}
              {new Date(lastRefreshMs).toLocaleTimeString("he-IL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
        <button
          onClick={refreshAllPrices}
          disabled={refreshing || positions.length === 0}
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

      {/* External exchanges (Binance, etc.) */}
      <ExchangesPanel accounts={accounts} />

      {/* Allocation pies */}
      {positions.length > 0 && (
        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <AllocationPie title="לפי סוג מכשיר" slices={allocationData.byKind} size="md" />
          <AllocationPie title="לפי גאוגרפיה" slices={allocationData.byGeo} size="md" />
        </section>
      )}

      {/* Growth projector */}
      {totalMarket > 0 && <PortfolioGrowthProjector currentValue={totalMarket} />}

      {/* Benchmark comparison */}
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

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {demoBenchmarks.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBenchmark(selectedBenchmark === b.id ? null : b.id)}
              className="rounded-xl border-2 p-4 text-right transition-all"
              style={{
                borderColor: selectedBenchmark === b.id ? "#2C7A5A" : "#e5e7d8",
                background: selectedBenchmark === b.id ? "#FAFAF7" : "#FFFFFF",
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold text-verdant-ink">{b.name}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background:
                      b.risk === "low"
                        ? "#dcfce7"
                        : b.risk === "medium"
                          ? "rgba(251,191,36,0.12)"
                          : "rgba(248,113,113,0.20)",
                    color:
                      b.risk === "low" ? "#166534" : b.risk === "medium" ? "#92400e" : "#991b1b",
                  }}
                >
                  {b.risk === "low" ? "נמוך" : b.risk === "medium" ? "בינוני" : "גבוה"}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-verdant-muted">{b.description}</p>
              <div className="text-xs font-bold" style={{ color: "#2C7A5A" }}>
                תשואה צפויה: {(b.expectedReturn * 100).toFixed(1)}%
              </div>
            </button>
          ))}
        </div>

        {activeBenchmark && assumptions && (
          <div className="rounded-xl p-4" style={{ background: "#FAFAF7" }}>
            <div className="mb-3 text-xs font-extrabold text-verdant-ink">
              {activeBenchmark.name} — סימולציה ל-10 שנים
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
                <div className="tabular text-sm font-extrabold" style={{ color: "#2C7A5A" }}>
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
                <div className="tabular text-sm font-extrabold" style={{ color: "#2C7A5A" }}>
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

      {/* Holdings table */}
      <section className="card mb-6 overflow-hidden">
        <div className="v-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-extrabold text-verdant-ink">תיק ניירות ערך</h2>
            <p className="mt-0.5 text-[11px] text-verdant-muted">
              {positions.length} פוזיציות · ניתן לערוך, למחוק ולשייך ליעד
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-verdant-muted">חשבון:</span>
              <select
                value={filterAccountId}
                onChange={(e) => setFilterAccountId(e.target.value)}
                className="cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                style={{ borderColor: "#E5E7EB", background: "#FFFFFF", color: "#1A1A1A" }}
              >
                <option value="all">הכל</option>
                {accountsForTradeable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-verdant-muted">סוג:</span>
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as "all" | AssetKind)}
                className="cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                style={{ borderColor: "#E5E7EB", background: "#FFFFFF", color: "#1A1A1A" }}
              >
                <option value="all">הכל</option>
                {TRADEABLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-[11px] font-bold"
              style={{ borderColor: "#E5E7EB", color: "#2C7A5A", background: "#FAFAF7" }}
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

        {/* Ticker search */}
        <div className="v-divider border-b px-5 py-3" style={{ background: "#FAFAF7" }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px] text-verdant-emerald">
              search
            </span>
            <input
              type="text"
              placeholder="חפש סימול (AAPL, MSFT, BTC-USD)..."
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
              style={{ background: "#2C7A5A12", color: "#2C7A5A" }}
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
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
              >
                <span className="text-[11px] font-extrabold text-verdant-ink">
                  {tickerResult.name}
                </span>
                <span className="tabular text-[11px] font-extrabold" style={{ color: "#2C7A5A" }}>
                  ${tickerResult.price.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="v-divider border-b px-5 py-4" style={{ background: "#FFFFFF" }}>
            <PositionForm
              accounts={accounts}
              tickerResult={tickerResult}
              equityMode={false}
              onSave={(data) =>
                onAdd(data as Omit<Position, "id" | "createdAt" | "updatedAt">)
              }
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted"
                style={{ background: "#FAFAF7" }}
              >
                <th className="px-3 py-2 text-right">סוג</th>
                <th
                  className="cursor-pointer select-none px-3 py-2 text-right"
                  onClick={() => toggleSort("symbol")}
                >
                  <span className="flex items-center gap-1">
                    סימול
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("symbol")}
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2 text-right">חשבון</th>
                <th
                  className="tabular cursor-pointer select-none px-3 py-2 text-left"
                  onClick={() => toggleSort("marketValue")}
                >
                  <span className="flex items-center justify-end gap-1">
                    שווי (₪)
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("marketValue")}
                    </span>
                  </span>
                </th>
                <th
                  className="tabular cursor-pointer select-none px-3 py-2 text-left"
                  onClick={() => toggleSort("unrealizedPnl")}
                >
                  <span className="flex items-center justify-end gap-1">
                    רווח/הפסד
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("unrealizedPnl")}
                    </span>
                  </span>
                </th>
                <th
                  className="tabular cursor-pointer select-none px-3 py-2 text-left"
                  onClick={() => toggleSort("unrealizedPnlPct")}
                >
                  <span className="flex items-center justify-end gap-1">
                    %
                    <span className="material-symbols-outlined text-[12px]">
                      {sortIcon("unrealizedPnlPct")}
                    </span>
                  </span>
                </th>
                <th className="tabular px-3 py-2 text-left">נטו (אחרי מס)</th>
                <th className="px-3 py-2 text-right">שיוך ליעד</th>
                <th className="px-3 py-2 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[12px] text-verdant-muted">
                    אין פוזיציות בתיק. לחץ "הוסף נייר" כדי להתחיל.
                  </td>
                </tr>
              )}
              {filtered.map(({ position, valuation }) => {
                const color = valuation.unrealizedPnlIls >= 0 ? "#2C7A5A" : "#DC2626";
                const isEditing = editingId === position.id;
                const account = accounts.find((a) => a.id === position.accountId);
                if (isEditing) {
                  return (
                    <tr key={position.id} className="v-divider border-b">
                      <td colSpan={9} className="px-3 py-4">
                        <PositionForm
                          accounts={accounts}
                          tickerResult={null}
                          equityMode={false}
                          initial={position}
                          onSave={(patch) => onSaveEdit(position.id, patch as Partial<Position>)}
                          onCancel={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={position.id}
                    className="v-divider border-b transition-colors hover:bg-[#FFFFFF]"
                  >
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          background: (KIND_COLORS[position.kind] || "#2C7A5A") + "15",
                          color: KIND_COLORS[position.kind] || "#2C7A5A",
                        }}
                      >
                        {KIND_LABELS[position.kind] ?? position.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-extrabold text-verdant-ink">{position.symbol}</div>
                      <div className="text-[10px] text-verdant-muted">
                        {valuation.effectiveQuantity} יח׳ · {position.currency}{" "}
                        {position.currentPrice}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-verdant-muted">
                      {account?.label ?? "—"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-left font-bold" dir="ltr">
                      {fmtILS(valuation.marketValueIls)}
                    </td>
                    <td
                      className="tabular px-3 py-2.5 text-left font-bold"
                      dir="ltr"
                      style={{ color }}
                    >
                      {fmtILS(valuation.unrealizedPnlIls, { signed: true })}
                    </td>
                    <td
                      className="tabular px-3 py-2.5 text-left font-bold"
                      dir="ltr"
                      style={{ color }}
                    >
                      {valuation.unrealizedPnlPct >= 0 ? "+" : ""}
                      {valuation.unrealizedPnlPct.toFixed(1)}%
                    </td>
                    <td className="tabular px-3 py-2.5 text-left font-bold" dir="ltr">
                      <div>
                        <div className="text-verdant-ink">{fmtILS(valuation.netAfterTaxIls)}</div>
                        {valuation.taxIls > 0 && (
                          <div className="text-[9px] text-verdant-muted">
                            מס: {fmtILS(valuation.taxIls)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <GoalLinker
                        assetType="security"
                        assetId={position.id}
                        assetValue={valuation.marketValueIls}
                        variant="compact"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditingId(position.id)}
                          title="ערוך"
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-verdant-bg"
                          style={{ background: "#FAFAF7" }}
                        >
                          <span className="material-symbols-outlined text-[14px] text-verdant-muted">
                            edit
                          </span>
                        </button>
                        <button
                          onClick={() => onDelete(position.id)}
                          title="מחק"
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-red-50"
                          style={{ background: "rgba(248,113,113,0.08)" }}
                        >
                          <span
                            className="material-symbols-outlined text-[14px]"
                            style={{ color: "#DC2626" }}
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

      {/* Tax insight */}
      {summarizePortfolio(positions).totalTaxIls > 0 && (
        <div className="card-forest">
          <div className="flex items-start gap-4">
            <div
              className="icon-sm flex-shrink-0"
              style={{ background: "rgba(193,236,212,0.18)", color: "#2C7A5A" }}
            >
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="caption mb-2">תובנת מס</div>
              <h3 className="t-lg mb-2 font-extrabold text-white">
                מס רווח הון צפוי: {fmtILS(summarizePortfolio(positions).totalTaxIls)}
              </h3>
              <p className="text-[13px] leading-6" style={{ color: "rgba(249,250,242,0.75)" }}>
                {summarizePortfolio(positions).totalTaxIls > 10000
                  ? "שקלו פריסת מימושים על פני שנות מס שונות כדי לצמצם חבות. ייתכן שכדאי לקזז הפסדים מנכסים אחרים."
                  : "חבות המס הצפויה נמוכה יחסית. מומלץ לבדוק פריסה רק אם מתכננים מימוש גדול."}
              </p>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <PortfolioImport onImport={onImport} onClose={() => setShowImport(false)} />
      )}
    </>
  );
}

/* ═════════════════════════════════════════════════════════════
   TAB 2 — Equity (RSU / ESPP / Options)
   ═════════════════════════════════════════════════════════════ */

function EquityTab({ positions, accounts }: { positions: Position[]; accounts: Account[] }) {
  const { confirm, modal } = useConfirm();
  const [editing, setEditing] = useState<Position | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const valued = useMemo(
    () => positions.map((p) => ({ p, v: valuePosition(p) })),
    [positions]
  );

  const totals = useMemo(() => {
    let vested = 0,
      unvested = 0,
      tax = 0,
      net = 0;
    for (const { v } of valued) {
      vested += v.marketValueIls;
      unvested += v.unvestedValueIls;
      tax += v.taxIls;
      net += v.netAfterTaxIls;
    }
    return { vested, unvested, tax, net };
  }, [valued]);

  return (
    <>
      {modal}
      {/* Hero */}
      <section
        className="mb-5 overflow-hidden rounded-3xl"
        style={{
          background: "linear-gradient(135deg, #2C7A5A 0%, #1F5A42 100%)",
          padding: "28px 32px",
          boxShadow: "0 8px 24px rgba(44, 122, 90, 0.18)",
        }}
      >
        <div
          className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          שווי נטו אחרי מס §102
        </div>
        <div
          className="text-center text-[48px] font-extrabold tabular-nums leading-none text-white"
          style={{ fontFamily: "inherit" }}
        >
          {positions.length > 0 ? fmtILS(totals.net) : "—"}
        </div>
        {positions.length > 0 && (
          <div
            className="mt-3 text-center text-[13px] font-semibold"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            הבשיל{" "}
            <span className="font-extrabold tabular-nums">{fmtILS(totals.vested)}</span>
            {"  ·  "}עוד יבשיל{" "}
            <span className="font-extrabold tabular-nums">{fmtILS(totals.unvested)}</span>
            {"  ·  "}מס{" "}
            <span className="font-extrabold tabular-nums">{fmtILS(totals.tax)}</span>
          </div>
        )}
      </section>

      {/* Add button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-extrabold text-verdant-ink">
          הקצאות ({positions.length})
        </h2>
        <button
          onClick={() => setCreatingNew(true)}
          className="btn-botanical flex items-center gap-1.5 px-4 py-2 text-[12px]"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          הוסף הקצאה
        </button>
      </div>

      {/* Empty state */}
      {positions.length === 0 && (
        <div
          className="rounded-2xl bg-[#FFFFFF] p-8 text-center"
          style={{ border: "1px dashed #E5E7EB" }}
        >
          <span className="material-symbols-outlined text-[40px] text-verdant-muted">
            inventory
          </span>
          <div className="mt-2 text-[14px] font-bold text-verdant-ink">אין הקצאות מניות</div>
          <div className="mt-1 text-[12px] text-verdant-muted">
            עובדים בהייטק? עקוב כאן אחרי RSU/ESPP עם מס §102.
          </div>
        </div>
      )}

      {/* Grant cards */}
      <div className="space-y-3">
        {valued.map(({ p, v }) => (
          <GrantCard
            key={p.id}
            position={p}
            valuation={v}
            account={accounts.find((a) => a.id === p.accountId)}
            onEdit={() => setEditing(p)}
            onDelete={async () => {
              const ok = await confirm({
                title: "למחוק את ההקצאה?",
                body: "ההקצאה תוסר מהתיק וכל הקישורים שלה למטרות יבוטלו. פעולה זו בלתי הפיכה.",
                confirmLabel: "כן, מחק",
                cancelLabel: "ביטול",
                variant: "danger",
              });
              if (!ok) return;
              deletePosition(p.id);
              removeLinksForAsset("security", p.id);
              triggerInvestmentSync();
            }}
          />
        ))}
      </div>

      {/* Editor */}
      {(editing || creatingNew) && (
        <PositionForm
          accounts={accounts}
          tickerResult={null}
          equityMode
          initial={editing ?? undefined}
          onSave={(patch) => {
            if (editing) {
              updatePosition(editing.id, patch as Partial<Position>);
            } else {
              addPosition(patch as Omit<Position, "id" | "createdAt" | "updatedAt">);
            }
            triggerInvestmentSync();
            setEditing(null);
            setCreatingNew(false);
          }}
          onCancel={() => {
            setEditing(null);
            setCreatingNew(false);
          }}
          variant="modal"
        />
      )}
    </>
  );
}

function GrantCard({
  position,
  valuation,
  account,
  onEdit,
  onDelete,
}: {
  position: Position;
  valuation: ReturnType<typeof valuePosition>;
  account: Account | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const company = position.grant?.company || account?.label || position.symbol;
  return (
    <div className="rounded-2xl bg-[#FFFFFF] p-5" style={{ border: "1px solid #E5E7EB" }}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-extrabold text-verdant-ink">{company}</span>
            {position.symbol && position.symbol !== company && (
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-extrabold"
                style={{ background: "#FAFAF7", color: "#2C7A5A" }}
              >
                {position.symbol}
              </span>
            )}
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "#2C7A5A", color: "#FFFFFF" }}
            >
              {KIND_LABELS[position.kind]}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-verdant-muted">
            {position.quantity.toLocaleString()} מניות
            {position.grant && (
              <>
                {" · "}vesting מ-{position.grant.vesting.startDate} ·{" "}
                {position.grant.vesting.totalMonths} חודשים
                {position.grant.vesting.cliffMonths > 0 &&
                  `, cliff ${position.grant.vesting.cliffMonths}ח׳`}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg p-1.5 hover:bg-[#FAFAF7]"
            title="ערוך"
          >
            <span className="material-symbols-outlined text-[16px] text-verdant-muted">
              edit
            </span>
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 hover:bg-[rgba(248,113,113,0.08)]"
            title="מחק"
          >
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#DC2626" }}>
              delete
            </span>
          </button>
        </div>
      </div>

      {/* Vesting progress */}
      {position.grant && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-verdant-muted">
            <span>התקדמות הבשלה</span>
            <span className="tabular-nums">
              {(valuation.vestedPct * 100).toFixed(0)}% (
              {valuation.effectiveQuantity.toLocaleString()} מ-
              {position.quantity.toLocaleString()})
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${valuation.vestedPct * 100}%`,
                background: "#059669",
              }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="הבשיל" value={fmtILS(valuation.marketValueIls)} color="#2C7A5A" />
        <StatBox label="מס §102 (25%)" value={fmtILS(valuation.taxIls)} color="#b45309" />
        <StatBox
          label="נטו אם נמכר היום"
          value={fmtILS(valuation.netAfterTaxIls)}
          color="#FFFFFF"
          bold
        />
      </div>

      {/* Goal linker for the grant */}
      <div className="mt-3 border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
        <GoalLinker
          assetType="security"
          assetId={position.id}
          assetValue={valuation.marketValueIls}
          variant="compact"
        />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "#FAFAF7" }}>
      <div className="text-[10px] font-bold text-verdant-muted">{label}</div>
      <div
        className={`mt-0.5 tabular-nums ${bold ? "text-[15px] font-extrabold" : "text-[13px] font-bold"}`}
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   TAB 3 — Deposits (link)
   ═════════════════════════════════════════════════════════════ */

function DepositsTab() {
  const month = currentMonthKey();
  const [summary, setSummary] = useState<ReturnType<typeof summaryForMonth> | null>(null);
  const [activePlans, setActivePlans] = useState(0);

  useEffect(() => {
    const reload = () => {
      setSummary(summaryForMonth(month));
      setActivePlans(loadPlans().filter((p) => p.active).length);
    };
    reload();
    window.addEventListener(DEPOSITS_EVENT, reload);
    return () => window.removeEventListener(DEPOSITS_EVENT, reload);
  }, [month]);

  if (!summary) {
    return (
      <div className="rounded-2xl bg-[#FFFFFF] p-8 text-center text-[12px] text-verdant-muted">
        טוען...
      </div>
    );
  }

  const progress = summary.total > 0 ? (summary.confirmedTotal / summary.total) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <section className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            savings
          </span>
          <div>
            <div className="caption mb-0.5">חודש נוכחי</div>
            <h3 className="text-sm font-extrabold text-verdant-ink">הפקדות חודשיות</h3>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg p-3" style={{ background: "#FAFAF7" }}>
            <div className="text-[10px] font-bold text-verdant-muted">תוכניות פעילות</div>
            <div className="mt-1 text-lg font-extrabold text-verdant-ink">{activePlans}</div>
          </div>
          <div className="rounded-lg p-3" style={{ background: "#FAFAF7" }}>
            <div className="text-[10px] font-bold text-verdant-muted">תכנון לחודש</div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-verdant-ink">
              {fmtILS(summary.total)}
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ background: "#FAFAF7" }}>
            <div className="text-[10px] font-bold text-verdant-muted">בוצע בפועל</div>
            <div
              className="mt-1 text-lg font-extrabold tabular-nums"
              style={{ color: "#2C7A5A" }}
            >
              {fmtILS(summary.confirmedTotal)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-verdant-muted">
            <span>התקדמות החודש</span>
            <span className="tabular-nums">{progress.toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, progress)}%`,
                background: "#059669",
              }}
            />
          </div>
        </div>

        <a
          href="/budget?tab=deposits"
          className="btn-botanical inline-flex items-center gap-1.5 px-4 py-2 text-[12px]"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          פתח עמוד הפקדות מלא
        </a>
      </section>

      <div
        className="rounded-2xl p-5 text-[12px] leading-6 text-verdant-muted"
        style={{ background: "#FAFAF7", border: "1px dashed #E5E7EB" }}
      >
        <strong className="text-verdant-ink">למה זה כאן?</strong> ההפקדות החודשיות שלך — לפנסיה,
        השתלמות, גמל, חיסכון בנקאי או הוספה לתיק ההשקעות — מנוהלות בעמוד נפרד עם תהליך אישור
        חודשי. הסיכום הזה מציג את התמונה הכוללת בתוך עמוד ההשקעות.
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Shared form — Position add/edit (handles tradeable + equity)
   ═════════════════════════════════════════════════════════════ */

function PositionForm({
  accounts,
  initial,
  equityMode,
  tickerResult,
  variant = "inline",
  onSave,
  onCancel,
}: {
  accounts: Account[];
  initial?: Position;
  equityMode: boolean;
  tickerResult: { price: number; name: string } | null;
  variant?: "inline" | "modal";
  onSave: (
    data:
      | Omit<Position, "id" | "createdAt" | "updatedAt">
      | Partial<Position>
  ) => void;
  onCancel: () => void;
}) {
  const defaultKind: AssetKind = equityMode ? "rsu" : "stock";

  const [kind, setKind] = useState<AssetKind>(initial?.kind ?? defaultKind);
  const [accountId, setAccountId] = useState<string>(
    initial?.accountId ?? accounts[0]?.id ?? ""
  );
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? ""));
  const [avgCost, setAvgCost] = useState(String(initial?.avgCost ?? (equityMode ? "0" : "")));
  const [currentPrice, setCurrentPrice] = useState(
    String(initial?.currentPrice ?? tickerResult?.price ?? "")
  );
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "USD");
  const [fxRate, setFxRate] = useState(String(initial?.fxRateToIls ?? FX_DEFAULT.USD));

  // Equity-only fields
  const [company, setCompany] = useState(initial?.grant?.company ?? "");
  const [vestStart, setVestStart] = useState(
    initial?.grant?.vesting.startDate ?? new Date().toISOString().slice(0, 10)
  );
  const [vestMonths, setVestMonths] = useState(
    String(initial?.grant?.vesting.totalMonths ?? 48)
  );
  const [cliffMonths, setCliffMonths] = useState(
    String(initial?.grant?.vesting.cliffMonths ?? 12)
  );
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">(
    initial?.grant?.vesting.frequency ?? "quarterly"
  );
  const [strikePrice, setStrikePrice] = useState(String(initial?.grant?.strikePrice ?? ""));

  // Auto-fill price from ticker search
  useEffect(() => {
    if (tickerResult && !initial) {
      setCurrentPrice(tickerResult.price.toFixed(2));
    }
  }, [tickerResult, initial]);

  // Update FX rate when currency changes (only if not editing an existing row)
  useEffect(() => {
    if (!initial) setFxRate(String(FX_DEFAULT[currency]));
  }, [currency, initial]);

  const isEquity = isEquityComp(kind);
  const kindOptions = equityMode ? EQUITY_KINDS : TRADEABLE_KINDS;

  const submit = () => {
    let finalAccountId = accountId;
    if (creatingAccount && newAccountLabel.trim()) {
      const created = addAccount({
        label: newAccountLabel.trim(),
        currency,
      });
      finalAccountId = created.id;
    }
    if (!finalAccountId) {
      // No accounts exist yet — create a default one matching label conventions.
      const created = addAccount({
        label: equityMode ? company || "Equity" : "תיק עצמאי",
        currency,
      });
      finalAccountId = created.id;
    }

    const base: Omit<Position, "id" | "createdAt" | "updatedAt"> = {
      accountId: finalAccountId,
      kind,
      symbol: symbol.trim().toUpperCase() || (company || "EQUITY"),
      quantity: parseFloat(quantity) || 0,
      avgCost: parseFloat(avgCost) || 0,
      currentPrice: parseFloat(currentPrice) || 0,
      currency,
      fxRateToIls: parseFloat(fxRate) || FX_DEFAULT[currency],
    };

    if (isEquity) {
      const vesting: VestingSchedule = {
        startDate: vestStart,
        totalMonths: parseInt(vestMonths, 10) || 48,
        cliffMonths: parseInt(cliffMonths, 10) || 0,
        frequency,
      };
      base.grant = {
        company: company.trim() || undefined,
        vesting,
        ...(kind === "option" && strikePrice
          ? { strikePrice: parseFloat(strikePrice) }
          : {}),
      };
    }

    onSave(base);
  };

  const wrapperClass =
    variant === "modal"
      ? "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      : "";

  const cardClass =
    variant === "modal"
      ? "w-full max-w-2xl space-y-3 overflow-y-auto rounded-2xl p-6"
      : "space-y-3 rounded-xl p-5";

  const content = (
    <div
      className={cardClass}
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", maxHeight: "90vh" }}
    >
      <div className="mb-2 text-[13px] font-extrabold text-verdant-ink">
        {initial ? "עריכת פוזיציה" : equityMode ? "הקצאה חדשה" : "נייר ערך חדש"}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Kind */}
        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">סוג</div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
            style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#1A1A1A" }}
          >
            {kindOptions.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {/* Account */}
        <div className="col-span-2">
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">חשבון</div>
          {creatingAccount ? (
            <div className="flex gap-1">
              <input
                value={newAccountLabel}
                onChange={(e) => setNewAccountLabel(e.target.value)}
                placeholder="שם חשבון (IBKR, בלינסון…)"
                className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
                style={{ borderColor: "#2C7A5A", background: "#FAFAF7", color: "#1A1A1A" }}
              />
              <button
                type="button"
                onClick={() => {
                  setCreatingAccount(false);
                  setNewAccountLabel("");
                }}
                className="rounded-lg px-2 text-[10px] text-verdant-muted hover:bg-[#FAFAF7]"
              >
                ביטול
              </button>
            </div>
          ) : (
            <select
              value={accountId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreatingAccount(true);
                } else {
                  setAccountId(e.target.value);
                }
              }}
              className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
              style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#1A1A1A" }}
            >
              {accounts.length === 0 && <option value="">— ייווצר אוטומטית —</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
              <option value="__new__">+ חשבון חדש…</option>
            </select>
          )}
        </div>

        <SmallField
          label={isEquity ? "טיקר (אופציונלי)" : "סימול"}
          value={symbol}
          onChange={setSymbol}
          placeholder={isEquity ? "MSFT" : "AAPL"}
        />

        {isEquity && (
          <SmallField
            label="חברה"
            value={company}
            onChange={setCompany}
            placeholder="Microsoft"
          />
        )}

        {/* Currency + FX */}
        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">מטבע</div>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
            style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#1A1A1A" }}
          >
            <option value="ILS">ILS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <SmallField label="שע״ח ל-₪" value={fxRate} onChange={setFxRate} type="number" />

        <SmallField
          label={isEquity ? "סך מניות" : "כמות"}
          value={quantity}
          onChange={setQuantity}
          type="number"
        />
        <SmallField
          label={
            kind === "rsu"
              ? "מחיר Grant (לרוב 0)"
              : kind === "option"
                ? "מחיר Grant"
                : kind === "espp"
                  ? "מחיר רכישה ESPP"
                  : "עלות ממוצעת"
          }
          value={avgCost}
          onChange={setAvgCost}
          type="number"
        />
        <SmallField
          label="מחיר נוכחי"
          value={currentPrice}
          onChange={setCurrentPrice}
          type="number"
          placeholder={tickerResult ? tickerResult.price.toFixed(2) : undefined}
        />
      </div>

      {/* Equity-only block */}
      {isEquity && (
        <div
          className="mt-2 rounded-xl p-4"
          style={{ background: "#0F1727", border: "1px solid #E5E7EB" }}
        >
          <div className="mb-3 text-[11px] font-extrabold text-verdant-ink">לוח הבשלה</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SmallField
              label="תאריך התחלה"
              value={vestStart}
              onChange={setVestStart}
              type="date"
            />
            <SmallField
              label="סך חודשי הבשלה"
              value={vestMonths}
              onChange={setVestMonths}
              type="number"
            />
            <SmallField label="Cliff (חודשים)" value={cliffMonths} onChange={setCliffMonths} type="number" />
            <div>
              <div className="mb-1 text-[9px] font-bold text-verdant-muted">תדירות</div>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as "monthly" | "quarterly")}
                className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
                style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#1A1A1A" }}
              >
                <option value="monthly">חודשי</option>
                <option value="quarterly">רבעוני</option>
              </select>
            </div>
            {kind === "option" && (
              <SmallField
                label="Strike Price"
                value={strikePrice}
                onChange={setStrikePrice}
                type="number"
              />
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
        <button
          onClick={submit}
          disabled={!quantity || (!symbol && !company)}
          className="btn-botanical px-5 py-2 text-[11px] disabled:opacity-40"
        >
          {initial ? "שמור" : "הוסף"}
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost px-4 py-2 text-[11px]">
          ביטול
        </button>
      </div>
    </div>
  );

  return variant === "modal" ? <div className={wrapperClass}>{content}</div> : content;
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
        style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#1A1A1A" }}
        dir="ltr"
      />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Crypto exchanges panel — connect, sync, disconnect
   ═════════════════════════════════════════════════════════════ */

function ExchangesPanel({ accounts }: { accounts: Account[] }) {
  const [creds, setCreds] = useState<CryptoCredentials[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [resultById, setResultById] = useState<Record<string, CryptoSyncResult | null>>({});
  const { confirm, modal } = useConfirm();

  useEffect(() => {
    const reload = () => setCreds(loadCryptoCredentials());
    reload();
    window.addEventListener(CRYPTO_CREDS_EVENT, reload);
    return () => window.removeEventListener(CRYPTO_CREDS_EVENT, reload);
  }, []);

  const runSync = useCallback(async (c: CryptoCredentials) => {
    setSyncingId(c.id);
    try {
      const result = await syncBinance(c.apiKey, c.secret, c.accountId);
      markCryptoSyncOk(c.id);
      setResultById((r) => ({ ...r, [c.id]: result }));
      triggerInvestmentSync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markCryptoSyncFailed(c.id, msg);
    } finally {
      setSyncingId(null);
    }
  }, []);

  const disconnect = useCallback(
    async (c: CryptoCredentials) => {
      const ok = await confirm({
        title: `לנתק את ${c.label}?`,
        body: "הפוזיציות הקיימות יישארו במקום.",
        confirmLabel: "נתק",
        variant: "danger",
      });
      if (!ok) return;
      deleteCryptoCredential(c.id);
    },
    [confirm],
  );

  if (creds.length === 0) {
    return (
      <section
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5"
        style={{ background: "#FAFAF7", border: "1px dashed #E5E7EB" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "#f59e0b15" }}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#D97706" }}>
              account_balance_wallet
            </span>
          </div>
          <div>
            <div className="text-[12px] font-extrabold text-verdant-ink">
              ארנקי קריפטו — סנכרון אוטומטי
            </div>
            <div className="mt-0.5 text-[11px] text-verdant-muted">
              חבר את חשבון ה-Binance שלך וסנכרן יתרות בלחיצה. מפתח קריאה בלבד.
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowConnect(true)}
          className="btn-botanical flex items-center gap-1.5 px-4 py-2 text-[12px]"
        >
          <span className="material-symbols-outlined text-[14px]">link</span>
          חבר Binance
        </button>
        {showConnect && (
          <ConnectExchangeModal
            accounts={accounts}
            onCancel={() => setShowConnect(false)}
            onConnected={() => setShowConnect(false)}
          />
        )}
        {modal}
      </section>
    );
  }

  return (
    <section
      className="mb-6 rounded-2xl p-5"
      style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#D97706" }}>
            account_balance_wallet
          </span>
          <h3 className="text-[13px] font-extrabold text-verdant-ink">ארנקי קריפטו מסונכרנים</h3>
        </div>
        <button
          onClick={() => setShowConnect(true)}
          className="rounded-full border px-3 py-1.5 text-[10px] font-bold"
          style={{ borderColor: "#E5E7EB", color: "#2C7A5A", background: "#FFFFFF" }}
        >
          + הוסף חיבור
        </button>
      </div>

      <div className="space-y-2">
        {creds.map((c) => {
          const acc = accounts.find((a) => a.id === c.accountId);
          const result = resultById[c.id];
          const isSyncing = syncingId === c.id;
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase"
                  style={{ background: "#f59e0b15", color: "#D97706" }}
                >
                  {c.exchange}
                </span>
                <div>
                  <div className="text-[12px] font-extrabold text-verdant-ink">{c.label}</div>
                  <div className="text-[10px] text-verdant-muted">
                    חשבון: {acc?.label || "—"}
                    {c.lastSyncAt && (
                      <>
                        {" · "}סונכרן{" "}
                        {new Date(c.lastSyncAt).toLocaleString("he-IL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </>
                    )}
                  </div>
                  {c.lastErrorMsg && (
                    <div className="mt-0.5 text-[10px] font-bold" style={{ color: "#DC2626" }}>
                      ⚠ {c.lastErrorMsg}
                    </div>
                  )}
                  {result && (
                    <div className="mt-0.5 text-[10px] font-bold" style={{ color: "#2C7A5A" }}>
                      ✓ הוספו {result.added}, עודכנו {result.updated}, הוסרו {result.removed}
                      {result.skipped.length > 0 &&
                        ` · ${result.skipped.length} מטבעות לא מזוהים`}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runSync(c)}
                  disabled={isSyncing}
                  className="btn-botanical flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:opacity-50"
                >
                  <span
                    className={`material-symbols-outlined text-[13px] ${
                      isSyncing ? "animate-spin" : ""
                    }`}
                  >
                    {isSyncing ? "sync" : "refresh"}
                  </span>
                  {isSyncing ? "מסנכרן…" : "סנכרן עכשיו"}
                </button>
                <button
                  onClick={() => disconnect(c)}
                  title="נתק"
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ background: "rgba(248,113,113,0.08)" }}
                >
                  <span
                    className="material-symbols-outlined text-[14px]"
                    style={{ color: "#DC2626" }}
                  >
                    link_off
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showConnect && (
        <ConnectExchangeModal
          accounts={accounts}
          onCancel={() => setShowConnect(false)}
          onConnected={() => setShowConnect(false)}
        />
      )}
      {modal}
    </section>
  );
}

function ConnectExchangeModal({
  accounts,
  onCancel,
  onConnected,
}: {
  accounts: Account[];
  onCancel: () => void;
  onConnected: () => void;
}) {
  const [exchange] = useState<"binance">("binance");
  const [label, setLabel] = useState("Binance Main");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [newAccountLabel, setNewAccountLabel] = useState("Binance");
  const [confirmedReadOnly, setConfirmedReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!confirmedReadOnly) {
      setError("נא לאשר שהמפתח הוא לקריאה בלבד");
      return;
    }
    if (!apiKey.trim() || !secret.trim()) {
      setError("חסרים פרטי מפתח");
      return;
    }
    setBusy(true);
    try {
      // Resolve account: existing pick or create new
      let resolvedAccountId = accountId;
      if (!resolvedAccountId || resolvedAccountId === "__new__") {
        const created = addAccount({
          label: newAccountLabel.trim() || "Binance",
          broker: "Binance",
          currency: "ILS",
        });
        resolvedAccountId = created.id;
      }

      // Save credentials first, then run an immediate sync
      const cred = addCryptoCredential({
        exchange,
        label: label.trim() || "Binance",
        apiKey: apiKey.trim(),
        secret: secret.trim(),
        accountId: resolvedAccountId,
      });

      try {
        await syncBinance(cred.apiKey, cred.secret, cred.accountId);
        markCryptoSyncOk(cred.id);
        triggerInvestmentSync();
        onConnected();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        markCryptoSyncFailed(cred.id, msg);
        // Keep modal open with the error visible
        setError(`חיבור נשמר אך הסנכרון נכשל: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">
              חיבור ארנק חיצוני
            </div>
            <h2 className="text-[15px] font-extrabold text-verdant-ink">חבר Binance לסנכרון</h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 hover:bg-[#FAFAF7]"
            aria-label="סגור"
          >
            <span className="material-symbols-outlined text-[18px] text-verdant-muted">close</span>
          </button>
        </div>

        {/* Read-only warning */}
        <div
          className="rounded-xl p-3 text-[11px] leading-5"
          style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.4)" }}
        >
          <div className="mb-1 flex items-center gap-1.5 font-extrabold" style={{ color: "#D97706" }}>
            <span className="material-symbols-outlined text-[14px]">warning</span>
            הוראות בטיחות חשובות
          </div>
          <ol className="list-decimal space-y-1 pr-5" style={{ color: "rgba(251,191,36,0.95)" }}>
            <li>
              ב-Binance צור API Key חדש עם הרשאת <strong>Enable Reading בלבד</strong>. כבה
              במפורש את <em>Enable Trading</em>, <em>Enable Withdrawals</em>, ו-
              <em>Enable Margin/Futures</em>.
            </li>
            <li>המפתחות נשמרים בדפדפן שלך בלבד. אל תחבר במחשב משותף.</li>
            <li>
              אם תאבד גישה למפתח — נתק כאן ובטל אותו ב-Binance ב-{" "}
              <span dir="ltr">API Management</span>.
            </li>
          </ol>
        </div>

        <label className="flex items-center gap-2 text-[11px] font-bold text-verdant-ink">
          <input
            type="checkbox"
            checked={confirmedReadOnly}
            onChange={(e) => setConfirmedReadOnly(e.target.checked)}
          />
          המפתח שאני מזין נוצר בהרשאת <em className="underline">Read-Only</em> בלבד.
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SmallField label="כינוי החיבור" value={label} onChange={setLabel} />
          <div>
            <div className="mb-1 text-[9px] font-bold text-verdant-muted">חשבון בתיק</div>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
              style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#FFFFFF" }}
            >
              <option value="">— ייווצר חשבון חדש —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          {!accountId && (
            <SmallField label="שם חשבון חדש" value={newAccountLabel} onChange={setNewAccountLabel} />
          )}
          <SmallField label="API Key" value={apiKey} onChange={setApiKey} />
          <SmallField label="Secret" value={secret} onChange={setSecret} type="password" />
        </div>

        {error && (
          <div
            className="rounded-lg p-2.5 text-[11px] font-bold"
            style={{ background: "rgba(248,113,113,0.10)", color: "#DC2626" }}
          >
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
          <button
            onClick={submit}
            disabled={busy}
            className="btn-botanical px-5 py-2 text-[11px] disabled:opacity-40"
          >
            {busy ? "מסנכרן…" : "התחבר וסנכרן"}
          </button>
          <button
            onClick={onCancel}
            className="btn-botanical-ghost px-4 py-2 text-[11px]"
            disabled={busy}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

