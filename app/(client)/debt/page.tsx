"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { fmtILS } from "@/lib/format";
import {
  loadDebtData as loadDebt,
  saveDebtData as saveDebt,
  type DebtData, type Loan, type Installment,
  type MortgageData, type MortgageTrack,
  type IndexationType, type RepaymentMethod,
} from "@/lib/debt-store";

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

function weightedAvgInterest(tracks: MortgageTrack[]): number {
  const totalBalance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  if (totalBalance <= 0) return 0;
  const weighted = tracks.reduce((s, t) => s + (t.interestRate || 0) * (t.remainingBalance || 0), 0);
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
  const [data, setData] = useState<DebtData>({ loans: [], installments: [] });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [expandedLoans, setExpandedLoans] = useState(true);
  const [expandedInstallments, setExpandedInstallments] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setData(loadDebt()); }, []);

  const autoSave = useCallback((next: DebtData) => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDebt(next);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  }, []);

  const update = useCallback((fn: (prev: DebtData) => DebtData) => {
    setData(prev => {
      const next = fn(prev);
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  /* ── Loan CRUD ── */
  const addLoan = useCallback(() => {
    update(prev => ({
      ...prev,
      loans: [...prev.loans, { id: uid(), lender: "", startDate: "", totalPayments: 0, monthlyPayment: 0 }],
    }));
  }, [update]);

  const updateLoan = useCallback((id: string, field: keyof Loan, value: string | number) => {
    update(prev => ({
      ...prev,
      loans: prev.loans.map(l =>
        l.id === id ? { ...l, [field]: (field === "lender" || field === "startDate") ? value : Number(value) || 0 } : l,
      ),
    }));
  }, [update]);

  const deleteLoan = useCallback((id: string) => {
    update(prev => ({ ...prev, loans: prev.loans.filter(l => l.id !== id) }));
  }, [update]);

  /* ── Installment CRUD ── */
  const addInstallment = useCallback(() => {
    update(prev => ({
      ...prev,
      installments: [...prev.installments, { id: uid(), merchant: "", source: "", currentPayment: 1, totalPayments: 1, monthlyAmount: 0 }],
    }));
  }, [update]);

  const updateInstallment = useCallback((id: string, field: keyof Installment, value: string | number) => {
    update(prev => ({
      ...prev,
      installments: prev.installments.map(inst =>
        inst.id === id ? { ...inst, [field]: (field === "merchant" || field === "source") ? value : Number(value) || 0 } : inst,
      ),
    }));
  }, [update]);

  const deleteInstallment = useCallback((id: string) => {
    update(prev => ({ ...prev, installments: prev.installments.filter(i => i.id !== id) }));
  }, [update]);

  /* ── Mortgage CRUD ── */
  const mortgage = data.mortgage || EMPTY_MORTGAGE;
  const [expandedMortgage, setExpandedMortgage] = useState(true);

  const updateMortgageField = useCallback((field: "bank" | "propertyValue", value: string | number) => {
    update(prev => ({
      ...prev,
      mortgage: {
        ...(prev.mortgage || EMPTY_MORTGAGE),
        [field]: field === "bank" ? value : Number(value) || 0,
      },
    }));
  }, [update]);

  const addMortgageTrack = useCallback(() => {
    update(prev => ({
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

  const updateMortgageTrack = useCallback((id: string, field: keyof MortgageTrack, value: string | number) => {
    update(prev => ({
      ...prev,
      mortgage: {
        ...(prev.mortgage || EMPTY_MORTGAGE),
        tracks: (prev.mortgage?.tracks || []).map(t =>
          t.id === id
            ? {
                ...t,
                [field]: (field === "name" || field === "indexation" || field === "repaymentMethod" || field === "startDate" || field === "endDate")
                  ? value
                  : Number(value) || 0,
              }
            : t,
        ),
      },
    }));
  }, [update]);

  const deleteMortgageTrack = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      mortgage: {
        ...(prev.mortgage || EMPTY_MORTGAGE),
        tracks: (prev.mortgage?.tracks || []).filter(t => t.id !== id),
      },
    }));
  }, [update]);

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
    data.installments.forEach(inst => {
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
      avgInterest: weightedAvgInterest(tracks),
      progress: mortgageOverallProgress(tracks),
      count: tracks.length,
    };
  }, [data.mortgage]);

  const grandMonthly = loanTotals.monthlyTotal + installmentTotals.monthlyTotal + mortgageTotals.monthlyTotal;

  return (
    <div className="max-w-5xl mx-auto">
      {/* ═══ Header ═══ */}
      <header className="mb-6 pb-5 border-b" style={{ borderColor: "#e2e8d8" }}>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-1">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-extrabold mb-1" style={{ color: "#5a7a6a" }}>
              Debt Management
            </div>
            <h1 className="text-[22px] font-extrabold tracking-tight leading-tight" style={{ color: "#012d1d" }}>
              הלוואות ותשלומים
            </h1>
          </div>
          {saveStatus !== "idle" && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{
              color: saveStatus === "saving" ? "#5a7a6a" : "#10b981",
            }}>
              <span className={`material-symbols-outlined text-[14px] ${saveStatus === "saving" ? "animate-pulse" : ""}`}>
                {saveStatus === "saving" ? "cloud_sync" : "cloud_done"}
              </span>
              {saveStatus === "saving" ? "שומר..." : "נשמר"}
            </span>
          )}
        </div>
      </header>

      {/* ═══ KPI Summary ═══ */}
      <section
        className="bg-white rounded-2xl p-5 md:p-7 mb-4"
        style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
      >
        <div className="text-base font-extrabold mb-1" style={{ color: "#012d1d" }}>סיכום חובות חודשי</div>
        <div className="text-[11px] font-semibold mb-4" style={{ color: "#5a7a6a" }}>
          סה&quot;כ תשלומים חודשיים שיורדים מכל המקורות
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
          <KpiBox label="משכנתא חודשי" value={fmtILS(mortgageTotals.monthlyTotal)} sub={`${mortgageTotals.count} מסלולים · ${mortgageTotals.avgInterest.toFixed(2)}% ריבית`} color="#6b21a8" />
          <KpiBox label="החזר הלוואות" value={fmtILS(loanTotals.monthlyTotal)} sub={`${loanTotals.count} הלוואות`} color="#b91c1c" />
          <KpiBox label="תשלומים חודשיים" value={fmtILS(installmentTotals.monthlyTotal)} sub={`${installmentTotals.count} עסקאות`} color="#3b82f6" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiBox label="יתרת משכנתא" value={fmtILS(mortgageTotals.balanceTotal)} sub={`שולם ${(mortgageTotals.progress * 100).toFixed(0)}%`} color="#6b21a8" />
          <KpiBox label="יתרת הלוואות" value={fmtILS(loanTotals.balanceTotal)} sub="סה״כ יתרות" color="#012d1d" />
          <KpiBox
            label="סה״כ חודשי כולל"
            value={fmtILS(grandMonthly)}
            sub="משכנתא + הלוואות + תשלומים"
            color={grandMonthly > 0 ? "#b91c1c" : "#10b981"}
          />
        </div>
      </section>

      {/* ═══ Mortgage Section ═══ */}
      <section
        className="rounded-2xl mb-4 overflow-hidden"
        style={{ background: "#faf5ff", border: "1px solid #e9d5ff", boxShadow: "0 1px 2px rgba(107,33,168,.04), 0 8px 24px rgba(107,33,168,.06)" }}
      >
        <button
          onClick={() => setExpandedMortgage(!expandedMortgage)}
          className="w-full px-5 md:px-7 py-5 flex items-center gap-3 text-right"
          style={{ background: expandedMortgage ? "#f3e8ff" : "transparent" }}
        >
          <span className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ background: "rgba(107,33,168,0.08)", borderRadius: "0.75rem" }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#6b21a8" }}>home</span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>משכנתאות</h2>
            <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
              {mortgageTotals.count} מסלולים · החזר חודשי{" "}
              <span style={{ color: "#6b21a8", fontFamily: "Assistant" }}>{fmtILS(mortgageTotals.monthlyTotal)}</span>
              {mortgageTotals.balanceTotal > 0 && (
                <> · יתרה <span style={{ color: "#6b21a8", fontFamily: "Assistant" }}>{fmtILS(mortgageTotals.balanceTotal)}</span></>
              )}
            </div>
          </div>
          <span className="material-symbols-outlined text-[20px] transition-transform" style={{
            color: "#5a7a6a",
            transform: expandedMortgage ? "rotate(0deg)" : "rotate(-90deg)",
          }}>expand_more</span>
        </button>

        {expandedMortgage && (
          <div className="px-5 md:px-7 pb-5">
            {/* Bank & property info */}
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold" style={{ color: "#6b21a8" }}>בנק:</span>
                <input
                  type="text"
                  value={mortgage.bank}
                  onChange={e => updateMortgageField("bank", e.target.value)}
                  placeholder="שם הבנק"
                  className="bg-transparent border-none text-[13px] font-semibold w-28 focus:outline-none"
                  style={{ color: "#012d1d", borderBottom: "1px dotted #d8b4fe" }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold" style={{ color: "#6b21a8" }}>שווי נכס:</span>
                <input
                  type="number"
                  value={mortgage.propertyValue || ""}
                  onChange={e => updateMortgageField("propertyValue", e.target.value)}
                  placeholder="0"
                  className="bg-transparent border-none text-[13px] font-bold w-24 focus:outline-none tabular-nums"
                  style={{ color: "#012d1d", borderBottom: "1px dotted #d8b4fe", fontFamily: "Assistant" }}
                />
              </div>
              {mortgage.propertyValue > 0 && mortgageTotals.balanceTotal > 0 && (
                <div className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: "#f3e8ff", color: "#6b21a8" }}>
                  LTV {((mortgageTotals.balanceTotal / mortgage.propertyValue) * 100).toFixed(0)}%
                </div>
              )}
            </div>

            {/* Overall progress bar */}
            {mortgageTotals.originalTotal > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold" style={{ color: "#6b21a8" }}>התקדמות כללית</span>
                  <span className="text-[11px] font-extrabold tabular-nums" style={{ color: "#6b21a8", fontFamily: "Assistant" }}>
                    {(mortgageTotals.progress * 100).toFixed(1)}% שולם
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "#e9d5ff" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${mortgageTotals.progress * 100}%`, background: "linear-gradient(90deg, #a855f7, #6b21a8)" }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
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
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "#f3e8ff", color: "#6b21a8" }}>
                  החזר חודשי: {fmtILS(mortgageTotals.monthlyTotal)}
                </div>
                <div className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "#f3e8ff", color: "#6b21a8" }}>
                  ריבית משוקללת: {mortgageTotals.avgInterest.toFixed(2)}%
                </div>
                <div className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "#f3e8ff", color: "#6b21a8" }}>
                  יתרה: {fmtILS(mortgageTotals.balanceTotal)}
                </div>
              </div>
            )}

            {/* Track column headers */}
            <div
              className="grid items-center pb-1 mb-1 text-[9px] font-extrabold uppercase tracking-[0.08em]"
              style={{
                gridTemplateColumns: "minmax(80px,1fr) 56px 56px 68px 68px 64px 52px 24px",
                color: "#7c3aed",
                borderBottom: "1px solid #e9d5ff",
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
            {(mortgage.tracks || []).map(track => {
              const elapsed = mortgageTrackElapsed(track);
              const remaining = mortgageTrackRemaining(track);
              const trackProgress = track.originalAmount > 0
                ? Math.min(1, (track.originalAmount - track.remainingBalance) / track.originalAmount)
                : 0;

              return (
                <div key={track.id}>
                  <div
                    className="grid items-center py-2 group"
                    style={{
                      gridTemplateColumns: "minmax(80px,1fr) 56px 56px 68px 68px 64px 52px 24px",
                      borderBottom: "1px solid #f3e8ff",
                      columnGap: "4px",
                    }}
                  >
                    {/* Track name */}
                    <input
                      type="text"
                      value={track.name}
                      onChange={e => updateMortgageTrack(track.id, "name", e.target.value)}
                      placeholder="פריים / קל״צ..."
                      className="bg-transparent border-none text-[12px] font-semibold w-full focus:outline-none"
                      style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                      onFocus={e => { e.currentTarget.style.borderBottomColor = "#a855f7"; }}
                      onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                    />
                    {/* Interest rate */}
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        step="0.01"
                        value={track.interestRate || ""}
                        onChange={e => updateMortgageTrack(track.id, "interestRate", e.target.value)}
                        placeholder="0"
                        className="bg-transparent border-none text-[12px] font-bold text-left tabular-nums w-full focus:outline-none"
                        style={{ color: "#6b21a8", fontFamily: "Assistant" }}
                      />
                      <span className="text-[10px]" style={{ color: "#9ca3af" }}>%</span>
                    </div>
                    {/* Indexation */}
                    <select
                      value={track.indexation}
                      onChange={e => updateMortgageTrack(track.id, "indexation", e.target.value)}
                      className="bg-transparent border-none text-[10px] font-bold focus:outline-none cursor-pointer"
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
                      onChange={e => updateMortgageTrack(track.id, "originalAmount", e.target.value)}
                      placeholder="0"
                      className="bg-transparent border-none text-[11px] font-bold text-left tabular-nums w-full focus:outline-none"
                      style={{ color: "#012d1d", fontFamily: "Assistant" }}
                    />
                    {/* Remaining balance */}
                    <input
                      type="number"
                      value={track.remainingBalance || ""}
                      onChange={e => updateMortgageTrack(track.id, "remainingBalance", e.target.value)}
                      placeholder="0"
                      className="bg-transparent border-none text-[11px] font-bold text-left tabular-nums w-full focus:outline-none"
                      style={{ color: "#6b21a8", fontFamily: "Assistant" }}
                    />
                    {/* Monthly payment */}
                    <input
                      type="number"
                      value={track.monthlyPayment || ""}
                      onChange={e => updateMortgageTrack(track.id, "monthlyPayment", e.target.value)}
                      placeholder="0"
                      className="bg-transparent border-none text-[11px] font-bold text-left tabular-nums w-full focus:outline-none"
                      style={{ color: "#6b21a8", fontFamily: "Assistant" }}
                    />
                    {/* End date */}
                    <input
                      type="month"
                      value={track.endDate}
                      onChange={e => updateMortgageTrack(track.id, "endDate", e.target.value)}
                      className="bg-transparent border-none text-[10px] font-semibold w-full focus:outline-none"
                      style={{ color: "#5a7a6a" }}
                    />
                    {/* Delete */}
                    <button
                      onClick={() => deleteMortgageTrack(track.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "#5a7a6a" }}
                      title="מחק מסלול"
                    >
                      <span className="material-symbols-outlined text-[14px] hover:text-red-600 transition-colors">close</span>
                    </button>
                  </div>
                  {/* Track progress */}
                  {track.originalAmount > 0 && (
                    <div className="flex items-center gap-2 pb-1 pr-1">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#e9d5ff" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${trackProgress * 100}%`, background: "#a855f7" }}
                        />
                      </div>
                      <span className="text-[9px] font-bold tabular-nums" style={{ color: "#9ca3af", fontFamily: "Assistant" }}>
                        {(trackProgress * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add track */}
            <button
              onClick={addMortgageTrack}
              className="inline-flex items-center gap-1 pt-3 text-[11px] font-bold transition-colors hover:underline"
              style={{ color: "#6b21a8" }}
            >
              <span className="material-symbols-outlined text-[12px]">add</span>
              הוסף מסלול
            </button>
          </div>
        )}
      </section>

      {/* ═══ Loans Section ═══ */}
      <section
        className="bg-white rounded-2xl mb-4 overflow-hidden"
        style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
      >
        <button
          onClick={() => setExpandedLoans(!expandedLoans)}
          className="w-full px-5 md:px-7 py-5 flex items-center gap-3 text-right"
          style={{ background: expandedLoans ? "#fef2f2" : "#fff" }}
        >
          <span className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ background: "rgba(185,28,28,0.08)", borderRadius: "0.75rem" }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#b91c1c" }}>account_balance</span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>הלוואות</h2>
            <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
              {loanTotals.count} הלוואות · החזר חודשי {fmtILS(loanTotals.monthlyTotal)}
            </div>
          </div>
          <span className="material-symbols-outlined text-[20px] transition-transform" style={{
            color: "#5a7a6a",
            transform: expandedLoans ? "rotate(0deg)" : "rotate(-90deg)",
          }}>expand_more</span>
        </button>

        {expandedLoans && (
          <div className="px-5 md:px-7 pb-5">
            {/* Column headers */}
            <div
              className="grid items-center pb-1 mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
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

            {data.loans.map(loan => {
              const elapsed = elapsedMonths(loan.startDate);
              const remain = remainingPayments(loan);
              const balance = remainingBalance(loan);
              const progress = loan.totalPayments > 0 ? Math.min(elapsed / loan.totalPayments, 1) : 0;

              return (
                <div
                  key={loan.id}
                  className="grid items-center py-2 group"
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
                    onChange={e => updateLoan(loan.id, "lender", e.target.value)}
                    placeholder="שם המלווה"
                    className="bg-transparent border-none text-[13px] font-semibold w-full focus:outline-none"
                    style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                    onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                  />
                  {/* Start date */}
                  <input
                    type="month"
                    value={loan.startDate}
                    onChange={e => updateLoan(loan.id, "startDate", e.target.value)}
                    className="bg-transparent border-none text-[12px] font-semibold w-full focus:outline-none"
                    style={{ color: "#012d1d" }}
                  />
                  {/* Total payments */}
                  <input
                    type="number"
                    value={loan.totalPayments || ""}
                    onChange={e => updateLoan(loan.id, "totalPayments", e.target.value)}
                    placeholder="0"
                    className="bg-transparent border-none text-[13px] font-bold text-left tabular-nums w-full focus:outline-none"
                    style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                    onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                  />
                  {/* Monthly payment */}
                  <input
                    type="number"
                    value={loan.monthlyPayment || ""}
                    onChange={e => updateLoan(loan.id, "monthlyPayment", e.target.value)}
                    placeholder="0"
                    className="bg-transparent border-none text-[13px] font-bold text-left tabular-nums w-full focus:outline-none"
                    style={{ color: "#b91c1c", borderBottom: "1px dotted transparent" }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                    onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                  />
                  {/* Counter */}
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[11px] font-bold tabular-nums" style={{ color: "#012d1d" }}>
                      {loan.startDate ? `${elapsed} מתוך ${loan.totalPayments}` : "—"}
                    </div>
                    {loan.totalPayments > 0 && (
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${progress * 100}%`, background: progress >= 1 ? "#10b981" : "#b91c1c" }}
                        />
                      </div>
                    )}
                  </div>
                  {/* Remaining balance */}
                  <div className="text-[13px] font-extrabold text-left tabular-nums" style={{ color: balance > 0 ? "#b91c1c" : "#10b981" }}>
                    {loan.startDate ? fmtILS(balance) : "—"}
                  </div>
                  {/* Delete */}
                  <button
                    onClick={() => deleteLoan(loan.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#5a7a6a" }}
                    title="מחק"
                  >
                    <span className="material-symbols-outlined text-[14px] hover:text-red-600 transition-colors">close</span>
                  </button>
                </div>
              );
            })}

            {/* Add loan */}
            <button
              onClick={addLoan}
              className="inline-flex items-center gap-1 pt-3 text-[11px] font-bold transition-colors hover:underline"
              style={{ color: "#0a7a4a" }}
            >
              <span className="material-symbols-outlined text-[12px]">add</span>
              הוסף הלוואה
            </button>
          </div>
        )}
      </section>

      {/* ═══ Installments Section ═══ */}
      <section
        className="bg-white rounded-2xl mb-4 overflow-hidden"
        style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
      >
        <button
          onClick={() => setExpandedInstallments(!expandedInstallments)}
          className="w-full px-5 md:px-7 py-5 flex items-center gap-3 text-right"
          style={{ background: expandedInstallments ? "#eff6ff" : "#fff" }}
        >
          <span className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.08)", borderRadius: "0.75rem" }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#3b82f6" }}>credit_score</span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>עסקאות תשלומים</h2>
            <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
              {installmentTotals.count} עסקאות · חיוב חודשי {fmtILS(installmentTotals.monthlyTotal)}
            </div>
          </div>
          <span className="material-symbols-outlined text-[20px] transition-transform" style={{
            color: "#5a7a6a",
            transform: expandedInstallments ? "rotate(0deg)" : "rotate(-90deg)",
          }}>expand_more</span>
        </button>

        {expandedInstallments && (
          <div className="px-5 md:px-7 pb-5">
            {/* Grouped by source */}
            {Object.keys(installmentsBySource).length > 0 ? (
              Object.entries(installmentsBySource).map(([source, items]) => {
                const sourceTotal = items.reduce((s, i) => s + (i.monthlyAmount || 0), 0);
                const isOpen = expandedSources[source] ?? true;

                return (
                  <div key={source} className="mb-3">
                    {/* Source header */}
                    <button
                      onClick={() => setExpandedSources(prev => ({ ...prev, [source]: !isOpen }))}
                      className="w-full flex items-center gap-2 py-2 text-right"
                      style={{ borderBottom: "1px solid #eef2e8" }}
                    >
                      <span className="material-symbols-outlined text-[14px]" style={{ color: "#3b82f6" }}>credit_card</span>
                      <span className="flex-1 text-[13px] font-bold" style={{ color: "#012d1d" }}>{source}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: "#eff6ff", color: "#3b82f6" }}>
                        {items.length} עסקאות · {fmtILS(sourceTotal)}
                      </span>
                      <span className="material-symbols-outlined text-[16px] transition-transform" style={{
                        color: "#5a7a6a",
                        transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      }}>expand_more</span>
                    </button>

                    {isOpen && (
                      <div className="mr-4 mt-1">
                        {/* Sub-header */}
                        <div
                          className="grid items-center pb-1 mb-1 text-[9px] font-extrabold uppercase tracking-[0.08em]"
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

                        {items.map(inst => (
                          <div
                            key={inst.id}
                            className="grid items-center py-1.5 group"
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
                              onChange={e => updateInstallment(inst.id, "merchant", e.target.value)}
                              placeholder="שם בית עסק"
                              className="bg-transparent border-none text-[12px] font-semibold w-full focus:outline-none"
                              style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                              onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                              onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                            />
                            {/* Source */}
                            <input
                              type="text"
                              value={inst.source}
                              onChange={e => updateInstallment(inst.id, "source", e.target.value)}
                              placeholder="כרטיס / בנק"
                              className="bg-transparent border-none text-[12px] font-semibold w-full focus:outline-none"
                              style={{ color: "#5a7a6a", borderBottom: "1px dotted transparent" }}
                              onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                              onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                            />
                            {/* Payment counter */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={inst.currentPayment || ""}
                                onChange={e => updateInstallment(inst.id, "currentPayment", e.target.value)}
                                className="bg-transparent border-none text-[12px] font-bold text-left tabular-nums w-8 focus:outline-none"
                                style={{ color: "#012d1d" }}
                              />
                              <span className="text-[11px]" style={{ color: "#5a7a6a" }}>/</span>
                              <input
                                type="number"
                                value={inst.totalPayments || ""}
                                onChange={e => updateInstallment(inst.id, "totalPayments", e.target.value)}
                                className="bg-transparent border-none text-[12px] font-bold text-left tabular-nums w-8 focus:outline-none"
                                style={{ color: "#012d1d" }}
                              />
                            </div>
                            {/* Monthly amount */}
                            <input
                              type="number"
                              value={inst.monthlyAmount || ""}
                              onChange={e => updateInstallment(inst.id, "monthlyAmount", e.target.value)}
                              placeholder="0"
                              className="bg-transparent border-none text-[12px] font-bold text-left tabular-nums w-full focus:outline-none"
                              style={{ color: "#3b82f6", borderBottom: "1px dotted transparent" }}
                              onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                              onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                            />
                            {/* Delete */}
                            <button
                              onClick={() => deleteInstallment(inst.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: "#5a7a6a" }}
                              title="מחק"
                            >
                              <span className="material-symbols-outlined text-[14px] hover:text-red-600 transition-colors">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-[12px] font-semibold" style={{ color: "#5a7a6a" }}>
                אין עסקאות תשלומים. הוסף עסקה ראשונה.
              </div>
            )}

            {/* Add installment */}
            <button
              onClick={addInstallment}
              className="inline-flex items-center gap-1 pt-3 text-[11px] font-bold transition-colors hover:underline"
              style={{ color: "#0a7a4a" }}
            >
              <span className="material-symbols-outlined text-[12px]">add</span>
              הוסף עסקת תשלומים
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KPI Box
   ═══════════════════════════════════════════════════════════ */

function KpiBox({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "#5a7a6a" }}>{label}</div>
      <div className="text-[22px] font-extrabold tracking-tight leading-tight tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>{sub}</div>
    </div>
  );
}
