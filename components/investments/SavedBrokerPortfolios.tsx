"use client";

/**
 * SavedBrokerPortfolios — view analyzed broker reports persisted in
 * `investment_reports`. A household can hold several portfolios across several
 * brokers; this panel lets the user pick one portfolio or aggregate "all
 * together". Each portfolio shows the statement "as of" date (Israeli format).
 *
 * Refreshes when BrokerReportUpload dispatches REPORT_SAVED_EVENT after a save.
 */

import { useCallback, useEffect, useMemo, useState, ReactNode } from "react";

import { ACTIVE_CLIENT_CHANGED } from "@/lib/client-scope";
import { fmtMoney, fmtDateIL } from "@/lib/_shared/format";
import { getHouseholdId } from "@/lib/sync/remote-sync";
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
interface SavedTransaction {
  date: string;
  type: string;
  name: string;
  quantity: number;
  amount: number;
}
interface SavedReport {
  id: string;
  broker: string;
  account_number: string;
  report_date: string | null;
  total_value_ils: number;
  currency?: string;
  holdings: Holding[];
  transactions?: SavedTransaction[];
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

function portfolioKey(r: SavedReport): string {
  return `${r.broker || ""}|${r.account_number || ""}`;
}

function reportTime(r: SavedReport): number {
  return r.report_date ? new Date(r.report_date).getTime() || 0 : 0;
}

function normalizeCurrency(currency: string | undefined): Currency {
  const cur = (currency || "ILS").toUpperCase();
  return cur === "USD" || cur === "EUR" || cur === "GBP" ? cur : "ILS";
}

function fxToIls(currency: string | undefined, fxRates: Record<string, number>): number {
  const cur = normalizeCurrency(currency);
  return cur === "ILS" ? 1 : fxRates[cur] || 0;
}

function canConvertToIls(currency: string | undefined, fxRates: Record<string, number>): boolean {
  return fxToIls(currency, fxRates) > 0;
}

function valueToIls(value: number, currency: string | undefined, fxRates: Record<string, number>): number | null {
  const fx = fxToIls(currency, fxRates);
  return fx > 0 ? value * fx : null;
}

function holdingKey(h: Holding): string {
  return (h.symbol || h.securityNumber || h.name || "").trim().toUpperCase();
}

function reportValueIls(report: SavedReport, fxRates: Record<string, number>): number | null {
  const value = report.total_value_ils || 0;
  return valueToIls(value, report.currency, fxRates);
}

function reportAllocation(report: SavedReport, fxRates: Record<string, number>): Map<DisplayAssetKind, number> {
  const out = new Map<DisplayAssetKind, number>();
  for (const h of report.holdings || []) {
    const value = valueToIls(h.valueIls || 0, report.currency, fxRates);
    out.set(h.assetKind, (out.get(h.assetKind) ?? 0) + (value ?? 0));
  }
  return out;
}

function reportCashFlows(report: SavedReport): { deposits: number; withdrawals: number } {
  let deposits = 0;
  let withdrawals = 0;
  for (const tx of report.transactions || []) {
    const type = tx.type || "";
    const amount = Math.abs(tx.amount || 0);
    if (!amount) continue;
    if (type.includes("הפקדה")) deposits += amount;
    if (type.includes("משיכה")) withdrawals += amount;
  }
  return { deposits, withdrawals };
}

function holdingValueIls(h: Holding, report: SavedReport, fxRates: Record<string, number>): number {
  return valueToIls(h.valueIls || 0, report.currency, fxRates) ?? 0;
}

function buildComparison(from: SavedReport, to: SavedReport, fxRates: Record<string, number>) {
  const fromValue = reportValueIls(from, fxRates);
  const toValue = reportValueIls(to, fxRates);
  const deltaValue = fromValue != null && toValue != null ? toValue - fromValue : null;
  const deltaPct = fromValue && deltaValue != null ? (deltaValue / fromValue) * 100 : null;

  const fromByKey = new Map<string, Holding>();
  const toByKey = new Map<string, Holding>();
  for (const h of from.holdings || []) fromByKey.set(holdingKey(h), h);
  for (const h of to.holdings || []) toByKey.set(holdingKey(h), h);

  const added = [...toByKey.entries()]
    .filter(([key]) => !fromByKey.has(key))
    .map(([, h]) => `${h.name || h.symbol}: ${fmtMoney(holdingValueIls(h, to, fxRates), "ILS")}`)
    .slice(0, 5);

  const removed = [...fromByKey.entries()]
    .filter(([key]) => !toByKey.has(key))
    .map(([, h]) => `${h.name || h.symbol}: ${fmtMoney(holdingValueIls(h, from, fxRates), "ILS")}`)
    .slice(0, 5);

  const changed = [...toByKey.entries()]
    .filter(([key]) => fromByKey.has(key))
    .map(([key, current]) => {
      const previous = fromByKey.get(key)!;
      const prevValue = holdingValueIls(previous, from, fxRates);
      const curValue = holdingValueIls(current, to, fxRates);
      const valueDelta = curValue - prevValue;
      const qtyDelta = (current.quantity || 0) - (previous.quantity || 0);
      return {
        abs: Math.abs(valueDelta),
        label: `${current.name || current.symbol}: ${fmtMoney(valueDelta, "ILS", { signed: true })}${
          qtyDelta ? ` · כמות ${qtyDelta > 0 ? "+" : ""}${qtyDelta.toLocaleString()}` : ""
        }`,
      };
    })
    .filter((row) => row.abs > 1)
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 5)
    .map((row) => row.label);

