"use client";

/**
 * SavedBrokerPortfolios — view analyzed broker reports persisted in
 * `investment_reports`. A household can hold several portfolios across several
 * brokers; this panel lets the user pick one portfolio or aggregate "all
 * together". Each portfolio shows the statement "as of" date (Israeli format).
 *
 * Refreshes when BrokerReportUpload dispatches REPORT_SAVED_EVENT after a save.
 */

import { useCallback, useEffect, useState, ReactNode } from "react";

import { fmtMoney, fmtPct, fmtDateIL } from "@/lib/_shared/format";
import { getHouseholdId } from "@/lib/sync/remote-sync";
import { fetchFXRates } from "@/lib/market-sync";
import {
  addPosition,
  deletePosition,
  loadAccounts,
  loadPositions,
  type AssetKind,
  type Currency,
} from "@/lib/portfolio-store";
import { triggerInvestmentSync } from "@/lib/sync-engine";

export const REPORT_SAVED_EVENT = "verdant:investment-report:saved";

type DisplayAssetKind = AssetKind | "cash";

interface Holding {
  securityNumber: string;
  name: string;
  symbol: string;
  assetKind: DisplayAssetKind;
  quantity: number;
  priceCurrent: number;
  valueIls: number;
  costIls: number;
  pctOfPortfolio: number;
}
interface SavedReport {
  id: string;
  broker: string;
  account_number: string;
  report_date: string | null;
  total_value_ils: number;
  currency?: string;
  holdings: Holding[];
}

const KIND_LABELS: Record<DisplayAssetKind, string> = {
  stock: "מניה",
  etf: "קרן סל",
  crypto: "קריפטו",
  bond: 'אג"ח',
  fund: "קרן",
  cash: "מזומן",
  rsu: "מניות חסומות",
  espp: "מניות בהנחה",
  option: "אופציות",
};

function portfolioLabel(r: SavedReport): string {
  return `${r.broker || "בית השקעות"}${r.account_number ? ` · ${r.account_number}` : ""}`;
}

