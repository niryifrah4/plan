"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmtILS, fmtPct } from "@/lib/format";
import { capitalGainsTax, futureValue } from "@/lib/financial-math";
import { demoSecurities, demoExposure, demoBenchmarks, demoGoals } from "@/lib/stub-data";
import { loadAssumptions } from "@/lib/assumptions";
import { netAfterTaxValue } from "@/lib/intelligence-engine";
import { triggerInvestmentSync } from "@/lib/sync-engine";
import { fetchQuotesBulk, computePerformance, recordSnapshot } from "@/lib/market-sync";
import type { Assumptions } from "@/lib/assumptions";

/* ─── Constants ─── */
const KIND_LABELS: Record<string, string> = {
  stock: "מניה", etf: "קרן סל", crypto: "קריפטו", rsu: "RSU", option: "אופציה", bond: "אג\"ח", fund: "קרן",
};
const KIND_COLORS: Record<string, string> = {
  stock: "#0a7a4a", etf: "#10b981", crypto: "#f59e0b", rsu: "#8b5cf6", option: "#3b82f6", bond: "#06b6d4", fund: "#1a6b42",
};
const EXPOSURE_COLORS = ["#0a7a4a", "#10b981", "#1a6b42", "#58e1b0", "#f59e0b", "#8b5cf6", "#3b82f6"];

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
  try {
    const raw = localStorage.getItem(SECURITIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return demoSecurities.map(s => ({ ...s }));
}

function saveSecurities(secs: SecurityRow[]) {
  try { localStorage.setItem(SECURITIES_KEY, JSON.stringify(secs)); } catch {}
}

function recalcSecurity(s: SecurityRow): SecurityRow {
  const cost_basis_ils = s.quantity * s.avg_cost * s.fx_rate_to_ils;
  const market_value_ils = s.quantity * s.current_price * s.fx_rate_to_ils;
  const unrealized_pnl_ils = market_value_ils - cost_basis_ils;
  const unrealized_pnl_pct = cost_basis_ils > 0 ? (unrealized_pnl_ils / cost_basis_ils) * 100 : (market_value_ils > 0 ? 100 : 0);
  return { ...s, cost_basis_ils, market_value_ils, unrealized_pnl_ils, unrealized_pnl_pct };
}

/* ─── Goal Linking with % allocation (localStorage) ─── */
const GOAL_LINK_KEY = "verdant:asset_goal_links";
interface GoalLink { goalId: string; pct: number }
function loadGoalLinks(): Record<string, GoalLink> {
  try {
    const r = localStorage.getItem(GOAL_LINK_KEY);
    if (!r) return {};
    const parsed = JSON.parse(r);
    const result: Record<string, GoalLink> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") result[k] = { goalId: v, pct: 100 };
      else result[k] = v as GoalLink;
    }
    return result;
  } catch { return {}; }
}
function saveGoalLinks(links: Record<string, GoalLink>) {
  try { localStorage.setItem(GOAL_LINK_KEY, JSON.stringify(links)); } catch {}
}