  const fromAlloc = reportAllocation(from, fxRates);
  const toAlloc = reportAllocation(to, fxRates);
  const kinds = new Set<DisplayAssetKind>([...fromAlloc.keys(), ...toAlloc.keys()]);
  const allocationChanges = [...kinds]
    .map((kind) => {
      const fromShare = fromValue ? ((fromAlloc.get(kind) ?? 0) / fromValue) * 100 : 0;
      const toShare = toValue ? ((toAlloc.get(kind) ?? 0) / toValue) * 100 : 0;
      return { kind, deltaPct: toShare - fromShare };
    })
    .filter((row) => Math.abs(row.deltaPct) >= 0.1)
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 6);

  const cashFlows = reportCashFlows(to);
  return {
    fromValue,
    toValue,
    deltaValue,
    deltaPct,
    deposits: cashFlows.deposits,
    withdrawals: cashFlows.withdrawals,
    hasCashFlows: cashFlows.deposits > 0 || cashFlows.withdrawals > 0,
    added,
    removed,
    changed,
    allocationChanges,
  };
}

async function fetchFxRatesForBrowser(): Promise<Record<string, number>> {
  const res = await fetch("/api/market?kind=fx");
  if (!res.ok) throw new Error("FX fetch failed");
  const data = await res.json();
  return { ...data, ILS: 1 };
}

