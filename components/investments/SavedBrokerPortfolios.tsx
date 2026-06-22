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
  type AssetKind,
  type Currency,
} from "@/lib/portfolio-store";

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

function buildComparison(
  from: SavedReport,
  to: SavedReport,
  fx: { from: Record<string, number>; to: Record<string, number> }
) {
  const fromValue = reportValueIls(from, fx.from);
  const toValue = reportValueIls(to, fx.to);
  const deltaValue = fromValue != null && toValue != null ? toValue - fromValue : null;
  const deltaPct = fromValue && deltaValue != null ? (deltaValue / fromValue) * 100 : null;

  const fromByKey = new Map<string, Holding>();
  const toByKey = new Map<string, Holding>();
  for (const h of from.holdings || []) fromByKey.set(holdingKey(h), h);
  for (const h of to.holdings || []) toByKey.set(holdingKey(h), h);

  const added = [...toByKey.entries()]
    .filter(([key]) => !fromByKey.has(key))
    .map(([, h]) => ({
      name: h.name || h.symbol,
      valueOrig: h.valueIls || 0,
      valueIls: holdingValueIls(h, to, fx.to),
    }))
    .sort((a, b) => b.valueIls - a.valueIls);

  const removed = [...fromByKey.entries()]
    .filter(([key]) => !toByKey.has(key))
    .map(([, h]) => ({
      name: h.name || h.symbol,
      valueOrig: h.valueIls || 0,
      valueIls: holdingValueIls(h, from, fx.from),
    }))
    .sort((a, b) => b.valueIls - a.valueIls);

  const changed = [...toByKey.entries()]
    .filter(([key]) => fromByKey.has(key))
    .map(([key, current]) => {
      const previous = fromByKey.get(key)!;
      const prevValue = holdingValueIls(previous, from, fx.from);
      const curValue = holdingValueIls(current, to, fx.to);
      const valueDeltaIls = curValue - prevValue;
      
      const prevOrig = previous.valueIls || 0;
      const curOrig = current.valueIls || 0;
      const valueDeltaOrig = curOrig - prevOrig;
      
      const qtyDelta = (current.quantity || 0) - (previous.quantity || 0);
      return {
        name: current.name || current.symbol,
        valueOrig: valueDeltaOrig,
        valueIls: valueDeltaIls,
        qtyDelta,
        absIls: Math.abs(valueDeltaIls),
      };
    })
    .filter((row) => row.absIls > 1)
    .sort((a, b) => b.absIls - a.absIls);

  const fromAlloc = reportAllocation(from, fx.from);
  const toAlloc = reportAllocation(to, fx.to);
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
  const cashFlowFx = fxToIls(to.currency, fx.to);
  const showUsd = to.currency === "USD" || (to.broker || "").toLowerCase().includes("blink");

  return {
    fromValue,
    toValue,
    deltaValue,
    deltaPct,
    deposits: cashFlows.deposits * cashFlowFx,
    withdrawals: cashFlows.withdrawals * cashFlowFx,
    hasCashFlows: cashFlows.deposits > 0 || cashFlows.withdrawals > 0,
    added,
    removed,
    changed,
    allocationChanges,
    showUsd,
  };
}

async function fetchFxRatesForBrowser(): Promise<Record<string, number>> {
  const res = await fetch("/api/market?kind=fx", { credentials: "include" });
  if (!res.ok) throw new Error("FX fetch failed");
  const data = await res.json();
  return { ...data, ILS: 1 };
}

async function fetchHistoricalFxRates(date: string): Promise<Record<string, number>> {
  const res = await fetch(`/api/market?kind=fx-date&date=${encodeURIComponent(date)}`, { credentials: "include" });
  if (!res.ok) throw new Error("historical FX fetch failed");
  const data = await res.json();
  return { ...(data?.rates ?? {}), ILS: 1 };
}

