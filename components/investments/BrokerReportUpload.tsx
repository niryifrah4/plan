"use client";

/**
 * BrokerReportUpload — upload an investment-house statement PDF (e.g. IBI),
 * analyze it with Claude (mirrors the pension annual-report flow), preview the
 * parsed holdings + transactions, then save: holdings merge into the local
 * portfolio store AND the analyzed report is persisted to `investment_reports`.
 *
 * Password-protected PDFs are supported — when the server reports the file is
 * encrypted, an inline password field appears and the upload is retried.
 */

import { useRef, useState, useEffect, ReactNode } from "react";

import { REPORT_SAVED_EVENT } from "@/components/investments/SavedBrokerPortfolios";
import { triggerInvestmentSync } from "@/lib/sync-engine";
import { getHouseholdId } from "@/lib/sync/remote-sync";
import { fmtMoney, fmtDateIL } from "@/lib/_shared/format";
import {
  loadAccounts,
  loadPositions,
  saveAccountsAsync,
  savePositionsAsync,
  type AssetKind,
  type Currency,
} from "@/lib/portfolio-store";

/* ─── Types (mirror broker-pdf-parser.ts) ─── */
interface BrokerHolding {
  securityNumber: string;
  name: string;
  symbol: string;
  assetKind: "stock" | "etf" | "crypto" | "bond" | "fund" | "cash";
  quantity: number;
  priceCurrent: number;
  valueIls: number;
  costIls: number;
  pctOfPortfolio: number;
}
interface BrokerTransaction {
  date: string;
  type: string;
  name: string;
  quantity: number;
  amount: number;
}
interface BrokerReport {
  broker: string;
  accountNumber: string;
  reportDate: string;
  currency: string;
  totalValueIls: number;
  holdings: BrokerHolding[];
  transactions: BrokerTransaction[];
  warnings: string[];
}

const MAX_BYTES = 20 * 1024 * 1024;
const KIND_LABELS: Record<BrokerHolding["assetKind"], string> = {
  stock: "מניה",
  etf: "קרן סל",
  crypto: "קריפטו",
  bond: 'אג"ח',
  fund: "קרן",
  cash: "מזומן",
};

function normalizeCurrency(currency: string | undefined): Currency {
  const cur = (currency || "ILS").toUpperCase();
  return cur === "USD" || cur === "EUR" || cur === "GBP" ? cur : "ILS";
}

function fxToIls(currency: string | undefined, fxRates: Record<string, number>): number {
  const cur = normalizeCurrency(currency);
  return cur === "ILS" ? 1 : fxRates[cur] || 0;
}

async function fetchFxRatesForBrowser(): Promise<Record<string, number>> {
  const res = await fetch("/api/market?kind=fx");
  if (!res.ok) throw new Error("FX fetch failed");
  const data = await res.json();
  return { ...data, ILS: 1 };
}