export function SavedBrokerPortfolios({ onTotalsChange }: { onTotalsChange?: (totals: { totalValueIls: number; positions: number } | null) => void }) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("all"); // "all" | portfolio key
  const [showManage, setShowManage] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comparePortfolio, setComparePortfolio] = useState<string>("");
  const [compareFromId, setCompareFromId] = useState<string>("");
  const [compareToId, setCompareToId] = useState<string>("");

  const load = useCallback(async () => {
    const hh = getHouseholdId();
    if (!hh) {
      setLoading(true);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/investments/reports?householdId=${encodeURIComponent(hh)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setReports(data.reports as SavedReport[]);
      } else {
        setReports((prev) => (prev.length > 0 ? prev : []));
        setLoadError(data?.error || "טעינת דוחות נכשלה");
      }
    } catch {
      setReports((prev) => (prev.length > 0 ? prev : []));
      setLoadError("טעינת דוחות נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchFxRatesForBrowser().then(setFxRates).catch(() => setFxRates({}));
    const onSaved = () => load();
    const retryUntilHousehold = window.setInterval(() => {
      if (getHouseholdId()) {
        window.clearInterval(retryUntilHousehold);
        load();
      }
    }, 500);
    window.addEventListener(REPORT_SAVED_EVENT, onSaved);
    window.addEventListener(ACTIVE_CLIENT_CHANGED, onSaved);
    window.addEventListener("verdant:portfolio:updated", onSaved);
    return () => {
      window.clearInterval(retryUntilHousehold);
      window.removeEventListener(REPORT_SAVED_EVENT, onSaved);
      window.removeEventListener(ACTIVE_CLIENT_CHANGED, onSaved);
      window.removeEventListener("verdant:portfolio:updated", onSaved);
    };
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

  // Group by (broker, account) to find the latest report for each portfolio.
  // The query returns them ordered by report_date descending, so the first one we see per group is the latest.
  const { latestReports, groupedAll } = useMemo(() => {
    const grouped = new Map<string, SavedReport[]>();
    for (const r of reports) {
      const key = portfolioKey(r);
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => reportTime(b) - reportTime(a));
    }
    return {
      groupedAll: grouped,
      latestReports: [...grouped.values()].map((list) => list[0]).filter(Boolean),
    };
  }, [reports]);

  useEffect(() => {
    const entries = [...groupedAll.entries()];
    if (entries.length === 0) {
      setComparePortfolio("");
      setCompareFromId("");
      setCompareToId("");
      return;
    }

    const currentEntry = comparePortfolio ? groupedAll.get(comparePortfolio) : undefined;
    const defaultEntry = entries.find(([, list]) => list.length >= 2) ?? entries[0];
    const usableKey = currentEntry ? comparePortfolio : defaultEntry[0];
    const usableList = currentEntry ?? defaultEntry[1];
    const latest = usableList[0];
    const previous = usableList[1];

    if (comparePortfolio !== usableKey) setComparePortfolio(usableKey);
    if (!latest) {
      setCompareToId("");
      setCompareFromId("");
      return;
    }

    if (!usableList.some((r) => r.id === compareToId)) setCompareToId(latest.id);

    if (!previous) {
      if (compareFromId) setCompareFromId("");
      return;
    }

    if (!usableList.some((r) => r.id === compareFromId) || compareFromId === latest.id) {
      setCompareFromId(previous.id);
    }
  }, [compareFromId, comparePortfolio, compareToId, groupedAll, reports]);

  const active =
    selected === "all" ? latestReports : latestReports.filter((r) => portfolioKey(r) === selected);
  const holdings: (Holding & { _broker: string; _currency?: string; _reportDate?: string | null })[] = active.flatMap((r) =>
    (r.holdings || []).map((h) => ({
      ...h,
      _broker: r.broker || "בית השקעות",
      _currency: r.currency,
      _reportDate: r.report_date,
    }))
  );
  const showIlsValueCol = holdings.some((h) => normalizeCurrency(h._currency) !== "ILS");

  // Aggregate analysis across the selected portfolio(s).
  // We determine the display currency: if exactly one report is selected, use its currency.
  // Otherwise, default to ILS or "₪" if mixed.
  const displayCurrency = active.length === 1 && active[0].currency === "USD" ? "USD" : "ILS";
  const usdIlsRate = fxRates.USD;
  const hasRequiredFx = holdings.every((h) => canConvertToIls(h._currency, fxRates));

  const totalValue = holdings.reduce((s, h) => {
    const amount = h.valueIls || 0;
    if (displayCurrency !== "ILS") return s + amount;
    const valueIls = valueToIls(amount, h._currency, fxRates);
    return s + (valueIls ?? 0);
  }, 0);
  
  const withCost = holdings.filter((h) => h.costIls > 0);
  const totalCost = withCost.reduce((s, h) => {
    if (displayCurrency !== "ILS") return s + h.costIls;
    const costIls = valueToIls(h.costIls, h._currency, fxRates);
    return s + (costIls ?? 0);
  }, 0);
  
  const curValueOfCosted = withCost.reduce((s, h) => {
    if (displayCurrency !== "ILS") return s + h.valueIls;
    const valueIls = valueToIls(h.valueIls, h._currency, fxRates);
    return s + (valueIls ?? 0);
  }, 0);
  
  const gain = curValueOfCosted - totalCost;
  const totalReturnPct = totalCost > 0 ? (gain / totalCost) * 100 : null;
  const isWaitingForFx = displayCurrency === "ILS" && !hasRequiredFx;

  useEffect(() => {
    onTotalsChange?.(
      reports.length > 0 && hasRequiredFx ? { totalValueIls: totalValue, positions: holdings.length } : null
    );
  }, [hasRequiredFx, holdings.length, onTotalsChange, reports.length, totalValue]);

  if (loading && reports.length === 0) {
    return <SavedBrokerPortfoliosSkeleton />;
  }

  if (loadError) {
    return (
      <section className="card mb-6 p-5 text-right">
        <div className="text-[12px] font-extrabold text-red-600">{loadError}</div>
        <button
          onClick={load}
          className="mt-3 rounded-lg border px-3 py-1.5 text-[11px] font-bold text-verdant-muted"
          style={{ borderColor: "#E5E7EB" }}
        >
          נסה שוב
        </button>
      </section>
    );
  }

  if (reports.length === 0) return null;

  // Allocation by asset kind.
  const byKind = new Map<DisplayAssetKind, number>();
  for (const h of holdings) {
    const amount = h.valueIls || 0;
    byKind.set(
      h.assetKind,
      (byKind.get(h.assetKind) ?? 0) +
        (displayCurrency === "ILS" ? valueToIls(amount, h._currency, fxRates) ?? 0 : amount)
    );
  }

  const holdingReturn = (h: Holding) =>
    h.costIls > 0 ? ((h.valueIls - h.costIls) / h.costIls) * 100 : null;

  const showBrokerCol = selected === "all" && latestReports.length > 1;
  const compareReports = groupedAll.get(comparePortfolio) ?? [];
  const compareFrom = compareReports.find((r) => r.id === compareFromId) ?? null;
  const compareTo = compareReports.find((r) => r.id === compareToId) ?? null;
  const comparison =
    compareFrom && compareTo && compareFrom.id !== compareTo.id
      ? buildComparison(compareFrom, compareTo, fxRates)
      : null;

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
                    currency: normalizeCurrency(latestForThis.currency),
                    fxRateToIls: fxToIls(latestForThis.currency, fxRates),
                    asOfDate: latestForThis.report_date || undefined,
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

  return (
    <section className="card relative mb-6 overflow-hidden">
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-white/55 backdrop-blur-[1px]">
          <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-[11px] font-extrabold text-verdant-muted shadow-sm">
            <span className="material-symbols-outlined animate-spin text-[14px] text-verdant-emerald">
              progress_activity
            </span>
            מרענן נתונים...
          </div>
        </div>
      )}
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
              key={portfolioKey(r)}
              onClick={() => setSelected(portfolioKey(r))}
              className="rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors"
              style={{
                borderColor: selected === portfolioKey(r) ? "#2C7A5A" : "#E5E7EB",
                background: selected === portfolioKey(r) ? "#2C7A5A" : "#FFFFFF",
                color: selected === portfolioKey(r) ? "#FFFFFF" : "#374151",
              }}
            >
              {portfolioLabel(r)}
              <span className="mr-1 opacity-70">· {fmtDateIL(r.report_date)}</span>
            </button>
          ))}
        </div>
        <div className="mb-4 rounded-lg bg-[#FAFAF7] px-3 py-2 text-[11px] font-bold text-verdant-muted">
          {active.length === 1
            ? `מוצג דוח אחרון: ${fmtDateIL(active[0].report_date)}`
            : "מוצגים הדוחות האחרונים מכל תיק פעיל"}
        </div>

        {/* Aggregate analysis */}
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          <Stat label="שווי כולל" value={isWaitingForFx ? "טוען שער" : fmtMoney(totalValue, displayCurrency)} />
          <Stat label="עלות רכישה" value={isWaitingForFx ? "טוען שער" : fmtMoney(totalCost, displayCurrency)} />
          <Stat label="רווח/הפסד" value={isWaitingForFx ? "טוען שער" : fmtMoney(gain, displayCurrency, { signed: true })} />
          <Stat
            label="שער דולר חי"
            value={
              usdIlsRate ? (
                <span dir="ltr">
                  1 $ = {usdIlsRate.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ₪
                </span>
              ) : (
                "לא נטען"
              )
            }
          />
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

        {/* Period comparison */}
        <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-extrabold text-verdant-ink">השוואת תקופות</div>
              <div className="mt-0.5 text-[11px] text-verdant-muted">
                ברירת המחדל היא הדוח האחרון מול הדוח שלפניו, מתוך הדוחות השמורים
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={comparePortfolio}
                onChange={(e) => {
                  const key = e.target.value;
                  const list = groupedAll.get(key) ?? [];
                  setComparePortfolio(key);
                  setCompareToId(list[0]?.id ?? "");
                  setCompareFromId(list[1]?.id ?? "");
                }}
                className="rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                style={{ borderColor: "#E5E7EB", background: "#FAFAF7" }}
              >
                {[...groupedAll.entries()].map(([key, list]) => (
                  <option key={key} value={key}>
                    {portfolioLabel(list[0])}
                  </option>
                ))}
              </select>
              {compareReports.length >= 2 && (
                <>
                  <select
                    value={compareFromId}
                    onChange={(e) => setCompareFromId(e.target.value)}
                    className="rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                    style={{ borderColor: "#E5E7EB", background: "#FAFAF7" }}
                  >
                    {compareReports.map((r) => (
                      <option key={r.id} value={r.id}>
                        קודם: {fmtDateIL(r.report_date)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={compareToId}
                    onChange={(e) => setCompareToId(e.target.value)}
                    className="rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                    style={{ borderColor: "#E5E7EB", background: "#FAFAF7" }}
                  >
                    {compareReports.map((r) => (
                      <option key={r.id} value={r.id}>
                        נוכחי: {fmtDateIL(r.report_date)}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {compareReports.length < 2 && (
            <div className="rounded-lg bg-[#FAFAF7] p-3 text-[11px] font-bold text-verdant-muted">
              יש דוח אחד בלבד לחשבון הזה. אחרי העלאת דוח נוסף תופיע כאן השוואה בין התקופות.
            </div>
          )}

          {comparison && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                <Stat label="שווי קודם" value={comparison.fromValue == null ? "טוען שער" : fmtMoney(comparison.fromValue, "ILS")} />
                <Stat label="שווי נוכחי" value={comparison.toValue == null ? "טוען שער" : fmtMoney(comparison.toValue, "ILS")} />
                <Stat
                  label="שינוי"
                  value={comparison.deltaValue == null ? "טוען שער" : fmtMoney(comparison.deltaValue, "ILS", { signed: true })}
                />
                <Stat
                  label="שינוי באחוזים"
                  value={
                    comparison.deltaPct == null ? (
                      "—"
                    ) : (
                      <span dir="ltr">
                        {comparison.deltaPct >= 0 ? "+" : ""}
                        {comparison.deltaPct.toFixed(1)}%
                      </span>
                    )
                  }
                />
                <Stat
                  label="הפקדות/משיכות"
                  value={
                    comparison.hasCashFlows
                      ? `${fmtMoney(comparison.deposits, compareTo?.currency || "ILS")} / ${fmtMoney(comparison.withdrawals, compareTo?.currency || "ILS")}`
                      : "לא זוהה"
                  }
                />
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {comparison.allocationChanges.map((a) => (
                  <span
                    key={a.kind}
                    className="rounded-lg border px-2.5 py-1 text-[11px] font-bold"
                    style={{ borderColor: "#E5E7EB", background: "#FAFAF7", color: "#374151" }}
                  >
                    {KIND_LABELS[a.kind]}{" "}
                    <span dir="ltr">
                      {a.deltaPct >= 0 ? "+" : ""}
                      {a.deltaPct.toFixed(1)}%
                    </span>
                  </span>
                ))}
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <ComparisonList title="ניירות שנוספו" rows={comparison.added} empty="לא נוספו ניירות" />
                <ComparisonList title="ניירות שנעלמו" rows={comparison.removed} empty="לא נעלמו ניירות" />
                <ComparisonList title="שינויים מרכזיים" rows={comparison.changed} empty="אין שינוי מהותי" />
              </div>
            </>
          )}
        </div>

        {/* Holdings table */}
        <div className="max-h-80 overflow-auto rounded-lg border" style={{ borderColor: "#E5E7EB" }}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] font-bold text-verdant-muted" style={{ background: "#FAFAF7" }}>
                <th className="px-2 py-1.5 text-right">סוג</th>
                <th className="px-2 py-1.5 text-right">נייר</th>
                {showBrokerCol && <th className="px-2 py-1.5 text-right">גוף</th>}
                <th className="px-2 py-1.5 text-left">נכון ליום</th>
                <th className="px-2 py-1.5 text-left">כמות</th>
                <th className="px-2 py-1.5 text-left">שער נוכחי</th>
                <th className="px-2 py-1.5 text-left">עלות רכישה</th>
                <th className="px-2 py-1.5 text-left">שווי נוכחי</th>
                {showIlsValueCol && <th className="px-2 py-1.5 text-left">שווי בשקל</th>}
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
                    <td className="px-2 py-1.5 text-left tabular-nums text-verdant-muted" dir="ltr">
                      {fmtDateIL(h._reportDate)}
                    </td>
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
                    {showIlsValueCol && (
                      <td className="px-2 py-1.5 text-left font-bold tabular-nums text-emerald-600" dir="ltr">
                        {canConvertToIls(h._currency, fxRates)
                          ? fmtMoney(valueToIls(h.valueIls || 0, h._currency, fxRates) ?? 0, "ILS")
                          : "טוען שער"}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                      {totalValue > 0
                        ? (
                            (((h.valueIls || 0) *
                              (displayCurrency === "ILS" ? fxToIls(h._currency, fxRates) : 1)) /
                              totalValue) *
                            100
                          ).toFixed(2)
                        : "—"}
                      {totalValue > 0 ? "%" : ""}
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
              {[...groupedAll.entries()].map(([key, list]) => (
                <div key={key} className="mb-6 last:mb-0">
                  <div className="mb-2 text-[12px] font-bold text-verdant-ink">{portfolioLabel(list[0])}</div>
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

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
    />
  );
}

function SavedBrokerPortfoliosSkeleton() {
  return (
    <section className="card mb-6 overflow-hidden" aria-busy="true">
      <div className="v-divider flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="mb-2 h-4 w-24" />
          <SkeletonBlock className="h-3 w-56 max-w-full" />
        </div>
        <SkeletonBlock className="h-8 w-24 rounded-lg" />
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <SkeletonBlock className="h-8 w-28 rounded-full" />
          <SkeletonBlock className="h-8 w-36 rounded-full" />
          <SkeletonBlock className="h-8 w-44 rounded-full" />
        </div>

        <SkeletonBlock className="mb-4 h-9 w-full rounded-lg" />

        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="v-divider rounded border bg-[#FAFAF7] p-2">
              <SkeletonBlock className="mb-2 h-3 w-16" />
              <SkeletonBlock className="h-5 w-24" />
            </div>
          ))}
        </div>

        <div className="max-h-80 overflow-hidden rounded-lg border" style={{ borderColor: "#E5E7EB" }}>
          <div className="grid grid-cols-6 gap-3 border-b bg-[#FAFAF7] px-3 py-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3 w-full" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="grid grid-cols-6 gap-3 border-b px-3 py-3 last:border-b-0">
              <SkeletonBlock className="h-5 w-14 rounded" />
              <div>
                <SkeletonBlock className="mb-2 h-3 w-28" />
                <SkeletonBlock className="h-2.5 w-16" />
              </div>
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-3 w-14" />
            </div>
          ))}
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          טוען דוחות השקעות...
        </p>
      </div>
    </section>
  );
}

function ComparisonList({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "#E5E7EB", background: "#FAFAF7" }}>
      <div className="mb-2 text-[11px] font-extrabold text-verdant-ink">{title}</div>
      {rows.length === 0 ? (
        <div className="text-[11px] font-bold text-verdant-muted">{empty}</div>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={row} className="text-[11px] font-bold text-verdant-muted">
              {row}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
