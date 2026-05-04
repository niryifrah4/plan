"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { fmtILS } from "@/lib/format";
import {
  loadDebtData as loadDebt,
  saveDebtData as saveDebt,
  effectiveTrackRate,
  type DebtData,
  type Loan,
  type Installment,
  type MortgageData,
  type MortgageTrack,
} from "@/lib/debt-store";
import { RefinanceSimulator } from "@/components/debt/RefinanceSimulator";
import { type IndexationType, type RepaymentMethod } from "@/lib/debt-store";
import { useAssumptions } from "@/lib/hooks/useAssumptions";
import { SolidKpi } from "@/components/ui/SolidKpi";

/* ═══════════════════════════════════════════════════════════
   Types & Persistence — imported from @/lib/debt-store (SSOT)
   ═══════════════════════════════════════════════════════════ */

const uid = () => "d" + Math.random().toString(36).slice(2, 9);

/* ═══════════════════════════════════════════════════════════
   Loan Helpers
   ═══════════════════════════════════════════════════════════ */

function elapsedMonths(startDate: string): number {
  if (!startDate) return 0;
  const [y, m] = startDate.split("-").map(Number);
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

function remainingPayments(loan: Loan): number {
  return Math.max(0, loan.totalPayments - elapsedMonths(loan.startDate));
}

function remainingBalance(loan: Loan): number {
  return remainingPayments(loan) * loan.monthlyPayment;
}

/* ═══════════════════════════════════════════════════════════
   Mortgage Helpers
   ═══════════════════════════════════════════════════════════ */

function mortgageTrackElapsed(track: MortgageTrack): number {
  return elapsedMonths(track.startDate);
}

function mortgageTrackRemaining(track: MortgageTrack): number {
  if (!track.endDate) return 0;
  const [ey, em] = track.endDate.split("-").map(Number);
  const now = new Date();
  return Math.max(0, (ey - now.getFullYear()) * 12 + (em - (now.getMonth() + 1)));
}

function weightedAvgInterest(tracks: MortgageTrack[], primeRate: number): number {
  const totalBalance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  if (totalBalance <= 0) return 0;
  const weighted = tracks.reduce(
    (s, t) => s + effectiveTrackRate(t, primeRate) * (t.remainingBalance || 0),
    0
  );
  return weighted / totalBalance;
}

function mortgageTotalMonthly(tracks: MortgageTrack[]): number {
  return tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
}

function mortgageTotalBalance(tracks: MortgageTrack[]): number {
  return tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
}

function mortgageTotalOriginal(tracks: MortgageTrack[]): number {
  return tracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
}

function mortgageOverallProgress(tracks: MortgageTrack[]): number {
  const original = mortgageTotalOriginal(tracks);
  const remaining = mortgageTotalBalance(tracks);
  if (original <= 0) return 0;
  return Math.min(1, (original - remaining) / original);
}

const EMPTY_MORTGAGE: MortgageData = { bank: "", propertyValue: 0, tracks: [] };

/* ═══════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function DebtPage() {
  const assumptions = useAssumptions();
  // Debt page stores interest rates on a 0-100 (percent) scale, while the
  // assumptions store uses 0-1. Convert here so effective-rate math matches
  // the values the user actually types into the track rows.
  const primeRate = assumptions.primeRate * 100;
  const [data, setData] = useState<DebtData>({ loans: [], installments: [] });
  // Refinance simulator modal — holds the track ID being simulated.
  const [refiTrackId, setRefiTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [expandedLoans, setExpandedLoans] = useState(true);
  const [expandedInstallments, setExpandedInstallments] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setData(loadDebt());
  }, []);

  const autoSave = useCallback((next: DebtData) => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDebt(next);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  }, []);

  const update = useCallback(
    (fn: (prev: DebtData) => DebtData) => {
      setData((prev) => {
        const next = fn(prev);
        autoSave(next);
        return next;
      });
    },
    [autoSave]
  );

  /* ── Loan CRUD ── */
  const addLoan = useCallback(() => {
    update((prev) => ({
      ...prev,
      loans: [
        ...prev.loans,
        { id: uid(), lender: "", startDate: "", totalPayments: 0, monthlyPayment: 0 },
      ],
    }));
  }, [update]);

  const updateLoan = useCallback(
    (id: string, field: keyof Loan, value: string | number) => {
      update((prev) => ({
        ...prev,
        loans: prev.loans.map((l) =>
          l.id === id
            ? {
                ...l,
                [field]: field === "lender" || field === "startDate" ? value : Number(value) || 0,
              }
            : l
        ),
      }));
    },
    [update]
  );

  const deleteLoan = useCallback(
    (id: string) => {
      update((prev) => ({ ...prev, loans: prev.loans.filter((l) => l.id !== id) }));
    },
    [update]
  );

  /* ── Installment CRUD ── */
  const addInstallment = useCallback(() => {
    update((prev) => ({
      ...prev,
      installments: [
        ...prev.installments,
        {
          id: uid(),
          merchant: "",
          source: "",
          currentPayment: 1,
          totalPayments: 1,
          monthlyAmount: 0,
        },
      ],
    }));
  }, [update]);

  const updateInstallment = useCallback(
    (id: string, field: keyof Installment, value: string | number) => {
      update((prev) => ({
        ...prev,
        installments: prev.installments.map((inst) =>
          inst.id === id
            ? {
                ...inst,
                [field]: field === "merchant" || field === "source" ? value : Number(value) || 0,
              }
            : inst
        ),
      }));
    },
    [update]
  );

  const deleteInstallment = useCallback(
    (id: string) => {
      update((prev) => ({ ...prev, installments: prev.installments.filter((i) => i.id !== id) }));
    },
    [update]
  );

  /* ── Mortgage CRUD ── */
  const mortgage = data.mortgage || EMPTY_MORTGAGE;
  const [expandedMortgage, setExpandedMortgage] = useState(true);

  const updateMortgageField = useCallback(
    (field: "bank" | "propertyValue", value: string | number) => {
      update((prev) => ({
        ...prev,
        mortgage: {
          ...(prev.mortgage || EMPTY_MORTGAGE),
          [field]: field === "bank" ? value : Number(value) || 0,
        },
      }));
    },
    [update]
  );

  const addMortgageTrack = useCallback(() => {
    update((prev) => ({
      ...prev,
      mortgage: {
        ...(prev.mortgage || EMPTY_MORTGAGE),
        tracks: [
          ...(prev.mortgage?.tracks || []),
          {
            id: uid(),
            name: "",
            interestRate: 0,
            indexation: "לא צמוד" as IndexationType,
            repaymentMethod: "שפיצר" as RepaymentMethod,
            originalAmount: 0,
            remainingBalance: 0,
            monthlyPayment: 0,
            startDate: "",
            endDate: "",
            totalPayments: 0,
          },
        ],
      },
    }));
  }, [update]);

  const updateMortgageTrack = useCallback(
    (id: string, field: keyof MortgageTrack, value: string | number) => {
      update((prev) => ({
        ...prev,
        mortgage: {
          ...(prev.mortgage || EMPTY_MORTGAGE),
          tracks: (prev.mortgage?.tracks || []).map((t) =>
            t.id === id
              ? {
                  ...t,
                  [field]:
                    field === "name" ||
                    field === "indexation" ||
                    field === "repaymentMethod" ||
                    field === "startDate" ||
                    field === "endDate"
                      ? value
                      : Number(value) || 0,
                }
              : t
          ),
        },
      }));
    },
    [update]
  );

  const deleteMortgageTrack = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        mortgage: {
          ...(prev.mortgage || EMPTY_MORTGAGE),
          tracks: (prev.mortgage?.tracks || []).filter((t) => t.id !== id),
        },
      }));
    },
    [update]
  );

  /* ── Derived ── */
  const loanTotals = useMemo(() => {
    const monthlyTotal = data.loans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
    const balanceTotal = data.loans.reduce((s, l) => s + remainingBalance(l), 0);
    return { monthlyTotal, balanceTotal, count: data.loans.length };
  }, [data.loans]);

  const installmentTotals = useMemo(() => {
    const monthlyTotal = data.installments.reduce((s, i) => s + (i.monthlyAmount || 0), 0);
    const count = data.installments.length;
    return { monthlyTotal, count };
  }, [data.installments]);

  const installmentsBySource = useMemo(() => {
    const groups: Record<string, Installment[]> = {};
    data.installments.forEach((inst) => {
      const key = inst.source || "לא מוגדר";
      if (!groups[key]) groups[key] = [];
      groups[key].push(inst);
    });
    return groups;
  }, [data.installments]);

  const mortgageTotals = useMemo(() => {
    const tracks = data.mortgage?.tracks || [];
    return {
      monthlyTotal: mortgageTotalMonthly(tracks),
      balanceTotal: mortgageTotalBalance(tracks),
      originalTotal: mortgageTotalOriginal(tracks),
      avgInterest: weightedAvgInterest(tracks, primeRate),
      progress: mortgageOverallProgress(tracks),
      count: tracks.length,
    };
  }, [data.mortgage, primeRate]);

  const grandMonthly =
    loanTotals.monthlyTotal + installmentTotals.monthlyTotal + mortgageTotals.monthlyTotal;

  return (
    <div className="mx-auto max-w-5xl">
      {/* ═══ Header ═══ */}
      <header className="mb-6 border-b pb-5" style={{ borderColor: "#e2e8d8" }}>
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div
              className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em]"
              style={{ color: "#5a7a6a" }}
            >
              Debt Management
            </div>
            <h1
              className="text-[22px] font-extrabold leading-tight tracking-tight"
              style={{ color: "#012d1d" }}
            >
              הלוואות ותשלומים
            </h1>
          </div>
          {saveStatus !== "idle" && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold"
              style={{
                color: saveStatus === "saving" ? "#5a7a6a" : "#2B694D",
              }}
            >
              <span
                className={`material-symbols-outlined text-[14px] ${saveStatus === "saving" ? "animate-pulse" : ""}`}
              >
                {saveStatus === "saving" ? "cloud_sync" : "cloud_done"}
              </span>
              {saveStatus === "saving" ? "שומר..." : "נשמר"}
            </span>
          )}
        </div>
      </header>

      {/* ═══ KPI Summary ═══ */}
      <div className="mb-3 text-base font-extrabold" style={{ color: "#012d1d" }}>
        סיכום חובות חודשי
      </div>
      <section className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <SolidKpi
          label="משכנתא חודשי"
          value={fmtILS(mortgageTotals.monthlyTotal)}
          icon="home"
          tone="ink"
          sub={`${mortgageTotals.count} מסלולים · ${mortgageTotals.avgInterest.toFixed(2)}% ריבית`}
        />
        <SolidKpi
          label="החזר הלוואות"
          value={fmtILS(loanTotals.monthlyTotal)}
          icon="credit_score"
          tone="red"
          sub={`${loanTotals.count} הלוואות`}
        />
        <SolidKpi
          label="תשלומים חודשיים"
          value={fmtILS(installmentTotals.monthlyTotal)}
          icon="shopping_cart"
          tone="sage"
          sub={`${installmentTotals.count} עסקאות`}
        />
      </section>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <SolidKpi
          label="יתרת משכנתא"
          value={fmtILS(mortgageTotals.balanceTotal)}
          icon="account_balance"
          tone="forest"
          sub={`שולם ${(mortgageTotals.progress * 100).toFixed(0)}%`}
        />
        <SolidKpi
          label="יתרת הלוואות"
          value={fmtILS(loanTotals.balanceTotal)}
          icon="receipt_long"
          tone="ink"
          sub="סה״כ יתרות"
        />
        <SolidKpi
          label="סה״כ חודשי כולל"
          value={fmtILS(grandMonthly)}
          icon="paid"
          tone={grandMonthly > 0 ? "red" : "emerald"}
        />
      </section>

      {/* ═══ Mortgage Section ═══ */}
      <section
        className="mb-4 overflow-hidden rounded-2xl bg-white"
        style={{
          border: "1px solid #F3F4EC",
          boxShadow: "0 1px 2px rgba(107,33,168,.04), 0 8px 24px rgba(107,33,168,.06)",
        }}
      >
        <button
          onClick={() => setExpandedMortgage(!expandedMortgage)}
          className="flex w-full items-center gap-3 px-5 py-5 text-right md:px-7"
          style={{ background: expandedMortgage ? "#F3F4EC" : "#fff" }}
        >
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
            style={{ background: "rgba(107,33,168,0.08)", borderRadius: "0.75rem" }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#1B4332" }}>
              home
            </span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>
              משכנתאות
            </h2>
            <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
              {mortgageTotals.count} מסלולים · החזר חודשי{" "}
              <span style={{ color: "#1B4332", fontFamily: "Assistant" }}>
                {fmtILS(mortgageTotals.monthlyTotal)}
              </span>
              {mortgageTotals.balanceTotal > 0 && (
                <>
                  {" "}
                  · יתרה{" "}
                  <span style={{ color: "#1B4332", fontFamily: "Assistant" }}>
                    {fmtILS(mortgageTotals.balanceTotal)}
                  </span>
                </>
              )}
            </div>
          </div>
          <span
            className="material-symbols-outlined text-[20px] transition-transform"
            style={{
              color: "#5a7a6a",
              transform: expandedMortgage ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          >
            expand_more
          </span>
        </button>

        {expandedMortgage && (
          <div className="px-5 pb-6 pt-2 md:px-7">
            {/* Bank & property info — each field in its own pill for breathing room */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div
                className="flex items-center gap-2 rounded-full px-4 py-2.5"
                style={{ background: "#F9FAF2", border: "1px solid #E8E9E1" }}
              >
                <span className="text-[11px] font-bold" style={{ color: "#5C6058" }}>
                  בנק
                </span>
                <input
                  type="text"
                  value={mortgage.bank}
                  onChange={(e) => updateMortgageField("bank", e.target.value)}
                  placeholder="שם הבנק"
                  className="w-32 border-none bg-transparent text-[13px] font-bold focus:outline-none"
                  style={{ color: "#012d1d" }}
                />
              </div>
              <div
                className="flex items-center gap-2 rounded-full px-4 py-2.5"
                style={{ background: "#F9FAF2", border: "1px solid #E8E9E1" }}
              >
                <span className="text-[11px] font-bold" style={{ color: "#5C6058" }}>
                  שווי נכס
                </span>
                <input
                  type="number"
                  value={mortgage.propertyValue || ""}
                  onChange={(e) => updateMortgageField("propertyValue", e.target.value)}
                  placeholder="0"
                  className="w-24 border-none bg-transparent text-[13px] font-bold tabular-nums focus:outline-none"
                  style={{ color: "#012d1d", fontFamily: "Assistant" }}
                />
              </div>
              {mortgage.propertyValue > 0 && mortgageTotals.balanceTotal > 0 && (
                <div
                  className="rounded-full px-3 py-2 text-[11px] font-extrabold"
                  style={{ background: "#F3F4EC", color: "#1B4332" }}
                >
                  LTV {((mortgageTotals.balanceTotal / mortgage.propertyValue) * 100).toFixed(0)}%
                </div>
              )}
            </div>

            {/* Overall progress bar */}
            {mortgageTotals.originalTotal > 0 && (
              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold" style={{ color: "#1B4332" }}>
                    התקדמות כללית
                  </span>
                  <span
                    className="text-[11px] font-extrabold tabular-nums"
                    style={{ color: "#1B4332", fontFamily: "Assistant" }}
                  >
                    {(mortgageTotals.progress * 100).toFixed(1)}% שולם
                  </span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full"
                  style={{ background: "#F3F4EC" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${mortgageTotals.progress * 100}%`,
                      background: "linear-gradient(90deg, #2B694D, #1B4332)",
                    }}
                  />
                </div>
                <div className="mt-0.5 flex justify-between">
                  <span className="text-[9px] font-semibold" style={{ color: "#9ca3af" }}>
                    שולם {fmtILS(mortgageTotals.originalTotal - mortgageTotals.balanceTotal)}
                  </span>
                  <span className="text-[9px] font-semibold" style={{ color: "#9ca3af" }}>
                    נותר {fmtILS(mortgageTotals.balanceTotal)}
                  </span>
                </div>
              </div>
            )}

            {/* Summary badges */}
            {mortgageTotals.count > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div
                  className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "#F3F4EC", color: "#1B4332" }}
                >
                  החזר חודשי: {fmtILS(mortgageTotals.monthlyTotal)}
                </div>
                <div
                  className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "#F3F4EC", color: "#1B4332" }}
                >
                  ריבית משוקללת: {mortgageTotals.avgInterest.toFixed(2)}%
                </div>
                <div
                  className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "#F3F4EC", color: "#1B4332" }}
                >
                  יתרה: {fmtILS(mortgageTotals.balanceTotal)}
                </div>
              </div>
            )}

            {/* Track column headers */}
            <div
              className="mb-1 grid items-center pb-1 text-[9px] font-extrabold uppercase tracking-[0.08em]"
              style={{
                gridTemplateColumns: "minmax(80px,1fr) 56px 56px 68px 68px 64px 52px 24px",
                color: "#1B4332",
                borderBottom: "1px solid #F3F4EC",
                columnGap: "4px",
              }}
            >
              <div>מסלול</div>
              <div className="text-left">ריבית</div>
              <div className="text-left">הצמדה</div>
              <div className="text-left">סכום מקורי</div>
              <div className="text-left">יתרה</div>
              <div className="text-left">החזר/חודש</div>
              <div className="text-left">סיום</div>
              <div />
            </div>

            {/* Track rows */}
            {(mortgage.tracks || []).map((track) => {
              const elapsed = mortgageTrackElapsed(track);
              const remaining = mortgageTrackRemaining(track);
              const trackProgress =
                track.originalAmount > 0
                  ? Math.min(
                      1,
                      (track.originalAmount - track.remainingBalance) / track.originalAmount
                    )
                  : 0;

              return (
                <div key={track.id}>
                  <div
                    className="group grid items-center py-2"
                    style={{
                      gridTemplateColumns: "minmax(80px,1fr) 56px 56px 68px 68px 64px 52px 24px",
                      borderBottom: "1px solid #F3F4EC",
                      columnGap: "4px",
                    }}
                  >
                    {/* Track name */}
                    <input
                      type="text"
                      value={track.name}
                      onChange={(e) => updateMortgageTrack(track.id, "name", e.target.value)}
                      placeholder="פריים / קל״צ..."
                      className="w-full border-none bg-transparent text-[12px] font-semibold focus:outline-none"
                      style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderBottomColor = "#2B694D";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderBottomColor = "transparent";
                      }}
                    />
                    {/* Interest rate — effective (prime+margin) when margin is set */}
                    <div
                      className="flex items-center gap-0.5"
                      title={
                        typeof track.margin === "number"
                          ? `פריים (${primeRate.toFixed(2)}%) + ${track.margin.toFixed(2)}%`
                          : ""
                      }
                    >
                      <input
                        type="number"
                        step="0.01"
                        value={
                          typeof track.margin === "number"
                            ? effectiveTrackRate(track, primeRate).toFixed(2)
                            : track.interestRate || ""
                        }
                        onChange={(e) =>
                          updateMortgageTrack(track.id, "interestRate", e.target.value)
                        }
                        readOnly={typeof track.margin === "number"}
                        placeholder="0"
                        className="w-full border-none bg-transparent text-left text-[12px] font-bold tabular-nums focus:outline-none"
                        style={{ color: "#1B4332", fontFamily: "Assistant" }}
                      />
                      <span className="text-[10px]" style={{ color: "#9ca3af" }}>
                        %
                      </span>
                    </div>
                    {/* Indexation */}
                    <select
                      value={track.indexation}
                      onChange={(e) => updateMortgageTrack(track.id, "indexation", e.target.value)}
                      className="cursor-pointer border-none bg-transparent text-[10px] font-bold focus:outline-none"
                      style={{ color: "#5a7a6a" }}
                    >
                      <option value="לא צמוד">לא צמוד</option>
                      <option value="מדד">מדד</option>
                      <option value="דולר">דולר</option>
                      <option value="אחר">אחר</option>
                    </select>
                    {/* Original amount */}
                    <input
                      type="number"
                      value={track.originalAmount || ""}
                      onChange={(e) =>
                        updateMortgageTrack(track.id, "originalAmount", e.target.value)
                      }
                      placeholder="0"
                      className="w-full border-none bg-transparent text-left text-[11px] font-bold tabular-nums focus:outline-none"
                      style={{ color: "#012d1d", fontFamily: "Assistant" }}
                    />
                    {/* Remaining balance */}
                    <input
                      type="number"
                      value={track.remainingBalance || ""}
                      onChange={(e) =>
                        updateMortgageTrack(track.id, "remainingBalance", e.target.value)
                      }
                      placeholder="0"
                      className="w-full border-none bg-transparent text-left text-[11px] font-bold tabular-nums focus:outline-none"
                      style={{ color: "#1B4332", fontFamily: "Assistant" }}
                    />
                    {/* Monthly payment */}
                    <input
                      type="number"
                      value={track.monthlyPayment || ""}
                      onChange={(e) =>
                        updateMortgageTrack(track.id, "monthlyPayment", e.target.value)
                      }
                      placeholder="0"
                      className="w-full border-none bg-transparent text-left text-[11px] font-bold tabular-nums focus:outline-none"
                      style={{ color: "#1B4332", fontFamily: "Assistant" }}
                    />
                    {/* End date */}
                    <input
                      type="month"
                      value={track.endDate}
                      onChange={(e) => updateMortgageTrack(track.id, "endDate", e.target.value)}
                      className="w-full border-none bg-transparent text-[10px] font-semibold focus:outline-none"
                      style={{ color: "#5a7a6a" }}
                    />
                    {/* Refi simulator + Delete */}
                    <button
                      onClick={() => setRefiTrackId(track.id)}
                      className="opacity-100 transition-opacity"
                      style={{ color: "#1B4332" }}
                      title="סימולציית מיחזור / פירעון מואץ"
                    >
                      <span className="material-symbols-outlined text-[16px] transition-colors hover:text-verdant-emerald">
                        savings
                      </span>
                    </button>
                    <button
                      onClick={() => deleteMortgageTrack(track.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: "#5a7a6a" }}
                      title="מחק מסלול"
                    >
                      <span className="material-symbols-outlined text-[14px] transition-colors hover:text-red-600">
                        close
                      </span>
                    </button>
                  </div>
                  {/* Track progress */}
                  {track.originalAmount > 0 && (
                    <div className="flex items-center gap-2 pb-1 pr-1">
                      <div
                        className="h-1 flex-1 overflow-hidden rounded-full"
                        style={{ background: "#F3F4EC" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${trackProgress * 100}%`, background: "#2B694D" }}
                        />
                      </div>
                      <span
                        className="text-[9px] font-bold tabular-nums"
                        style={{ color: "#9ca3af", fontFamily: "Assistant" }}
                      >
                        {(trackProgress * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add track */}
            <button onClick={addMortgageTrack} className="btn btn-secondary btn-sm mt-3">
              <span className="material-symbols-outlined text-[14px]">add</span>
              הוסף מסלול
            </button>
          </div>
        )}
      </section>

      {/* ═══ Loans Section ═══ */}
      <section
        className="mb-4 overflow-hidden rounded-2xl bg-white"
        style={{
          border: "1px solid #e2e8d8",
          boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)",
        }}
      >
        <button
          onClick={() => setExpandedLoans(!expandedLoans)}
          className="flex w-full items-center gap-3 px-5 py-5 text-right md:px-7"
          style={{ background: expandedLoans ? "rgba(139,46,46,0.06)" : "#fff" }}
        >
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
            style={{ background: "rgba(139,46,46,0.10)", borderRadius: "0.75rem" }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#8B2E2E" }}>
              account_balance
            </span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>
              הלוואות
            </h2>
            <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
              {loanTotals.count} הלוואות · החזר חודשי {fmtILS(loanTotals.monthlyTotal)}
            </div>
          </div>
          <span
            className="material-symbols-outlined text-[20px] transition-transform"
            style={{
              color: "#5a7a6a",
              transform: expandedLoans ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          >
            expand_more
          </span>
        </button>

        {expandedLoans && data.loans.length === 0 && (
          <div className="px-5 pb-7 pt-2 text-center md:px-7">
            <span className="material-symbols-outlined text-[40px]" style={{ color: "#5a7a6a" }}>
              check_circle
            </span>
            <h3 className="mt-2 text-sm font-extrabold" style={{ color: "#012d1d" }}>
              אין הלוואות צרכניות
            </h3>
            <p
              className="mx-auto mb-3 mt-1 max-w-xs text-[11px] leading-relaxed"
              style={{ color: "#5a7a6a" }}
            >
              נקי מהלוואות צרכניות זה מצוין. אם יש משכנתא — היא כבר למעלה. אם הלוואה חדשה תצטרף, כאן
              המקום להוסיף.
            </p>
            <button onClick={addLoan} className="btn btn-secondary btn-sm">
              <span className="material-symbols-outlined text-[14px]">add</span>
              הוסף הלוואה ידנית
            </button>
          </div>
        )}
        {expandedLoans && data.loans.length > 0 && (
          <div className="px-5 pb-5 md:px-7">
            {/* Column headers */}
            <div
              className="mb-1 grid items-center pb-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
              style={{
                gridTemplateColumns: "minmax(100px,1fr) 100px 80px 90px 100px 100px 28px",
                color: "#5a7a6a",
                borderBottom: "1px solid #eef2e8",
                columnGap: "6px",
              }}
            >
              <div>שם המלווה</div>
              <div className="text-left">תאריך התחלה</div>
              <div className="text-left">תשלומים</div>
              <div className="text-left">החזר חודשי</div>
              <div className="text-left">מונה</div>
              <div className="text-left">יתרה לסילוק</div>
              <div />
            </div>

            {data.loans.map((loan) => {
              const elapsed = elapsedMonths(loan.startDate);
              const remain = remainingPayments(loan);
              const balance = remainingBalance(loan);
              const progress =
                loan.totalPayments > 0 ? Math.min(elapsed / loan.totalPayments, 1) : 0;

              return (
                <div
                  key={loan.id}
                  className="group grid items-center py-2"
                  style={{
                    gridTemplateColumns: "minmax(100px,1fr) 100px 80px 90px 100px 100px 28px",
                    borderBottom: "1px solid #eef2e8",
                    columnGap: "6px",
                  }}
                >
                  {/* Lender */}
                  <input
                    type="text"
                    value={loan.lender}
                    onChange={(e) => updateLoan(loan.id, "lender", e.target.value)}
                    placeholder="שם המלווה"
                    className="w-full border-none bg-transparent text-[13px] font-semibold focus:outline-none"
                    style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "#2B694D";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderBottomColor = "transparent";
                    }}
                  />
                  {/* Start date */}
                  <input
                    type="month"
                    value={loan.startDate}
                    onChange={(e) => updateLoan(loan.id, "startDate", e.target.value)}
                    className="w-full border-none bg-transparent text-[12px] font-semibold focus:outline-none"
                    style={{ color: "#012d1d" }}
                  />
                  {/* Total payments */}
                  <input
                    type="number"
                    value={loan.totalPayments || ""}
                    onChange={(e) => updateLoan(loan.id, "totalPayments", e.target.value)}
                    placeholder="0"
                    className="w-full border-none bg-transparent text-left text-[13px] font-bold tabular-nums focus:outline-none"
                    style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "#2B694D";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderBottomColor = "transparent";
                    }}
                  />
                  {/* Monthly payment */}
                  <input
                    type="number"
                    value={loan.monthlyPayment || ""}
                    onChange={(e) => updateLoan(loan.id, "monthlyPayment", e.target.value)}
                    placeholder="0"
                    className="w-full border-none bg-transparent text-left text-[13px] font-bold tabular-nums focus:outline-none"
                    style={{ color: "#8B2E2E", borderBottom: "1px dotted transparent" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "#2B694D";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderBottomColor = "transparent";
                    }}
                  />
                  {/* Counter */}
                  <div className="flex flex-col gap-0.5">
                    <div
                      className="text-[11px] font-bold tabular-nums"
                      style={{ color: "#012d1d" }}
                    >
                      {loan.startDate ? `${elapsed} מתוך ${loan.totalPayments}` : "—"}
                    </div>
                    {loan.totalPayments > 0 && (
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full"
                        style={{ background: "#eef2e8" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress * 100}%`,
                            background: progress >= 1 ? "#2B694D" : "#B45309",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {/* Remaining balance */}
                  <div
                    className="text-left text-[13px] font-extrabold tabular-nums"
                    style={{ color: balance > 0 ? "#8B2E2E" : "#2B694D" }}
                  >
                    {loan.startDate ? fmtILS(balance) : "—"}
                  </div>
                  {/* Delete */}
                  <button
                    onClick={() => deleteLoan(loan.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "#5a7a6a" }}
                    title="מחק"
                  >
                    <span className="material-symbols-outlined text-[14px] transition-colors hover:text-red-600">
                      close
                    </span>
                  </button>
                </div>
              );
            })}

            {/* Add loan */}
            <button onClick={addLoan} className="btn btn-secondary btn-sm mt-3">
              <span className="material-symbols-outlined text-[14px]">add</span>
              הוסף הלוואה
            </button>
          </div>
        )}
      </section>

      {/* ═══ Installments Section ═══ */}
      <section
        className="mb-4 overflow-hidden rounded-2xl bg-white"
        style={{
          border: "1px solid #e2e8d8",
          boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)",
        }}
      >
        <button
          onClick={() => setExpandedInstallments(!expandedInstallments)}
          className="flex w-full items-center gap-3 px-5 py-5 text-right md:px-7"
          style={{ background: expandedInstallments ? "rgba(74,124,89,0.08)" : "#fff" }}
        >
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
            style={{ background: "rgba(74,124,89,0.10)", borderRadius: "0.75rem" }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#4A7C59" }}>
              credit_score
            </span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>
              עסקאות תשלומים
            </h2>
            <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
              {installmentTotals.count} עסקאות · חיוב חודשי {fmtILS(installmentTotals.monthlyTotal)}
            </div>
          </div>
          <span
            className="material-symbols-outlined text-[20px] transition-transform"
            style={{
              color: "#5a7a6a",
              transform: expandedInstallments ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          >
            expand_more
          </span>
        </button>

        {expandedInstallments && (
          <div className="px-5 pb-5 md:px-7">
            {/* Grouped by source */}
            {Object.keys(installmentsBySource).length > 0 ? (
              Object.entries(installmentsBySource).map(([source, items]) => {
                const sourceTotal = items.reduce((s, i) => s + (i.monthlyAmount || 0), 0);
                const isOpen = expandedSources[source] ?? true;

                return (
                  <div key={source} className="mb-3">
                    {/* Source header */}
                    <button
                      onClick={() => setExpandedSources((prev) => ({ ...prev, [source]: !isOpen }))}
                      className="flex w-full items-center gap-2 py-2 text-right"
                      style={{ borderBottom: "1px solid #eef2e8" }}
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ color: "#4A7C59" }}
                      >
                        credit_card
                      </span>
                      <span className="flex-1 text-[13px] font-bold" style={{ color: "#012d1d" }}>
                        {source}
                      </span>
                      <span
                        className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: "rgba(74,124,89,0.08)", color: "#4A7C59" }}
                      >
                        {items.length} עסקאות · {fmtILS(sourceTotal)}
                      </span>
                      <span
                        className="material-symbols-outlined text-[16px] transition-transform"
                        style={{
                          color: "#5a7a6a",
                          transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    {isOpen && (
                      <div className="mr-4 mt-1">
                        {/* Sub-header */}
                        <div
                          className="mb-1 grid items-center pb-1 text-[9px] font-extrabold uppercase tracking-[0.08em]"
                          style={{
                            gridTemplateColumns: "minmax(100px,1fr) 100px 90px 80px 28px",
                            color: "#5a7a6a",
                            borderBottom: "1px solid #eef2e8",
                            columnGap: "6px",
                          }}
                        >
                          <div>בית עסק</div>
                          <div className="text-left">מקור</div>
                          <div className="text-left">תשלום</div>
                          <div className="text-left">סכום חודשי</div>
                          <div />
                        </div>

                        {items.map((inst) => (
                          <div
                            key={inst.id}
                            className="group grid items-center py-1.5"
                            style={{
                              gridTemplateColumns: "minmax(100px,1fr) 100px 90px 80px 28px",
                              borderBottom: "1px solid #eef2e8",
                              columnGap: "6px",
                            }}
                          >
                            {/* Merchant */}
                            <input
                              type="text"
                              value={inst.merchant}
                              onChange={(e) =>
                                updateInstallment(inst.id, "merchant", e.target.value)
                              }
                              placeholder="שם בית עסק"
                              className="w-full border-none bg-transparent text-[12px] font-semibold focus:outline-none"
                              style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderBottomColor = "#2B694D";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderBottomColor = "transparent";
                              }}
                            />
                            {/* Source */}
                            <input
                              type="text"
                              value={inst.source}
                              onChange={(e) => updateInstallment(inst.id, "source", e.target.value)}
                              placeholder="כרטיס / בנק"
                              className="w-full border-none bg-transparent text-[12px] font-semibold focus:outline-none"
                              style={{ color: "#5a7a6a", borderBottom: "1px dotted transparent" }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderBottomColor = "#2B694D";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderBottomColor = "transparent";
                              }}
                            />
                            {/* Payment counter */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={inst.currentPayment || ""}
                                onChange={(e) =>
                                  updateInstallment(inst.id, "currentPayment", e.target.value)
                                }
                                className="w-8 border-none bg-transparent text-left text-[12px] font-bold tabular-nums focus:outline-none"
                                style={{ color: "#012d1d" }}
                              />
                              <span className="text-[11px]" style={{ color: "#5a7a6a" }}>
                                /
                              </span>
                              <input
                                type="number"
                                value={inst.totalPayments || ""}
                                onChange={(e) =>
                                  updateInstallment(inst.id, "totalPayments", e.target.value)
                                }
                                className="w-8 border-none bg-transparent text-left text-[12px] font-bold tabular-nums focus:outline-none"
                                style={{ color: "#012d1d" }}
                              />
                            </div>
                            {/* Monthly amount */}
                            <input
                              type="number"
                              value={inst.monthlyAmount || ""}
                              onChange={(e) =>
                                updateInstallment(inst.id, "monthlyAmount", e.target.value)
                              }
                              placeholder="0"
                              className="w-full border-none bg-transparent text-left text-[12px] font-bold tabular-nums focus:outline-none"
                              style={{ color: "#4A7C59", borderBottom: "1px dotted transparent" }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderBottomColor = "#2B694D";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderBottomColor = "transparent";
                              }}
                            />
                            {/* Delete */}
                            <button
                              onClick={() => deleteInstallment(inst.id)}
                              className="opacity-0 transition-opacity group-hover:opacity-100"
                              style={{ color: "#5a7a6a" }}
                              title="מחק"
                            >
                              <span className="material-symbols-outlined text-[14px] transition-colors hover:text-red-600">
                                close
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div
                className="py-6 text-center text-[12px] font-semibold"
                style={{ color: "#5a7a6a" }}
              >
                אין עסקאות תשלומים. הוסף עסקה ראשונה.
              </div>
            )}

            {/* Add installment */}
            <button onClick={addInstallment} className="btn btn-secondary btn-sm mt-3">
              <span className="material-symbols-outlined text-[14px]">add</span>
              הוסף עסקת תשלומים
            </button>
          </div>
        )}
      </section>

      {/* Refinance simulator modal — pops on row "savings" icon click. */}
      {refiTrackId &&
        (() => {
          const tr = (mortgage.tracks || []).find((t: MortgageTrack) => t.id === refiTrackId);
          if (!tr) return null;
          return <RefinanceSimulator track={tr} onClose={() => setRefiTrackId(null)} />;
        })()}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KPI Box
   ═══════════════════════════════════════════════════════════ */

function KpiBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="relative flex flex-col gap-1 overflow-hidden rounded-xl p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        background: `linear-gradient(180deg, ${color}0a 0%, #ffffff 55%)`,
        border: `1px solid ${color}22`,
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${color} 0%, ${color}55 100%)` }}
      />
      <div
        className="text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "#5a7a6a" }}
      >
        {label}
      </div>
      <div
        className="text-[22px] font-extrabold tabular-nums leading-tight tracking-tight"
        style={{ color }}
      >
        {value}
      </div>
      <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
        {sub}
      </div>
    </div>
  );
}