export function BrokerReportUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BrokerReport | null>(null);
  const [method, setMethod] = useState<"deterministic" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedInfo, setSavedInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    fetchFxRatesForBrowser().then(setFxRates).catch(() => setFxRates({}));
  }, []);

  function reset() {
    setFile(null);
    setReport(null);
    setMethod(null);
    setError(null);
    setNeedsPassword(false);
    setPasswordMessage(null);
    setPassword("");
    setSaving(false);
    setSavedInfo(null);
    setShowUploadModal(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyze(theFile: File, pw?: string) {
    setBusy(true);
    setError(null);
    setPasswordMessage(null);
    setReport(null);
    setSavedInfo(null);
    try {
      const fd = new FormData();
      fd.append("files", theFile);
      if (pw) fd.append("password", pw);
      const res = await fetch("/api/investments/parse-report", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        if (data?.code === "PASSWORD_REQUIRED" || data?.code === "PASSWORD_WRONG") {
          setNeedsPassword(true);
          setError(null);
          setPasswordMessage(data.error || "הקובץ מוגן בסיסמה — הזן את הסיסמה כדי לנתח אותו");
          return;
        }
        setError(data?.error || "שגיאה בעיבוד הקובץ");
        return;
      }
      setNeedsPassword(false);
      setPasswordMessage(null);
      const parsedReport = data.report as BrokerReport;
      setReport(parsedReport);
      setMethod((data.method as "deterministic" | "ai") ?? null);
      await saveParsedReport(parsedReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בעיבוד הקובץ — נסה שוב");
    } finally {
      setBusy(false);
    }
  }

  function onPick(f: File | undefined) {
    setError(null);
    setReport(null);
    setNeedsPassword(false);
    setPasswordMessage(null);
    setPassword("");
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError("הקובץ גדול מדי — מקסימום 20MB");
      return;
    }
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("נדרש קובץ PDF מבית ההשקעות");
      return;
    }
    setFile(f);
    setShowUploadModal(true);
    analyze(f);
  }

  /* ── Save: merge into portfolio + persist analyzed report ── */
  async function saveParsedReport(reportToSave: BrokerReport) {
    setSaving(true);
    setSavedInfo(null);
    setError(null);
    try {

    // 1) Persist the analyzed report to the DB first.
    // This allows the server to tell us if this is the *latest* available period
    // for this broker account, so we don't accidentally clobber the active portfolio
    // with historical data.
    let dbSaved = false;
    let isLatest = true;
    const householdId = getHouseholdId();
    if (householdId) {
      try {
        const res = await fetch("/api/investments/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ householdId, report: reportToSave }),
        });
        const data = await res.json();
        dbSaved = res.ok;
        if (dbSaved) {
          isLatest = data.isLatest !== false; // true if true or missing
          window.dispatchEvent(new Event(REPORT_SAVED_EVENT));
        }
      } catch {
        dbSaved = false;
      }
    }

    // 2) Merge holdings into the local portfolio store.
    // We only merge if this report is the latest available period.
    let merged = 0;
    if (isLatest) {
      const brokerLabel = reportToSave.broker && reportToSave.broker !== "לא זוהה" ? reportToSave.broker : "בית השקעות";
      let accounts = loadAccounts();
      let account = accounts.find((a) => a.label === brokerLabel || a.broker === brokerLabel);
      if (!account) {
        account = { id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: brokerLabel, broker: brokerLabel, currency: normalizeCurrency(reportToSave.currency), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        accounts = [...accounts, account];
        const ok = await saveAccountsAsync(accounts);
        if (!ok) throw new Error("Failed to save accounts to DB");
      }

      let nextPositions = loadPositions().filter((p) => p.accountId !== account!.id);

      // Add new positions.
      for (const h of reportToSave.holdings) {
        if (h.assetKind === "cash" || h.quantity <= 0) continue; // cash balances aren't positions
        nextPositions.push({
          id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          accountId: account.id,
          kind: h.assetKind as AssetKind,
          symbol: (h.symbol || h.securityNumber || h.name).toUpperCase(),
          name: h.name,
          quantity: h.quantity,
          avgCost: h.quantity > 0 && h.costIls > 0 ? h.costIls / h.quantity : 0,
          currentPrice: h.quantity > 0 ? h.valueIls / h.quantity : 0,
          currency: normalizeCurrency(reportToSave.currency),
          fxRateToIls: fxToIls(reportToSave.currency, fxRates),
          asOfDate: reportToSave.reportDate || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        merged++;
      }
      
      const posOk = await savePositionsAsync(nextPositions);
      if (!posOk) throw new Error("Failed to save positions to DB");

      triggerInvestmentSync();
    }

    setSavedInfo(
      dbSaved
        ? isLatest
          ? `${merged} ניירות נוספו לתיק · הדוח נשמר במערכת`
          : `הדוח נשמר במערכת (לא עודכן בתיק מכיוון שקיים דוח עדכני יותר)`
        : `${merged} ניירות נוספו לתיק (אופליין)`
    );
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת הדוח נכשלה");
      setSavedInfo(null);
    } finally {
    setSaving(false);
    }
  }

  async function handleSave() {
    if (!report) return;
    await saveParsedReport(report);
  }

  const tradeable = report?.holdings.filter((h) => h.assetKind !== "cash") ?? [];
  const cash = report?.holdings.filter((h) => h.assetKind === "cash") ?? [];
  const usdIlsRate = fxRates.USD;

  // ── Returns analysis ──
  const holdingReturn = (h: BrokerHolding): number | null =>
    h.costIls > 0 ? ((h.valueIls - h.costIls) / h.costIls) * 100 : null;
  const analysis = (() => {
    if (!report) return null;
    const withCost = report.holdings.filter((h) => h.costIls > 0);
    const totalValue = withCost.reduce((s, h) => s + h.valueIls, 0);
    const totalCost = withCost.reduce((s, h) => s + h.costIls, 0);
    const gain = totalValue - totalCost;
    const totalReturnPct = totalCost > 0 ? (gain / totalCost) * 100 : null;
    const ranked = withCost
      .map((h) => ({ h, r: holdingReturn(h)! }))
      .sort((a, b) => b.r - a.r);
    return {
      totalValue,
      totalCost,
      gain,
      totalReturnPct,
      best: ranked[0] ?? null,
      worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    };
  })();

  return (
    <>
    <section className="card mb-6 overflow-hidden">
      <div className="v-divider flex items-center justify-between border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-extrabold text-verdant-ink">דוח בית השקעות (PDF)</h2>
          <p className="mt-0.5 text-[11px] text-verdant-muted">
            העלה דוח מבית ההשקעות שלך — המערכת תפרסר אותו אוטומטית (ובמקרה הצורך תנתח עם AI) ותוסיף את ההחזקות לתיק
          </p>
        </div>
        {report && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold"
            style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
          >
            <span className="material-symbols-outlined text-[14px]">close</span>נקה
          </button>
        )}
      </div>

      <div className="p-5">
        <label
          htmlFor="broker-pdf-input"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPick(Array.from(e.dataTransfer.files)[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-verdant-accent bg-verdant-accent/5" : "v-divider hover:bg-[#FAFAF7]"
          }`}
        >
          <span className="material-symbols-outlined mb-2 text-[36px] text-verdant-accent">
            cloud_upload
          </span>
          <span className="text-sm font-extrabold text-verdant-ink">
            בחר או גרור קובץ PDF מבית ההשקעות
          </span>
          <span className="mt-1 text-[10px] text-verdant-muted">
            עד 20MB · אם הקובץ מוגן בסיסמה — תתבקש להזין אותה
          </span>
          <input
            id="broker-pdf-input"
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? undefined)}
          />
        </label>
      </div>
    </section>

    {showUploadModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        dir="rtl"
        onClick={() => {
          if (!busy && !saving) setShowUploadModal(false);
        }}
      >
        <div
          className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white text-right shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="v-divider flex items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <h3 className="text-sm font-extrabold text-verdant-ink">קליטת דוח בית השקעות</h3>
              <p className="mt-1 text-[11px] font-bold text-verdant-muted">
                {file?.name || "דוח PDF"} · נשמר אוטומטית כתקופה לאחר ניתוח מוצלח
              </p>
            </div>
            <button
              type="button"
              disabled={busy || saving}
              onClick={reset}
              className="material-symbols-outlined rounded-lg border p-1.5 text-[18px] text-verdant-muted disabled:opacity-40"
              style={{ borderColor: "#E5E7EB" }}
            >
              close
            </button>
          </div>

          <div className="max-h-[calc(88vh-76px)] overflow-y-auto p-5">
            {busy && !needsPassword && !report && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <span className="material-symbols-outlined animate-spin text-[40px] text-verdant-emerald">
                  progress_activity
                </span>
                <div className="text-[13px] font-extrabold text-verdant-ink">מנתח את הדוח...</div>
                <div className="text-[11px] font-bold text-verdant-muted">
                  הנתונים יוצגו כאן ולאחר מכן יישמרו כ-snapshot היסטורי.
                </div>
              </div>
            )}

        {/* Password prompt */}
        {needsPassword && file && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold text-amber-800">
              <span className="material-symbols-outlined text-[16px]">lock</span>
              {passwordMessage || "הקובץ מוגן בסיסמה"}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password.trim()) analyze(file, password.trim());
                }}
                placeholder="סיסמת הקובץ"
                className="flex-1 rounded-lg border px-3 py-2 text-[13px] font-bold outline-none"
                style={{ borderColor: "#E5E7EB" }}
                autoFocus
              />
              <button
                onClick={() => password.trim() && analyze(file, password.trim())}
                disabled={busy || !password.trim()}
                className="btn-botanical px-4 py-2 text-[12px] disabled:opacity-40"
              >
                {busy ? "מנתח…" : "פענח ונתח"}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !needsPassword && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-red-500">
              error
            </span>
            <span className="text-[12px] font-bold leading-snug text-red-700">{error}</span>
          </div>
        )}

        {/* Preview */}
        {report && (
          <div>
            {/* Header stats */}
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <Stat label="בית השקעות" value={report.broker} />
              <Stat label="מספר חשבון" value={report.accountNumber || "—"} />
              <Stat label="נכון ליום" value={fmtDateIL(report.reportDate)} />
              <Stat label="שווי כולל" value={fmtMoney(report.totalValueIls, report.currency)} />
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
            </div>

            {method && (
              <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold text-verdant-muted">
                <span className="material-symbols-outlined text-[14px]" style={{ color: "#2C7A5A" }}>
                  {method === "deterministic" ? "rule" : "auto_awesome"}
                </span>
                {method === "deterministic"
                  ? "נותח בפרסור ישיר (התאמה לסכום הכולל אומתה)"
                  : "פרסור ישיר לא התאים — נותח באמצעות AI, מומלץ לבדוק את הנתונים"}
              </div>
            )}

            {report.warnings.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                {report.warnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            {/* Returns analysis */}
            {analysis && analysis.totalCost > 0 && (
              <div className="mb-4">
                <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Stat label="עלות רכישה כוללת" value={fmtMoney(analysis.totalCost, report.currency)} />
                  <Stat label="שווי נוכחי" value={fmtMoney(analysis.totalValue, report.currency)} />
                  <Stat label="רווח/הפסד" value={fmtMoney(analysis.gain, report.currency, { signed: true })} />
                  <Stat
                    label="תשואה כוללת"
                    value={
                      analysis.totalReturnPct == null ? (
                        "—"
                      ) : (
                        <span dir="ltr">
                          {analysis.totalReturnPct >= 0 ? "+" : ""}
                          {analysis.totalReturnPct.toFixed(2)}%
                        </span>
                      )
                    }
                  />
                </div>
                {analysis.best && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-verdant-muted">
                    <span>
                      🟢 הכי רווחי: {analysis.best.h.name}{" "}
                      <span style={{ color: "#16a34a" }} dir="ltr">
                        ({analysis.best.r >= 0 ? "+" : ""}
                        {analysis.best.r.toFixed(1)}%)
                      </span>
                    </span>
                    {analysis.worst && (
                      <span>
                        🔴 הכי מפסיד: {analysis.worst.h.name}{" "}
                        <span style={{ color: "#dc2626" }} dir="ltr">
                          ({analysis.worst.r >= 0 ? "+" : ""}
                          {analysis.worst.r.toFixed(1)}%)
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Holdings table */}
            <div className="mb-2 text-[11px] font-extrabold text-verdant-ink">
              החזקות ({report.holdings.length})
            </div>
            <div className="mb-4 max-h-72 overflow-auto rounded-lg border" style={{ borderColor: "#E5E7EB" }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] font-bold text-verdant-muted" style={{ background: "#FAFAF7" }}>
                    <th className="px-2 py-1.5 text-right">סוג</th>
                    <th className="px-2 py-1.5 text-right">נייר</th>
                    <th className="px-2 py-1.5 text-left">נכון ליום</th>
                    <th className="px-2 py-1.5 text-left">כמות</th>
                    <th className="px-2 py-1.5 text-left">שער נוכחי</th>
                    <th className="px-2 py-1.5 text-left">עלות רכישה</th>
                    <th className="px-2 py-1.5 text-left">שווי נוכחי</th>
                    {report.currency !== "ILS" && <th className="px-2 py-1.5 text-left">שווי בשקל</th>}
                    <th className="px-2 py-1.5 text-left">% מהתיק</th>
                    <th className="px-2 py-1.5 text-left">תשואה</th>
                  </tr>
                </thead>
                <tbody>
                  {[...tradeable, ...cash].map((h, i) => {
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
                        <td className="px-2 py-1.5 text-left tabular-nums text-verdant-muted" dir="ltr">
                          {fmtDateIL(report.reportDate)}
                        </td>
                        <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                          {h.quantity.toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                          {h.priceCurrent > 0 ? h.priceCurrent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-left tabular-nums text-verdant-muted" dir="ltr">
                          {h.costIls > 0 ? fmtMoney(h.costIls, report.currency) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-left font-bold tabular-nums text-verdant-ink" dir="ltr">
                          {fmtMoney(h.valueIls, report.currency)}
                        </td>
                        {report.currency !== "ILS" && (
                          <td className="px-2 py-1.5 text-left font-bold tabular-nums text-emerald-600" dir="ltr">
                            {fmtMoney(h.valueIls * fxToIls(report.currency, fxRates), "ILS")}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                          {h.pctOfPortfolio.toFixed(2)}%
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

            {/* Transactions */}
            {report.transactions.length > 0 && (
              <details className="mb-4">
                <summary className="cursor-pointer text-[11px] font-extrabold text-verdant-ink">
                  תנועות בחשבון ({report.transactions.length})
                </summary>
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border" style={{ borderColor: "#E5E7EB" }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[10px] font-bold text-verdant-muted" style={{ background: "#FAFAF7" }}>
                        <th className="px-2 py-1.5 text-right">תאריך</th>
                        <th className="px-2 py-1.5 text-right">סוג</th>
                        <th className="px-2 py-1.5 text-right">נייר</th>
                        <th className="px-2 py-1.5 text-left">כמות</th>
                        <th className="px-2 py-1.5 text-left">סכום</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.transactions.map((t, i) => (
                        <tr key={i} className="v-divider border-t">
                          <td className="px-2 py-1.5 tabular-nums" dir="ltr">
                            {t.date || "—"}
                          </td>
                          <td className="px-2 py-1.5 font-bold text-verdant-ink">{t.type}</td>
                          <td className="px-2 py-1.5 text-verdant-muted">{t.name}</td>
                          <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                            {t.quantity || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-left tabular-nums" dir="ltr">
                            {t.amount ? fmtMoney(t.amount, report.currency) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || !!savedInfo}
              className="btn-botanical flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
            >
              {saving && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {saving ? "שומר…" : savedInfo ? "נשמר ✓" : "הוסף לתיק ושמור דוח"}
            </button>
            {savedInfo && (
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] font-bold text-verdant-emerald">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                {savedInfo}
              </div>
            )}
            </div>
          )}
          </div>
        </div>
      </div>
    )}
    </>
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