export function SavedBrokerPortfolios({ onTotalsChange }: { onTotalsChange?: (totals: { totalValueIls: number; positions: number } | null) => void }) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("all"); // "all" | portfolio key
  const [showManage, setShowManage] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [historicalFxRates, setHistoricalFxRates] = useState<Record<string, Record<string, number>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comparePortfolio, setComparePortfolio] = useState<string>("");
  const [compareFromId, setCompareFromId] = useState<string>("");
  const [compareToId, setCompareToId] = useState<string>("");
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);

  const load = useCallback(async () => {
    const hh = getHouseholdId();
    if (!hh) {
      setLoading(true);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/investments/reports?householdId=${encodeURIComponent(hh)}`, { credentials: "include" });
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

  // Transactions are CUMULATIVE: unlike holdings (a point-in-time snapshot from
  // the latest report), the transaction ledger is the union of every report
  // ever uploaded for the selected portfolio(s). Reports overlap in time
  // (each statement re-lists earlier transactions), so we dedupe on the
  // transaction's natural key before merging, then sort newest-first.
  const allTransactions = useMemo(() => {
    const sourceReports =
      selected === "all"
        ? [...groupedAll.values()].flat()
        : groupedAll.get(selected) ?? [];
    const seen = new Set<string>();
    const merged: (SavedTransaction & { _broker?: string; _currency?: string })[] = [];
    for (const r of sourceReports) {
      for (const tx of r.transactions || []) {
        const key = `${tx.date}|${tx.type}|${tx.name}|${tx.quantity}|${tx.amount}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...tx, _broker: r.broker, _currency: r.currency });
      }
    }
    merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return merged;
  }, [selected, groupedAll]);

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

  const showBrokerCol = selected === "all" && latestReports.length > 1;
  const compareReports = groupedAll.get(comparePortfolio) ?? [];
  const compareFrom = compareReports.find((r) => r.id === compareFromId) ?? null;
  const compareTo = compareReports.find((r) => r.id === compareToId) ?? null;
  const fromFxRates = compareFrom?.report_date ? historicalFxRates[compareFrom.report_date] : undefined;
  const toFxRates = compareTo?.report_date ? historicalFxRates[compareTo.report_date] : undefined;
  const isWaitingForHistoricalFx =
    !!compareFrom &&
    !!compareTo &&
    ((normalizeCurrency(compareFrom.currency) !== "ILS" && !fromFxRates) ||
      (normalizeCurrency(compareTo.currency) !== "ILS" && !toFxRates));
  const comparison =
    compareFrom && compareTo && compareFrom.id !== compareTo.id && !isWaitingForHistoricalFx
      ? buildComparison(compareFrom, compareTo, {
          from: fromFxRates ?? { ILS: 1 },
          to: toFxRates ?? { ILS: 1 },
        })
      : null;

  useEffect(() => {
    const dates = [compareFrom?.report_date, compareTo?.report_date].filter(
      (date): date is string => !!date && !historicalFxRates[date]
    );
    if (dates.length === 0) return;
    let cancelled = false;
    Promise.all(
      [...new Set(dates)].map(async (date) => {
        try {
          const rates = await fetchHistoricalFxRates(date);
          return [date, rates] as const;
        } catch {
          return [date, fxRates] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setHistoricalFxRates((prev) => {
        const next = { ...prev };
        for (const [date, rates] of entries) next[date] = rates;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [compareFrom?.report_date, compareTo?.report_date, fxRates, historicalFxRates]);


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


  async function handleDelete(reportId: string, _broker: string, _accountNumber: string) {
    if (!confirm("למחוק דוח זה? פעולה זו אינה ניתנת לביטול.")) return;
    setDeletingId(reportId);
    const hh = getHouseholdId();
    try {
      const res = await fetch(`/api/investments/reports?householdId=${encodeURIComponent(hh!)}&reportId=${encodeURIComponent(reportId)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        // Broker holdings live only in investment_reports now — just refresh
        // the list from the server. No portfolio-store rewrite.
        await load();
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
          <Stat 
            label="רווח/הפסד" 
            value={
              isWaitingForFx ? (
                "טוען שער"
              ) : (
                <span dir="ltr" style={{ color: gain > 0 ? "#16a34a" : gain < 0 ? "#dc2626" : "inherit" }}>
                  {fmtMoney(gain, displayCurrency, { signed: true })}
                </span>
              )
            } 
          />
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
                <span dir="ltr" style={{ color: totalReturnPct > 0 ? "#16a34a" : totalReturnPct < 0 ? "#dc2626" : "inherit" }}>
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

          {isWaitingForHistoricalFx && (
            <div className="rounded-lg bg-[#FAFAF7] p-3 text-[11px] font-bold text-verdant-muted">
              טוען שערי מטבע היסטוריים לפי תאריכי הדוחות...
            </div>
          )}

          {comparison && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                <Stat label="שווי קודם" value={comparison.fromValue == null ? "טוען שער" : fmtMoney(comparison.fromValue, "ILS")} />
                <Stat label="שווי נוכחי" value={comparison.toValue == null ? "טוען שער" : fmtMoney(comparison.toValue, "ILS")} />
                <Stat
                  label="שינוי"
                  value={
                    comparison.deltaValue == null ? (
                      "טוען שער"
                    ) : (
                      <span dir="ltr" style={{ color: comparison.deltaValue > 0 ? "#16a34a" : comparison.deltaValue < 0 ? "#dc2626" : "inherit" }}>
                        {fmtMoney(comparison.deltaValue, "ILS", { signed: true })}
                      </span>
                    )
                  }
                />
                <Stat
                  label="שינוי באחוזים"
                  value={
                    comparison.deltaPct == null ? (
                      "—"
                    ) : (
                      <span dir="ltr" style={{ color: comparison.deltaPct > 0 ? "#16a34a" : comparison.deltaPct < 0 ? "#dc2626" : "inherit" }}>
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
                      ? `${fmtMoney(comparison.deposits, "ILS")} / ${fmtMoney(comparison.withdrawals, "ILS")}`
                      : "לא זוהה"
                  }
                />
              </div>

              <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-bold text-verdant-muted">
                {compareFrom?.report_date && fromFxRates?.USD && (
                  <span className="rounded-lg bg-[#FAFAF7] px-2.5 py-1">
                    שער קודם {fmtDateIL(compareFrom.report_date)}:{" "}
                    <span dir="ltr">1 $ = {fromFxRates.USD.toFixed(4)} ₪</span>
                  </span>
                )}
                {compareTo?.report_date && toFxRates?.USD && (
                  <span className="rounded-lg bg-[#FAFAF7] px-2.5 py-1">
                    שער נוכחי {fmtDateIL(compareTo.report_date)}:{" "}
                    <span dir="ltr">1 $ = {toFxRates.USD.toFixed(4)} ₪</span>
                  </span>
                )}
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
                <ComparisonList title="ניירות שנוספו" items={comparison.added} empty="לא נוספו ניירות" showUsd={comparison.showUsd} />
                <ComparisonList title="ניירות שנעלמו" items={comparison.removed} empty="לא נעלמו ניירות" showUsd={comparison.showUsd} />
                <ComparisonList title="שינויים מרכזיים" items={comparison.changed} empty="אין שינוי מהותי" showUsd={comparison.showUsd} isDelta />
              </div>
            </>
          )}
        </div>

        {/* Holdings table */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-extrabold text-verdant-ink">פירוט אחזקות</div>
          {allTransactions.length > 0 ? (
            <button 
              onClick={() => setIsTransactionsModalOpen(true)}
              className="text-[11px] font-bold text-[#2C7A5A] bg-[#2C7A5A]/10 px-3 py-1.5 rounded-lg hover:bg-[#2C7A5A]/20 transition-colors"
            >
              צפה ב-{allTransactions.length} תנועות בחשבון
            </button>
          ) : (
            <button 
              disabled
              className="text-[11px] font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg cursor-not-allowed"
            >
              אין תנועות שמורות
            </button>
          )}
        </div>
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

      {isTransactionsModalOpen && (
        <TransactionsModal
          transactions={allTransactions}
          onClose={() => setIsTransactionsModalOpen(false)}
        />
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

function ComparisonList({ 
  title, 
  items, 
  empty, 
  showUsd,
  isDelta = false
}: { 
  title: string; 
  items: { name: string; valueIls: number; valueOrig: number; qtyDelta?: number; absIls?: number }[]; 
  empty: string;
  showUsd?: boolean;
  isDelta?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const renderValue = (item: any) => {
    const qtyStr = item.qtyDelta ? (
      <>
        {" · כמות "}
        <span dir="ltr">
          {item.qtyDelta > 0 ? "+" : ""}
          {item.qtyDelta.toLocaleString()}
        </span>
      </>
    ) : null;

    if (showUsd) {
      return (
        <>
          <span dir="ltr">{fmtMoney(item.valueOrig, "USD", { signed: isDelta })}</span>
          {" ("}
          <span dir="ltr">{fmtMoney(item.valueIls, "ILS", { signed: isDelta })}</span>
          {")"}
          {qtyStr}
        </>
      );
    }
    return (
      <>
        <span dir="ltr">{fmtMoney(item.valueIls, "ILS", { signed: isDelta })}</span>
        {qtyStr}
      </>
    );
  };

  return (
    <>
      <button 
        onClick={() => items.length > 0 && setIsOpen(true)}
        className={`rounded-lg border p-3 text-right transition-all h-full flex flex-col items-start w-full ${items.length > 0 ? "hover:opacity-80 active:scale-[0.98]" : ""}`} 
        style={{ 
          borderColor: "#E5E7EB", 
          background: "#FAFAF7", 
          cursor: items.length > 0 ? "pointer" : "default" 
        }}
      >
        <div className="mb-2 text-[11px] font-extrabold text-verdant-ink">{title}</div>
        {items.length === 0 ? (
          <div className="text-[11px] font-bold text-verdant-muted">{empty}</div>
        ) : (
          <div className="text-[11px] font-bold text-verdant-muted">
            {items.length} {items.length === 1 ? 'פריט' : 'פריטים'} (לחץ לפירוט)
          </div>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-5 bg-white z-10">
              <h2 className="text-[15px] font-extrabold text-verdant-ink">{title}</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="material-symbols-outlined text-gray-400 transition-colors hover:text-gray-700"
              >
                close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-[12px] text-right border-collapse">
                <thead className="bg-[#FAFAF7] text-[11px] text-verdant-muted font-bold sticky top-0 border-b z-10" style={{ borderColor: "#E5E7EB" }}>
                  <tr>
                    <th className="py-2.5 px-5">נייר</th>
                    {items.some((row) => row.qtyDelta !== undefined) && (
                      <th className="py-2.5 px-3 text-center">כמות</th>
                    )}
                    {showUsd && (
                      <th className="py-2.5 px-3 text-left">סכום ($)</th>
                    )}
                    <th className="py-2.5 px-5 text-left">סכום (₪)</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "#E5E7EB" }}>
                  {items.map((row, i) => {
                    const getStyle = (val: number) => {
                      if (!isDelta) return { fontWeight: "bold" };
                      return {
                        fontWeight: "bold",
                        color: val > 0 ? "#16a34a" : val < 0 ? "#dc2626" : "inherit",
                      };
                    };

                    return (
                      <tr key={i} className="hover:bg-black/[0.02] transition-colors">
                        <td className="py-2.5 px-5 font-bold text-verdant-ink">{row.name}</td>
                        {items.some((r) => r.qtyDelta !== undefined) && (
                          <td className="py-2.5 px-3 text-center text-verdant-muted" dir="ltr">
                            {row.qtyDelta !== undefined && row.qtyDelta !== 0 ? (
                              <span dir="ltr" style={getStyle(row.qtyDelta)}>
                                {row.qtyDelta > 0 ? "+" : ""}
                                {row.qtyDelta.toLocaleString()}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                        {showUsd && (
                          <td className="py-2.5 px-3 text-left text-verdant-muted whitespace-nowrap" dir="ltr">
                            <span dir="ltr" style={getStyle(row.valueOrig)}>
                              {fmtMoney(row.valueOrig, "USD", { signed: isDelta })}
                            </span>
                          </td>
                        )}
                        <td className="py-2.5 px-5 text-left text-verdant-muted whitespace-nowrap" dir="ltr">
                          <span dir="ltr" style={getStyle(row.valueIls)}>
                            {fmtMoney(row.valueIls, "ILS", { signed: isDelta })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TransactionsModal({ transactions, onClose }: { transactions: (SavedTransaction & { _broker?: string, _currency?: string })[], onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-5 bg-white z-10">
          <h2 className="text-[15px] font-extrabold text-verdant-ink">רשימת תנועות ({transactions.length})</h2>
          <button
            onClick={onClose}
            className="material-symbols-outlined text-gray-400 transition-colors hover:text-gray-700"
          >
            close
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-[12px] text-right border-collapse">
            <thead className="bg-[#FAFAF7] text-[11px] text-verdant-muted font-bold sticky top-0 border-b z-10" style={{ borderColor: "#E5E7EB" }}>
              <tr>
                <th className="py-2.5 px-5">תאריך</th>
                <th className="py-2.5 px-3">סוג תנועה</th>
                <th className="py-2.5 px-3">נייר/תיאור</th>
                <th className="py-2.5 px-3 text-left">כמות</th>
                <th className="py-2.5 px-5 text-left">סכום</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "#E5E7EB" }}>
              {transactions.map((tx, i) => {
                const isUsd = tx._currency === "USD" || (tx._broker || "").toLowerCase().includes("blink");
                const sign = tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : "";
                const symbol = isUsd ? " $" : "";
                return (
                  <tr key={i} className="hover:bg-black/[0.02] transition-colors">
                    <td className="py-2.5 px-5 text-verdant-muted whitespace-nowrap">{tx.date}</td>
                    <td className="py-2.5 px-3 font-bold text-verdant-ink">{tx.type}</td>
                    <td className="py-2.5 px-3 text-verdant-ink">{tx.name || "—"}</td>
                    <td className="py-2.5 px-3 text-left text-verdant-muted whitespace-nowrap" dir="ltr">
                      {tx.quantity ? tx.quantity.toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 px-5 text-left font-bold whitespace-nowrap" dir="ltr" style={{ color: tx.amount > 0 ? "#16a34a" : tx.amount < 0 ? "#dc2626" : "inherit" }}>
                      <span dir="ltr">{sign}{Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{symbol}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