export default function InvestmentsPage() {
  const [sortField, setSortField] = useState<SortField>("market_value_ils");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [selectedBenchmark, setSelectedBenchmark] = useState<string | null>(null);
  const [goalLinks, setGoalLinks] = useState<Record<string, GoalLink>>({});
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [allSecurities, setAllSecurities] = useState<SecurityRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerResult, setTickerResult] = useState<{ price: number; name: string } | null>(null);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  useEffect(() => {
    setGoalLinks(loadGoalLinks());
    setAssumptions(loadAssumptions());
    setAllSecurities(loadSecurities());
  }, []);

  // Persist securities + trigger sync cascade
  useEffect(() => {
    if (allSecurities.length > 0) {
      const t = setTimeout(() => {
        saveSecurities(allSecurities);
        triggerInvestmentSync();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [allSecurities]);

  const securities = useMemo(() => {
    let list = [...allSecurities];
    if (filterKind !== "all") list = list.filter(s => s.kind === filterKind);
    list.sort((a, b) => {
      const av = a[sortField] as number | string;
      const bv = b[sortField] as number | string;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [sortField, sortDir, filterKind, allSecurities]);

  const totalMarket = allSecurities.reduce((a, s) => a + s.market_value_ils, 0);
  const totalPnl    = allSecurities.reduce((a, s) => a + s.unrealized_pnl_ils, 0);
  const totalCost   = allSecurities.reduce((a, s) => a + s.cost_basis_ils, 0);
  const totalTax    = allSecurities.reduce((a, s) => a + capitalGainsTax(s.cost_basis_ils, s.market_value_ils).tax, 0);
  const totalNetAfterTax = allSecurities.reduce((a, s) => {
    const kind = s.kind === "rsu" ? "rsu" : s.kind === "option" ? "option" : "securities";
    return a + netAfterTaxValue(s.market_value_ils, s.cost_basis_ils, kind).netValue;
  }, 0);
  const overallPct  = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;

  const kindAlloc = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of allSecurities) map[s.kind] = (map[s.kind] || 0) + s.market_value_ils;
    return Object.entries(map).map(([kind, val]) => ({ kind, val, pct: totalMarket > 0 ? Math.round((val / totalMarket) * 100) : 0 })).sort((a, b) => b.val - a.val);
  }, [allSecurities, totalMarket]);

  const totalExposure = demoExposure.reduce((s, e) => s + e.total, 0);
  const sp500Pct = totalExposure > 0 ? (demoExposure.find(e => e.index === "S&P 500")?.total || 0) / totalExposure * 100 : 0;

  const vestingItems = allSecurities.filter(s => s.vest_date);
  const activeBenchmark = demoBenchmarks.find(b => b.id === selectedBenchmark);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };
  const sortIcon = (field: SortField) => sortField === field ? (sortDir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";

  const handleGoalLink = (secId: string, goalId: string) => {
    const updated = { ...goalLinks };
    if (!goalId) { delete updated[secId]; }
    else { updated[secId] = { goalId, pct: updated[secId]?.pct ?? 100 }; }
    setGoalLinks(updated);
    saveGoalLinks(updated);
  };
  const handleGoalPct = (secId: string, pct: number) => {
    const link = goalLinks[secId];
    if (!link) return;
    const updated = { ...goalLinks, [secId]: { ...link, pct: Math.min(100, Math.max(0, pct)) } };
    setGoalLinks(updated);
    saveGoalLinks(updated);
  };

  /* ─── CRUD operations ─── */
  const deleteSecurity = useCallback((id: string) => {
    setAllSecurities(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateSecurity = useCallback((id: string, updates: Partial<SecurityRow>) => {
    setAllSecurities(prev => prev.map(s => {
      if (s.id !== id) return s;
      const merged = { ...s, ...updates };
      return recalcSecurity(merged);
    }));
    setEditingId(null);
  }, []);

  const addSecurity = useCallback((sec: Omit<SecurityRow, "id" | "cost_basis_ils" | "market_value_ils" | "unrealized_pnl_ils" | "unrealized_pnl_pct">) => {
    const newSec = recalcSecurity({
      ...sec,
      id: `s-${Date.now()}`,
      cost_basis_ils: 0,
      market_value_ils: 0,
      unrealized_pnl_ils: 0,
      unrealized_pnl_pct: 0,
    });
    setAllSecurities(prev => [...prev, newSec]);
    setShowAddForm(false);
  }, []);

  /* ─── Refresh ALL prices from Yahoo ─── */
  const refreshAllPrices = useCallback(async () => {
    if (allSecurities.length === 0) return;
    setRefreshing(true);
    try {
      const symbols = allSecurities.map(s => s.symbol).filter(Boolean);
      const quotes = await fetchQuotesBulk(symbols);
      setAllSecurities(prev =>
        prev.map(s => {
          const q = quotes[s.symbol.toUpperCase()];
          if (!q) return s;
          return recalcSecurity({ ...s, current_price: q.price });
        })
      );
      setLastRefresh(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
      // Record snapshot of total portfolio for history
      const total = allSecurities.reduce((sum, s) => {
        const q = quotes[s.symbol.toUpperCase()];
        const price = q ? q.price : s.current_price;
        return sum + s.quantity * price * s.fx_rate_to_ils;
      }, 0);
      recordSnapshot(total);
    } finally {
      setRefreshing(false);
    }
  }, [allSecurities]);

  /* ─── Ticker lookup (Yahoo Finance via public API) ─── */
  const lookupTicker = useCallback(async (symbol: string) => {
    if (!symbol.trim()) return;
    setTickerLoading(true);
    setTickerResult(null);
    try {
      // Use a public proxy-free endpoint for demo
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.trim().toUpperCase())}?interval=1d&range=1d`);
      if (res.ok) {
        const data = await res.json();
        const meta = data.chart?.result?.[0]?.meta;
        if (meta) {
          setTickerResult({ price: meta.regularMarketPrice || 0, name: meta.shortName || meta.symbol || symbol });
        }
      }
    } catch {
      // Fallback — couldn't reach API
      setTickerResult(null);
    }
    setTickerLoading(false);
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Investments & Equity · שוק הון"
        title="השקעות ושוק הון"
        description="ניירות ערך, קריפטו, RSU ואופציות · ראייה הוליסטית של כל החשיפות"
      />

      {/* ===== Market Sync Bar ===== */}
      {(() => {
        const perf = assumptions
          ? computePerformance(totalMarket, totalCost, 12, assumptions.expectedReturnInvest || 0.065)
          : null;
        const perfBg = perf?.severity === "good" ? "#f0fdf4" : perf?.severity === "bad" ? "#fef2f2" : "#f9faf2";
        const perfColor = perf?.severity === "good" ? "#0a7a4a" : perf?.severity === "bad" ? "#b91c1c" : "#012d1d";
        return (
          <section className="mb-5 rounded-2xl p-5 flex items-center gap-4"
            style={{ background: perfBg, border: `1.5px solid ${perfColor}25` }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${perfColor}15` }}>
              <span className="material-symbols-outlined text-[22px]" style={{ color: perfColor }}>query_stats</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.15em] font-bold mb-0.5" style={{ color: perfColor }}>
                Market Sync · סנכרון שווי שוק בזמן אמת
              </div>
              <div className="text-[12px] font-extrabold text-verdant-ink truncate">
                {perf ? perf.summary : "לחץ לסנכרון מחירים מהבורסה"}
              </div>
              {lastRefresh && (
                <div className="text-[10px] font-bold text-verdant-muted mt-0.5">
                  עודכן לאחרונה: {lastRefresh}
                </div>
              )}
            </div>
            <button
              onClick={refreshAllPrices}
              disabled={refreshing || allSecurities.length === 0}
              className="text-white font-extrabold text-[12px] py-2.5 px-5 rounded-xl transition-all hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
              style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}
            >
              <span className={`material-symbols-outlined text-[16px] ${refreshing ? "animate-spin" : ""}`}>
                {refreshing ? "sync" : "refresh"}
              </span>
              {refreshing ? "מסנכרן..." : "רענן מחירים"}
            </button>
          </section>
        );
      })()}

      {/* ===== KPI Row ===== */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          { label: "שווי שוק", value: fmtILS(totalMarket), color: "#012d1d", icon: "account_balance" },
          { label: "שווי נטו (אחרי מס)", value: fmtILS(totalNetAfterTax), color: "#0a7a4a", icon: "verified", sub: `מס צפוי: ${fmtILS(totalTax)}` },
          { label: "רווח/הפסד", value: `${totalPnl >= 0 ? "+" : ""}${fmtILS(totalPnl)}`, color: totalPnl >= 0 ? "#0a7a4a" : "#b91c1c", icon: "trending_up", sub: `תשואה: ${overallPct >= 0 ? "+" : ""}${overallPct.toFixed(1)}%` },
        ].map(kpi => (
          <div key={kpi.label} className="v-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[14px] text-verdant-muted">{kpi.icon}</span>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">{kpi.label}</div>
            </div>
            <div className="text-xl md:text-2xl font-extrabold tabular" style={{ color: kpi.color }}>{kpi.value}</div>
            {kpi.sub && <div className="text-[10px] text-verdant-muted font-bold mt-1">{kpi.sub}</div>}
          </div>
        ))}
      </section>

      {/* ===== Holistic Exposure Pie ===== */}
      <section className="v-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">donut_large</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">ראייה הוליסטית</div>
            <h3 className="text-sm font-extrabold text-verdant-ink">חשיפה למדדי בסיס — כל המכשירים</h3>
          </div>
        </div>

        {sp500Pct > 60 && (
          <div className="rounded-xl p-3 mb-4 flex items-center gap-3" style={{ background: "#fef3c7", border: "1px solid #f59e0b" }}>
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#f59e0b" }}>warning</span>
            <p className="text-xs font-bold" style={{ color: "#92400e" }}>
              {sp500Pct.toFixed(0)}% מההון שלך חשוף ל-S&P 500 — ריכוז גבוה. שקול פיזור.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex items-center justify-center">
            <svg viewBox="0 0 200 200" className="w-48 h-48">
              {(() => {
                let cumAngle = 0;
                return demoExposure.map((e, i) => {
                  const pct = totalExposure > 0 ? e.total / totalExposure : 0;
                  const angle = pct * 360;
                  const startAngle = cumAngle;
                  cumAngle += angle;
                  const r = 80, cx = 100, cy = 100;
                  const startRad = (startAngle - 90) * Math.PI / 180;
                  const endRad = (startAngle + angle - 90) * Math.PI / 180;
                  const largeArc = angle > 180 ? 1 : 0;
                  const x1 = cx + r * Math.cos(startRad);
                  const y1 = cy + r * Math.sin(startRad);
                  const x2 = cx + r * Math.cos(endRad);
                  const y2 = cy + r * Math.sin(endRad);
                  if (pct < 0.01) return null;
                  return (
                    <path key={e.index} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={EXPOSURE_COLORS[i % EXPOSURE_COLORS.length]} stroke="#fff" strokeWidth="2" />
                  );
                });
              })()}
              <circle cx="100" cy="100" r="45" fill="#f9faf2" />
              <text x="100" y="96" textAnchor="middle" className="text-[11px] font-bold" fill="#012d1d">חשיפה</text>
              <text x="100" y="112" textAnchor="middle" className="text-[10px]" fill="#6b7280">הוליסטית</text>
            </svg>
          </div>
          <div className="space-y-2">
            {demoExposure.map((e, i) => {
              const pct = totalExposure > 0 ? (e.total / totalExposure * 100).toFixed(1) : "0";
              return (
                <div key={e.index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#f4f7ed] transition-colors">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: EXPOSURE_COLORS[i % EXPOSURE_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-verdant-ink">{e.index}</div>
                    <div className="flex gap-3 text-[10px] text-verdant-muted mt-0.5">
                      <span>פנסיה: {fmtILS(e.pension)}</span>
                      <span>השתלמות: {fmtILS(e.hishtalmut)}</span>
                      <span>עצמאי: {fmtILS(e.selfManaged)}</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-extrabold tabular">{pct}%</div>
                    <div className="text-[10px] text-verdant-muted tabular">{fmtILS(e.total)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Benchmark Models ===== */}
      <section className="v-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">compare</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">השוואת מודלים</div>
            <h3 className="text-sm font-extrabold text-verdant-ink">מודלים מובנים להשוואה (Benchmarking)</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {demoBenchmarks.map(b => (
            <button key={b.id} onClick={() => setSelectedBenchmark(selectedBenchmark === b.id ? null : b.id)}
              className="p-4 rounded-xl text-right transition-all border-2"
              style={{
                borderColor: selectedBenchmark === b.id ? "#0a7a4a" : "#e5e7d8",
                background: selectedBenchmark === b.id ? "#f0fdf4" : "#fff",
              }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-verdant-ink">{b.name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                  background: b.risk === "low" ? "#dcfce7" : b.risk === "medium" ? "#fef3c7" : "#fecaca",
                  color: b.risk === "low" ? "#166534" : b.risk === "medium" ? "#92400e" : "#991b1b",
                }}>
                  {b.risk === "low" ? "נמוך" : b.risk === "medium" ? "בינוני" : "גבוה"}
                </span>
              </div>
              <p className="text-[11px] text-verdant-muted mb-2">{b.description}</p>
              <div className="text-xs font-bold" style={{ color: "#0a7a4a" }}>תשואה צפויה: {(b.expectedReturn * 100).toFixed(1)}%</div>
            </button>
          ))}
        </div>

        {activeBenchmark && assumptions && (
          <div className="rounded-xl p-4" style={{ background: "#f4f7ed" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold text-verdant-ink">{activeBenchmark.name} — סימולציה ל-10 שנים</span>
            </div>
            <div className="flex items-end gap-1 h-12 mb-3">
              {activeBenchmark.allocation.map(a => (
                <div key={a.label} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className="text-[9px] font-bold" style={{ color: a.color }}>{a.pct}%</div>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(a.pct * 0.4, 3)}px`, background: a.color }} />
                  <div className="text-[8px] font-bold text-verdant-muted truncate w-full text-center">{a.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[10px] text-verdant-muted font-bold">תיק נוכחי (10 שנים)</div>
                <div className="text-sm font-extrabold text-verdant-ink tabular">
                  {fmtILS(futureValue(totalMarket, assumptions.monthlyInvestment, assumptions.expectedReturnInvest, 10))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-verdant-muted font-bold">{activeBenchmark.name} (10 שנים)</div>
                <div className="text-sm font-extrabold tabular" style={{ color: "#0a7a4a" }}>
                  {fmtILS(futureValue(totalMarket, assumptions.monthlyInvestment, activeBenchmark.expectedReturn, 10))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-verdant-muted font-bold">הפרש</div>
                <div className="text-sm font-extrabold tabular" style={{ color: "#0a7a4a" }}>
                  {fmtILS(
                    futureValue(totalMarket, assumptions.monthlyInvestment, activeBenchmark.expectedReturn, 10) -
                    futureValue(totalMarket, assumptions.monthlyInvestment, assumptions.expectedReturnInvest, 10)
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===== Allocation by Kind ===== */}
      <section className="v-card p-5 mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-3">אלוקציה לפי סוג נכס</div>
        <div className="flex items-end gap-2 h-16">
          {kindAlloc.map(({ kind, pct }) => (
            <div key={kind} className="flex flex-col items-center gap-1 flex-1">
              <div className="text-[10px] font-bold" style={{ color: KIND_COLORS[kind] || "#0a7a4a" }}>{pct}%</div>
              <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(pct * 0.5, 4)}px`, background: KIND_COLORS[kind] || "#0a7a4a" }} />
              <div className="text-[9px] font-bold text-verdant-muted">{KIND_LABELS[kind] || kind}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Vesting Timeline ===== */}
      {vestingItems.length > 0 && (
        <section className="v-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">event</span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">לוח Vesting</div>
              <h3 className="text-sm font-extrabold text-verdant-ink">RSU ואופציות — תאריכי הבשלה</h3>
            </div>
          </div>
          <div className="space-y-3">
            {vestingItems.map(s => {
              const vestDate = new Date(s.vest_date!);
              const daysLeft = Math.max(0, Math.ceil((vestDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              const isPast = daysLeft === 0;
              return (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#f9faf2" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: (KIND_COLORS[s.kind] || "#0a7a4a") + "15", color: KIND_COLORS[s.kind] || "#0a7a4a" }}>
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
                    <div className="text-sm font-extrabold tabular" style={{ color: isPast ? "#0a7a4a" : "#012d1d" }}>
                      {vestDate.toLocaleDateString("he-IL")}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: isPast ? "#0a7a4a" : "#f59e0b" }}>
                      {isPast ? "הבשיל" : `${daysLeft} ימים`}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-extrabold text-verdant-ink tabular">{fmtILS(s.market_value_ils)}</div>
                    <div className="text-[11px] font-bold tabular" style={{ color: s.unrealized_pnl_ils >= 0 ? "#0a7a4a" : "#b91c1c" }}>
                      {s.unrealized_pnl_ils >= 0 ? "+" : ""}{fmtILS(s.unrealized_pnl_ils)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Securities Table with Edit/Delete + Goal Linking ===== */}
      <section className="v-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b v-divider flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-verdant-ink">תיק ניירות ערך</h2>
            <p className="text-[11px] text-verdant-muted mt-0.5">{allSecurities.length} פוזיציות · ניתן לערוך, למחוק ולשייך ליעד</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-verdant-muted">סינון:</span>
              <select value={filterKind} onChange={e => setFilterKind(e.target.value)}
                className="text-[11px] font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer"
                style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
                <option value="all">הכל</option>
                {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button onClick={() => setShowAddForm(!showAddForm)}
              className="text-[11px] font-bold px-4 py-2 rounded-xl text-white flex items-center gap-1.5"
              style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
              <span className="material-symbols-outlined text-[14px]">add</span>הוסף נייר
            </button>
          </div>
        </div>

        {/* Ticker Search Bar */}
        <div className="px-5 py-3 border-b v-divider" style={{ background: "#f9faf2" }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px] text-verdant-emerald">search</span>
            <input type="text" placeholder="חפש סימול מניה (למשל AAPL, MSFT)..."
              value={tickerSearch} onChange={e => setTickerSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") lookupTicker(tickerSearch); }}
              className="flex-1 text-[12px] font-bold bg-transparent outline-none text-verdant-ink" dir="ltr" />
            <button onClick={() => lookupTicker(tickerSearch)}
              disabled={tickerLoading || !tickerSearch.trim()}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1"
              style={{ background: "#0a7a4a12", color: "#0a7a4a" }}>
              {tickerLoading ? (
                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[14px]">travel_explore</span>
              )}
              חפש מחיר
            </button>
            {tickerResult && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <span className="text-[11px] font-extrabold text-verdant-ink">{tickerResult.name}</span>
                <span className="text-[11px] font-extrabold tabular" style={{ color: "#0a7a4a" }}>${tickerResult.price.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Add Security Form */}
        {showAddForm && (
          <div className="px-5 py-4 border-b v-divider" style={{ background: "#f9faf2" }}>
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
              <tr className="text-[10px] uppercase tracking-[0.12em] text-verdant-muted font-bold" style={{ background: "#f4f7ed" }}>
                <th className="text-right px-3 py-2">סוג</th>
                <th className="text-right px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("symbol")}>
                  <span className="flex items-center gap-1">סימול <span className="material-symbols-outlined text-[12px]">{sortIcon("symbol")}</span></span>
                </th>
                <th className="text-right px-3 py-2">ברוקר</th>
                <th className="text-left px-3 py-2 tabular cursor-pointer select-none" onClick={() => toggleSort("market_value_ils")}>
                  <span className="flex items-center gap-1 justify-end">שווי (₪) <span className="material-symbols-outlined text-[12px]">{sortIcon("market_value_ils")}</span></span>
                </th>
                <th className="text-left px-3 py-2 tabular cursor-pointer select-none" onClick={() => toggleSort("unrealized_pnl_ils")}>
                  <span className="flex items-center gap-1 justify-end">רווח/הפסד <span className="material-symbols-outlined text-[12px]">{sortIcon("unrealized_pnl_ils")}</span></span>
                </th>
                <th className="text-left px-3 py-2 tabular cursor-pointer select-none" onClick={() => toggleSort("unrealized_pnl_pct")}>
                  <span className="flex items-center gap-1 justify-end">% <span className="material-symbols-outlined text-[12px]">{sortIcon("unrealized_pnl_pct")}</span></span>
                </th>
                <th className="text-left px-3 py-2 tabular">נטו (אחרי מס)</th>
                <th className="text-right px-3 py-2">שיוך ליעד</th>
                <th className="text-center px-3 py-2">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {securities.map(s => {
                const color = s.unrealized_pnl_ils >= 0 ? "#0a7a4a" : "#b91c1c";
                const isEditing = editingId === s.id;
                return isEditing ? (
                  <tr key={s.id} className="border-b v-divider">
                    <td colSpan={9} className="px-3 py-4">
                      <InlineEditRow security={s} onSave={updates => updateSecurity(s.id, updates)} onCancel={() => setEditingId(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="border-b v-divider hover:bg-[#f9faf2] transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: (KIND_COLORS[s.kind] || "#0a7a4a") + "15", color: KIND_COLORS[s.kind] || "#0a7a4a" }}>
                        {KIND_LABELS[s.kind] ?? s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-extrabold text-verdant-ink">{s.symbol}</div>
                      <div className="text-[10px] text-verdant-muted">{s.quantity} יח׳ · ${s.current_price}</div>
                    </td>
                    <td className="px-3 py-2.5 text-verdant-muted font-bold">{s.broker}</td>
                    <td className="px-3 py-2.5 tabular font-bold text-left" dir="ltr">{fmtILS(s.market_value_ils)}</td>
                    <td className="px-3 py-2.5 tabular font-bold text-left" dir="ltr" style={{ color }}>{fmtILS(s.unrealized_pnl_ils, { signed: true })}</td>
                    <td className="px-3 py-2.5 tabular font-bold text-left" dir="ltr" style={{ color }}>{s.unrealized_pnl_pct >= 0 ? "+" : ""}{s.unrealized_pnl_pct.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 tabular font-bold text-left" dir="ltr">
                      {(() => {
                        const kind = s.kind === "rsu" ? "rsu" : s.kind === "option" ? "option" : "securities";
                        const { netValue, taxProvision } = netAfterTaxValue(s.market_value_ils, s.cost_basis_ils, kind);
                        return (
                          <div>
                            <div className="text-verdant-ink">{fmtILS(netValue)}</div>
                            {taxProvision > 0 && <div className="text-[9px] text-verdant-muted">מס: {fmtILS(taxProvision)}</div>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <select value={goalLinks[s.id]?.goalId || ""} onChange={e => handleGoalLink(s.id, e.target.value)}
                          className="text-[10px] font-bold rounded px-1.5 py-1 border outline-none max-w-[100px]"
                          style={{ borderColor: "#d8e0d0", background: goalLinks[s.id] ? "#f0fdf4" : "#fff" }}>
                          <option value="">ללא שיוך</option>
                          {demoGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        {goalLinks[s.id] && (
                          <div className="flex items-center gap-0.5">
                            <input type="number" min={1} max={100} value={goalLinks[s.id].pct}
                              onChange={e => handleGoalPct(s.id, Number(e.target.value))}
                              className="w-10 text-[10px] font-bold text-center rounded border px-1 py-1 outline-none tabular"
                              style={{ borderColor: "#d8e0d0", background: "#f0fdf4" }} />
                            <span className="text-[9px] text-verdant-muted font-bold">%</span>
                          </div>
                        )}
                      </div>
                      {goalLinks[s.id] && goalLinks[s.id].pct < 100 && (
                        <div className="text-[9px] text-verdant-muted mt-0.5">
                          {fmtILS(s.market_value_ils * goalLinks[s.id].pct / 100)} צבוע ליעד
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => setEditingId(s.id)} title="ערוך"
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-verdant-bg transition-colors"
                          style={{ background: "#f4f7ed" }}>
                          <span className="material-symbols-outlined text-[14px] text-verdant-muted">edit</span>
                        </button>
                        <button onClick={() => deleteSecurity(s.id)} title="מחק"
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors"
                          style={{ background: "#fef2f2" }}>
                          <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>delete_outline</span>
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
      <div className="rounded-2xl p-5 md:p-6" style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)", color: "#fff" }}>
        <div className="flex items-start gap-3 md:gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(88,225,176,0.2)" }}>
            <span className="material-symbols-outlined" style={{ color: "#58e1b0" }}>receipt_long</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2" style={{ color: "#58e1b0" }}>תובנת מס</div>
            <h3 className="text-base md:text-lg font-extrabold mb-2">
              מס רווח הון צפוי: {fmtILS(totalTax)}
            </h3>
            <p className="text-xs md:text-sm opacity-90 leading-relaxed">
              {totalTax > 10000
                ? "שקלו פריסת מימושים על פני שנות מס שונות כדי לצמצם חבות. ייתכן שכדאי לקזז הפסדים מנכסים אחרים."
                : "חבות המס הצפויה נמוכה יחסית. מומלץ לבדוק פריסה רק אם מתכננים מימוש גדול."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════ */

function InlineEditRow({ security, onSave, onCancel }: {
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
    <div className="rounded-xl p-5 space-y-3" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
      <div className="text-[11px] font-extrabold text-verdant-ink mb-2">עריכת פוזיציה — {security.symbol}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">סוג</div>
          <select value={kind} onChange={e => setKind(e.target.value)}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <SmallField label="סימול" value={symbol} onChange={setSymbol} />
        <SmallField label="ברוקר" value={broker} onChange={setBroker} />
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">מטבע</div>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            <option value="USD">USD</option>
            <option value="ILS">ILS</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <SmallField label="כמות" value={quantity} onChange={setQuantity} type="number" />
        <SmallField label="עלות ממוצעת" value={avgCost} onChange={setAvgCost} type="number" />
        <SmallField label="מחיר נוכחי" value={currentPrice} onChange={setCurrentPrice} type="number" />
        <SmallField label="שע״ח ל-₪" value={fxRate} onChange={setFxRate} type="number" />
        {(kind === "rsu" || kind === "option") && (
          <>
            <SmallField label="תאריך Vesting" value={vestDate} onChange={setVestDate} type="date" />
            {kind === "option" && <SmallField label="Strike Price" value={strikePrice} onChange={setStrikePrice} type="number" />}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "#d8e0d0" }}>
        <button onClick={() => onSave({
          kind, symbol: symbol.toUpperCase(), broker, currency,
          quantity: parseFloat(quantity) || 0,
          avg_cost: parseFloat(avgCost) || 0,
          current_price: parseFloat(currentPrice) || 0,
          fx_rate_to_ils: parseFloat(fxRate) || 3.72,
          vest_date: vestDate || null,
          strike_price: strikePrice ? parseFloat(strikePrice) : null,
        })} className="text-[11px] font-bold px-5 py-2 rounded-xl text-white"
          style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
          שמור
        </button>
        <button onClick={onCancel}
          className="text-[11px] font-bold px-4 py-2 rounded-xl text-verdant-muted" style={{ background: "#eef2e8" }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function AddSecurityForm({ onSave, onCancel, tickerResult }: {
  onSave: (sec: Omit<SecurityRow, "id" | "cost_basis_ils" | "market_value_ils" | "unrealized_pnl_ils" | "unrealized_pnl_pct">) => void;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">סוג</div>
          <select value={kind} onChange={e => setKind(e.target.value)}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <SmallField label="סימול" value={symbol} onChange={setSymbol} placeholder="AAPL" />
        <SmallField label="ברוקר" value={broker} onChange={setBroker} placeholder="IBKR" />
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">מטבע</div>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            <option value="USD">USD</option>
            <option value="ILS">ILS</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <SmallField label="כמות" value={quantity} onChange={setQuantity} type="number" placeholder="100" />
        <SmallField label="עלות ממוצעת" value={avgCost} onChange={setAvgCost} type="number" placeholder="150" />
        <SmallField label="מחיר נוכחי" value={currentPrice} onChange={setCurrentPrice} type="number" placeholder={tickerResult ? tickerResult.price.toFixed(2) : "225"} />
        <SmallField label="שע״ח ל-₪" value={fxRate} onChange={setFxRate} type="number" />
        {(kind === "rsu" || kind === "option") && (
          <>
            <SmallField label="תאריך Vesting" value={vestDate} onChange={setVestDate} type="date" />
            {kind === "option" && <SmallField label="Strike Price" value={strikePrice} onChange={setStrikePrice} type="number" />}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "#d8e0d0" }}>
        <button disabled={!symbol || !quantity}
          onClick={() => onSave({
            kind, symbol: symbol.toUpperCase(), broker, currency,
            quantity: parseFloat(quantity) || 0,
            avg_cost: parseFloat(avgCost) || 0,
            current_price: parseFloat(currentPrice) || 0,
            fx_rate_to_ils: parseFloat(fxRate) || 3.72,
            vest_date: vestDate || null,
            strike_price: strikePrice ? parseFloat(strikePrice) : null,
          })}
          className="text-[11px] font-bold px-5 py-2 rounded-xl text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
          הוסף נייר ערך
        </button>
        <button onClick={onCancel}
          className="text-[11px] font-bold px-4 py-2 rounded-xl text-verdant-muted" style={{ background: "#eef2e8" }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function SmallField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold text-verdant-muted mb-1">{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-[11px] font-bold px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-verdant-accent/30"
        style={{ borderColor: "#d8e0d0", background: "#fff" }} dir="ltr" />
    </div>
  );
}