export function SavedBrokerPortfolios() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("all"); // "all" | report id
  const [showManage, setShowManage] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const hh = getHouseholdId();
    if (!hh) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/investments/reports?householdId=${encodeURIComponent(hh)}`);
      const data = await res.json();
      if (res.ok && data.ok) setReports(data.reports as SavedReport[]);
    } catch {
      /* offline / no DB — panel just stays empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchFXRates().then(setFxRates).catch(() => {});
    const onSaved = () => load();
    window.addEventListener(REPORT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(REPORT_SAVED_EVENT, onSaved);
  }, [load]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showManage) {
        setShowManage(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showManage]);

  if (loading || reports.length === 0) return null;

  // Group by (broker, account) to find the latest report for each portfolio.
  // The query returns them ordered by report_date descending, so the first one we see per group is the latest.
  const latestMap = new Map<string, SavedReport>();
  for (const r of reports) {
    const key = `${r.broker}|${r.account_number}`;
    if (!latestMap.has(key)) latestMap.set(key, r);
  }
  const latestReports = Array.from(latestMap.values());

  const active = selected === "all" ? latestReports : latestReports.filter((r) => r.id === selected);
  const holdings: (Holding & { _broker: string; _currency?: string })[] = active.flatMap((r) =>
    (r.holdings || []).map((h) => ({ ...h, _broker: r.broker || "בית השקעות", _currency: r.currency }))
  );

  // Aggregate analysis across the selected portfolio(s).
  // We determine the display currency: if exactly one report is selected, use its currency.
  // Otherwise, default to ILS or "₪" if mixed.
  const displayCurrency = active.length === 1 && active[0].currency === "USD" ? "USD" : "ILS";

  const totalValue = holdings.reduce((s, h) => {
    const fx = displayCurrency === "ILS" ? (fxRates[h._currency || "ILS"] || 1) : 1;
    return s + ((h.valueIls || 0) * fx);
  }, 0);
  
  const withCost = holdings.filter((h) => h.costIls > 0);
  const totalCost = withCost.reduce((s, h) => {
    const fx = displayCurrency === "ILS" ? (fxRates[h._currency || "ILS"] || 1) : 1;
    return s + (h.costIls * fx);
  }, 0);
  
  const curValueOfCosted = withCost.reduce((s, h) => {
    const fx = displayCurrency === "ILS" ? (fxRates[h._currency || "ILS"] || 1) : 1;
    return s + (h.valueIls * fx);
  }, 0);
  
  const gain = curValueOfCosted - totalCost;
  const totalReturnPct = totalCost > 0 ? (gain / totalCost) * 100 : null;

  // Allocation by asset kind.
  const byKind = new Map<DisplayAssetKind, number>();
  for (const h of holdings) {
    const fx = displayCurrency === "ILS" ? (fxRates[h._currency || "ILS"] || 1) : 1;
    byKind.set(h.assetKind, (byKind.get(h.assetKind) ?? 0) + ((h.valueIls || 0) * fx));
  }

  const holdingReturn = (h: Holding) =>
    h.costIls > 0 ? ((h.valueIls - h.costIls) / h.costIls) * 100 : null;

  const showBrokerCol = selected === "all" && latestReports.length > 1;

  async function handleDelete(reportId: string, broker: string, accountNumber: string) {
    if (!confirm("למחוק דוח זה? פעולה זו אינה ניתנת לביטול.")) return;
    setDeletingId(reportId);
    const hh = getHouseholdId();
    try {
      const res = await fetch(`/api/investments/reports?householdId=${encodeURIComponent(hh!)}&reportId=${encodeURIComponent(reportId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // Automatically fetch to update list, and trigger sync for main portfolio.
        const listRes = await fetch(`/api/investments/reports?householdId=${encodeURIComponent(hh!)}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.ok) {
            const newReports = listData.reports as SavedReport[];
            setReports(newReports);

            // Re-evaluate what is the LATEST report for THIS (broker, account)
            const latestForThis = newReports.find(r => r.broker === broker && r.account_number === accountNumber);

            // Now sync the local store for this broker
            const brokerLabel = broker && broker !== "לא זוהה" ? broker : "בית השקעות";
            const account = loadAccounts().find((a) => a.label === brokerLabel || a.broker === brokerLabel);
            if (account) {
              // Clear all existing positions for this broker account
              for (const p of loadPositions().filter((p) => p.accountId === account.id)) {
                deletePosition(p.id);
              }

              // If there is an older report left, restore its positions
              if (latestForThis) {
                for (const h of latestForThis.holdings) {
                  if (h.assetKind === "cash" || h.quantity <= 0) continue;
                  addPosition({
                    accountId: account.id,
                    kind: h.assetKind as AssetKind,
                    symbol: (h.symbol || h.securityNumber || h.name).toUpperCase(),
                    name: h.name,
                    quantity: h.quantity,
                    avgCost: h.quantity > 0 ? h.costIls / h.quantity : 0,
                    currentPrice: h.quantity > 0 ? h.valueIls / h.quantity : 0,
                    currency: (latestForThis.currency || "ILS") as Currency,
                    fxRateToIls: fxRates[latestForThis.currency || "ILS"] || 1,
                  });
                }
              }
              triggerInvestmentSync();
            }
          }
        } else {
          load();
        }
      }
    } finally {
      setDeletingId(null);
    }
  }

  // Group all reports for the management modal
  const groupedAll = new Map<string, SavedReport[]>();
  for (const r of reports) {
    const key = portfolioLabel(r);
    const list = groupedAll.get(key) ?? [];
    list.push(r);
    groupedAll.set(key, list);
  }

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="v-divider flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-extrabold text-verdant-ink">התיקים שלי</h2>
          <p className="mt-0.5 text-[11px] text-verdant-muted">
            {latestReports.length} תיקים פעילים · בחר תיק או צפה בהכל ביחד
          </p>
        </div>
        <button
          onClick={() => setShowManage(true)}
          className="rounded-lg border px-3 py-1.5 text-[11px] font-bold text-verdant-muted transition-colors hover:bg-black/5"
          style={{ borderColor: "#E5E7EB" }}
        >
          ניהול דוחות
        </button>
      </div>

      <div className="p-5">
        {/* Portfolio selector */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSelected("all")}
            className="rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors"
            style={{
              borderColor: selected === "all" ? "#2C7A5A" : "#E5E7EB",
              background: selected === "all" ? "#2C7A5A" : "#FFFFFF",
              color: selected === "all" ? "#FFFFFF" : "#374151",
            }}
          >
            הכל ביחד ({latestReports.length})
          </button>
          {latestReports.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className="rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors"
              style={{
                borderColor: selected === r.id ? "#2C7A5A" : "#E5E7EB",
                background: selected === r.id ? "#2C7A5A" : "#FFFFFF",
                color: selected === r.id ? "#FFFFFF" : "#374151",
              }}
            >
              {portfolioLabel(r)}
              <span className="mr-1 opacity-70">· {fmtDateIL(r.report_date)}</span>
            </button>
          ))}
        </div>

        {/* Aggregate analysis */}
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="שווי כולל" value={fmtMoney(totalValue, displayCurrency)} />
          <Stat label="עלות רכישה" value={fmtMoney(totalCost, displayCurrency)} />
          <Stat label="רווח/הפסד" value={fmtMoney(gain, displayCurrency, { signed: true })} />
          <Stat
            label="תשואה כוללת"
            value={
              totalReturnPct == null ? (
                "—"
              ) : (
                <span dir="ltr">
                  {totalReturnPct >= 0 ? "+" : ""}
                  {totalReturnPct.toFixed(2)}%
                </span>
              )
            }
          />
        </div>

        {/* Allocation by kind */}
        <div className="mb-4 flex flex-wrap gap-2">
          {[...byKind.entries()]
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <span
                key={k}
                className="rounded-lg border px-2.5 py-1 text-[11px] font-bold"
                style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#374151" }}
              >
                {KIND_LABELS[k]} {totalValue > 0 ? `${((v / totalValue) * 100).toFixed(1)}%` : ""}
              </span>
            ))}
        </div>

        {/* Holdings table */}
        <div className="max-h-80 overflow-auto rounded-lg border" style={{ borderColor: "#E5E7EB" }}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] font-bold text-verdant-muted" style={{ background: "#FAFAF7" }}>
                <th className="px-2 py-1.5 text-right">סוג</th>
                <th className="px-2 py-1.5 text-right">נייר</th>
                {showBrokerCol && <th className="px-2 py-1.5 text-right">גוף</th>}
                <th className="px-2 py-1.5 text-left">כמות</th>
                <th className="px-2 py-1.5 text-left">שער נוכחי</th>
                <th className="px-2 py-1.5 text-left">עלות רכישה</th>
                <th className="px-2 py-1.5 text-left">שווי נוכחי</th>
                {holdings.some(h => h._currency && h._currency !== "ILS") && <th className="px-2 py-1.5 text-left">שווי בשקל</th>}
                <th className="px-2 py-1.5 text-left">%</th>
                <th className="px-2 py-1.5 text-left">תשואה</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => {
                const ret = holdingReturn(h);
                return (
                  <tr key={i} className="v-divider border-t">
                    <td className="px-2 py-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                        style={{ background: "#2C7A5A15", color: "#2C7A5A" }}
                      >
                        {KIND_LABELS[h.assetKind]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-bold text-verdant-ink">
                      {h.name}
                      {h.symbol && <span className="ml-1 text-verdant-muted">({h.symbol})</span>}
                    </td>
                    {showBrokerCol && (
                      <td className="px-2 py-1.5 text-verdant-muted">{h._broker}</td>
                    )}
                    <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                      {h.quantity ? h.quantity.toLocaleString() : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                      {h.priceCurrent > 0 ? h.priceCurrent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-left tabular-nums text-verdant-muted" dir="ltr">
                      {h.costIls > 0 ? fmtMoney(h.costIls, h._currency || "ILS") : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-left font-bold tabular-nums text-verdant-ink" dir="ltr">
                      {fmtMoney(h.valueIls, h._currency || "ILS")}
                    </td>
                    {holdings.some(hld => hld._currency && hld._currency !== "ILS") && (
                      <td className="px-2 py-1.5 text-left font-bold tabular-nums text-emerald-600" dir="ltr">
                        {fmtMoney((h.valueIls || 0) * (fxRates[h._currency || "ILS"] || 1), "ILS")}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                      {totalValue > 0 ? (((h.valueIls || 0) * (fxRates[h._currency || "ILS"] || 1) / totalValue) * 100).toFixed(2) : 0}%
                    </td>
                    <td
                      className="px-2 py-1.5 text-left font-bold tabular-nums"
                      dir="ltr"
                      style={{ color: ret == null ? "#9ca3af" : ret >= 0 ? "#16a34a" : "#dc2626" }}
                    >
                      {ret == null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manage Reports Modal */}
      {showManage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setShowManage(false)}
        >
          <div
            className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-[15px] font-extrabold text-verdant-ink">ניהול קבצים ודוחות</h2>
              <button
                onClick={() => setShowManage(false)}
                className="material-symbols-outlined text-gray-400 transition-colors hover:text-gray-700"
              >
                close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-5">
              {groupedAll.size === 0 && (
                <div className="text-center text-[12px] text-verdant-muted">אין דוחות שמורים</div>
              )}
              {[...groupedAll.entries()].map(([label, list]) => (
                <div key={label} className="mb-6 last:mb-0">
                  <div className="mb-2 text-[12px] font-bold text-verdant-ink">{label}</div>
                  <div className="rounded-lg border bg-white" style={{ borderColor: "#E5E7EB" }}>
                    {list.map((r, idx) => (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between px-4 py-3 ${
                          idx < list.length - 1 ? "border-b" : ""
                        }`}
                        style={{ borderColor: "#E5E7EB" }}
                      >
                        <div className="flex flex-col">
                          <span className="text-[12px] font-bold text-verdant-ink">
                            תקופה: {fmtDateIL(r.report_date)}
                            {idx === 0 && (
                              <span className="mr-2 rounded bg-green-100 px-1.5 py-0.5 text-[9px] text-green-800">
                                עדכני
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-verdant-muted">
                            {r.holdings.length} ניירות · שווי {fmtMoney(r.total_value_ils, r.currency || "ILS")}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDelete(r.id, r.broker || "", r.account_number || "")}
                          disabled={deletingId === r.id}
                          className="flex items-center gap-1 rounded text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                          {deletingId === r.id ? "מוחק..." : "מחק"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="v-divider rounded border bg-[#FAFAF7] p-2 text-right">
      <div className="text-[10px] font-bold uppercase tracking-wider text-verdant-muted">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-extrabold text-verdant-ink">{value}</div>
    </div>
  );
}
