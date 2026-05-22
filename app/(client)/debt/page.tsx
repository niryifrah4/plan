"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { fmtILS } from "@/lib/format";
import {
  loadDebtData as loadDebt,
  saveDebtData as saveDebt,
  effectiveTrackRate,
  trackCpiRate,
  type DebtData,
  type Loan,
  type Installment,
  type MortgageData,
  type MortgageTrack,
} from "@/lib/debt-store";
import { projectIndexedLoan, effectiveNominalRate } from "@shared/financial-math";
import { RefinanceSimulator } from "@/components/debt/RefinanceSimulator";
import { RefinanceAlerts } from "@/components/debt/RefinanceAlerts";
import { FullRefinanceSimulator } from "@/components/debt/FullRefinanceSimulator";
import { PayoffSimulator } from "@/components/debt/PayoffSimulator";
import { AmortizationUpload } from "@/components/debt/AmortizationUpload";
import { type IndexationType, type RepaymentMethod } from "@/lib/debt-store";
import { useAssumptions } from "@/lib/hooks/useAssumptions";
import { getMonthlyNetIncome } from "@/lib/income";
import { SolidKpi } from "@/components/ui/SolidKpi";
import { useConfirm } from "@/components/ui/ConfirmModal";
import {
  loadProperties,
  type Property,
  EVENT_NAME as RE_EVENT,
} from "@/lib/realestate-store";

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

const uidMortgage = () => "mtg_" + Math.random().toString(36).slice(2, 9);

function emptyMortgage(): MortgageData {
  return {
    id: uidMortgage(),
    bank: "",
    propertyValue: 0,
    tracks: [],
  };
}

/* ═══════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function DebtPage() {
  const assumptions = useAssumptions();
  const { confirm, modal: confirmModal } = useConfirm();
  // All rates in this module are stored as DECIMAL fractions (0.048 = 4.8%).
  // The UI converts to/from percent at the input boundary only.
  // 2026-05-19 Phase 1: unified scale across debt-store, simulators, KPIs.
  const primeRate = assumptions.primeRate;
  const [data, setData] = useState<DebtData>({ loans: [], installments: [], mortgages: [] });
  // Refinance simulator modal — holds the track ID being simulated.
  const [refiTrackId, setRefiTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [expandedLoans, setExpandedLoans] = useState(true);
  const [expandedInstallments, setExpandedInstallments] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Properties — populates the "שייך משכנתא לנכס" dropdown on each mortgage.
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    setData(loadDebt());
    setProperties(loadProperties());
    const onPropChange = () => setProperties(loadProperties());
    window.addEventListener(RE_EVENT, onPropChange);
    window.addEventListener("storage", onPropChange);
    return () => {
      window.removeEventListener(RE_EVENT, onPropChange);
      window.removeEventListener("storage", onPropChange);
    };
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
        loans: prev.loans.map((l) => {
          if (l.id !== id) return l;
          // Lender / start date: pass through as string.
          if (field === "lender" || field === "startDate") {
            return { ...l, [field]: value };
          }
          // Interest rate: undefined means "not set" (vs. 0% which is rare).
          // An empty input clears the field rather than defaulting to 0.
          if (field === "interestRate") {
            const trimmed = String(value).trim();
            if (!trimmed) {
              const { interestRate, ...rest } = l;
              void interestRate;
              return rest;
            }
            const num = Number(trimmed);
            return { ...l, interestRate: Number.isFinite(num) ? num : undefined };
          }
          return { ...l, [field]: Number(value) || 0 };
        }),
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

  /* ── Mortgage CRUD (multi-mortgage model, since 2026-05-18) ──
   * A household can now own multiple mortgages — one per property. Each
   * mortgage has its own bank, propertyValue, and tracks; all CRUD helpers
   * take a `mortgageId` to know which mortgage to mutate. */
  const mortgages = data.mortgages;
  const [expandedMortgageIds, setExpandedMortgageIds] = useState<Record<string, boolean>>({});

  const addMortgage = useCallback(() => {
    update((prev) => {
      const fresh = emptyMortgage();
      setExpandedMortgageIds((cur) => ({ ...cur, [fresh.id]: true }));
      return { ...prev, mortgages: [...prev.mortgages, fresh] };
    });
  }, [update]);

  const deleteMortgage = useCallback(
    (mortgageId: string) => {
      update((prev) => ({
        ...prev,
        mortgages: prev.mortgages.filter((m) => m.id !== mortgageId),
      }));
    },
    [update]
  );

  const updateMortgageField = useCallback(
    (mortgageId: string, field: "bank" | "propertyValue" | "propertyId", value: string | number) => {
      update((prev) => ({
        ...prev,
        mortgages: prev.mortgages.map((m) =>
          m.id !== mortgageId
            ? m
            : {
                ...m,
                [field]:
                  field === "bank" || field === "propertyId"
                    ? value
                    : Number(value) || 0,
              }
        ),
      }));
    },
    [update]
  );

  const addMortgageTrack = useCallback(
    (mortgageId: string) => {
      update((prev) => ({
        ...prev,
        mortgages: prev.mortgages.map((m) =>
          m.id !== mortgageId
            ? m
            : {
                ...m,
                tracks: [
                  ...m.tracks,
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
              }
        ),
      }));
    },
    [update]
  );

  const updateMortgageTrack = useCallback(
    (mortgageId: string, trackId: string, field: keyof MortgageTrack, value: string | number) => {
      update((prev) => ({
        ...prev,
        mortgages: prev.mortgages.map((m) =>
          m.id !== mortgageId
            ? m
            : {
                ...m,
                tracks: m.tracks.map((t) =>
                  t.id === trackId
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
              }
        ),
      }));
    },
    [update]
  );

  const deleteMortgageTrack = useCallback(
    (mortgageId: string, trackId: string) => {
      update((prev) => ({
        ...prev,
        mortgages: prev.mortgages.map((m) =>
          m.id !== mortgageId
            ? m
            : { ...m, tracks: m.tracks.filter((t) => t.id !== trackId) }
        ),
      }));
    },
    [update]
  );

  /** Merge parsed-from-PDF tracks into a specific mortgage. Phase 4: the
   *  upload UI delivers a confirmed list; we append to existing tracks so the
   *  planner can run multiple uploads (e.g. two separate mortgage statements).
   *  Empty IDs get a fresh one defensively. */
  const addParsedTracksToMortgage = useCallback(
    (mortgageId: string, parsed: MortgageTrack[]) => {
      if (!parsed.length) return;
      update((prev) => ({
        ...prev,
        mortgages: prev.mortgages.map((m) =>
          m.id !== mortgageId
            ? m
            : {
                ...m,
                tracks: [
                  ...m.tracks,
                  ...parsed.map((t) => ({ ...t, id: t.id || uid() })),
                ],
              }
        ),
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
    // Aggregate across ALL mortgages (multi-mortgage model).
    const tracks = mortgages.flatMap((m) => m.tracks);

    // Total interest the family will still pay across the remaining life
    // of all tracks. 2026-05-05 per finance-agent: shows the "true cost" of
    // the mortgage and motivates accelerated payoff.
    // 2026-05-19 Phase 1: decimal rate standard, effectiveTrackRate so Prime
    // tracks count.
    // 2026-05-21 Phase 3: indexation-aware via projectIndexedLoan — CPI-linked
    // ("מדד") tracks now compound the balance + payment monthly with the
    // user's inflation assumption. Non-indexed tracks fall back to the
    // closed-form solver. Result: an indexed mortgage of ₪600k @ 2.5% real
    // for 25 yrs no longer reports ~₪215k interest; it correctly reports
    // ~₪440k nominal cost (with 2.5% CPI).
    let interestRemaining = 0;
    for (const t of tracks) {
      const balance = t.remainingBalance || 0;
      const monthly = t.monthlyPayment || 0;
      if (!balance || !monthly) continue;
      const rate = effectiveTrackRate(t, primeRate) || 0.05;
      const cpi = trackCpiRate(t, assumptions.inflationRate);
      const projection = projectIndexedLoan(balance, monthly, rate, cpi);
      interestRemaining += projection.totalInterestNominal;
    }

    return {
      monthlyTotal: mortgageTotalMonthly(tracks),
      balanceTotal: mortgageTotalBalance(tracks),
      originalTotal: mortgageTotalOriginal(tracks),
      avgInterest: weightedAvgInterest(tracks, primeRate),
      progress: mortgageOverallProgress(tracks),
      interestRemaining,
      tracksCount: tracks.length,
      mortgagesCount: mortgages.length,
      // backward-compat alias used by a couple of KPI lines below
      count: tracks.length,
    };
  }, [mortgages, primeRate]);

  const grandMonthly =
    loanTotals.monthlyTotal + installmentTotals.monthlyTotal + mortgageTotals.monthlyTotal;

  // Debt-to-income (DTI). Uses NET monthly income (single source of truth in
  // lib/income.ts). 2026-05-05 per finance-agent: a 6th KPI banks track
  // tightly — under 30% healthy, 30–40% caution, over 40% critical. Without
  // this number, every other figure on the page is in a vacuum.
  const monthlyNetIncome = typeof window !== "undefined" ? getMonthlyNetIncome() : 0;
  const dti = monthlyNetIncome > 0 ? grandMonthly / monthlyNetIncome : 0;
  const dtiTone: "emerald" | "amber" | "red" =
    dti < 0.3 ? "emerald" : dti < 0.4 ? "amber" : "red";
  const dtiSub =
    monthlyNetIncome === 0
      ? "הזן הכנסה כדי לראות"
      : dti < 0.3
        ? "תקין · מתחת ל-30%"
        : dti < 0.4
          ? "זהירות · 30-40%"
          : "קריטי · מעל 40%";

  return (
    <div className="mx-auto max-w-5xl py-4 md:py-8">
      {confirmModal}
      {/* ═══ Header ═══ */}
      <header className="mb-6 border-b pb-5" style={{ borderColor: "#E5E7EB" }}>
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div
              className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em]"
              style={{ color: "#6B7280" }}
            >
              ניהול חובות
            </div>
            <h1
              className="text-[22px] font-extrabold leading-tight tracking-tight"
              style={{ color: "#1A1A1A" }}
            >
              הלוואות ותשלומים
            </h1>
          </div>
          {saveStatus !== "idle" && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold"
              style={{
                color: saveStatus === "saving" ? "#6B7280" : "#059669",
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

      {/* ═══ KPI Summary ═══
          2026-05-05 visual-cleanup: dropped the first row (per-source monthly).
          Each section header below already shows its own monthly total — having
          the same number twice was visual noise. Kept the totals row plus DTI.
          From 7 KPIs down to 4, with the most actionable ones (total monthly,
          DTI, mortgage progress, mortgage interest remaining) front-and-center. */}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SolidKpi
          label="סה״כ חודשי"
          value={fmtILS(grandMonthly)}
          icon="paid"
          tone={grandMonthly > 0 ? "red" : "emerald"}
          sub={
            grandMonthly > 0
              ? `${mortgageTotals.count + loanTotals.count + installmentTotals.count} פריטים`
              : undefined
          }
        />
        <SolidKpi
          label="יחס חוב להכנסה (DTI)"
          value={monthlyNetIncome > 0 ? `${(dti * 100).toFixed(0)}%` : "—"}
          icon="balance"
          tone={dtiTone}
          sub={dtiSub}
          title={
            "DTI = סך החזר חודשי על חובות ÷ הכנסה חודשית נטו.\n" +
            "פחות מ-30% — מצב בריא.\n" +
            "30%-40% — זהירות, פחות מקום לאירועים בלתי-צפויים.\n" +
            "מעל 40% — מצב לחוץ; בנקים יסרבו אשראי נוסף."
          }
        />
        <SolidKpi
          label="יתרת משכנתא"
          value={fmtILS(mortgageTotals.balanceTotal)}
          icon="account_balance"
          tone="forest"
          sub={
            mortgageTotals.balanceTotal > 0
              ? `שולם ${(mortgageTotals.progress * 100).toFixed(0)}%`
              : undefined
          }
        />
        <SolidKpi
          label="יתרת הלוואות"
          value={fmtILS(loanTotals.balanceTotal + installmentTotals.monthlyTotal * 0)}
          icon="receipt_long"
          tone="ink"
          sub={
            loanTotals.count + installmentTotals.count > 0
              ? `${loanTotals.count + installmentTotals.count} פעילות`
              : undefined
          }
        />
      </section>

      {/* ═══ Refinance Alerts (since 2026-05-18) ═══
          Proactive signals: variable-rate change points, prime-margin gaps,
          and market-rate gaps with payback < 18 months. Hidden when empty. */}
      <RefinanceAlerts onOpenSimulator={(trackId) => setRefiTrackId(trackId)} />

      {/* ═══ Mortgages Section (multi-mortgage, since 2026-05-18) ═══
          Each mortgage = its own card, with a property dropdown so the user
          links it to a specific Property from /realestate. */}
      <section
        className="mb-5 overflow-hidden rounded-2xl bg-[#FFFFFF]"
        style={{ border: "1px solid #FAFAF7", boxShadow: "none" }}
      >
        {/* Aggregate header */}
        <div
          className="flex items-center gap-3 px-5 py-5 md:px-7"
          style={{ background: "#FAFAF7" }}
        >
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
            style={{ background: "#FFFFFF", borderRadius: "0.75rem" }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#2C7A5A" }}>
              home
            </span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#1A1A1A" }}>
              משכנתאות
            </h2>
            <div className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
              {mortgageTotals.mortgagesCount > 0
                ? `${mortgageTotals.mortgagesCount} משכנתאות · ${mortgageTotals.tracksCount} מסלולים`
                : "אין משכנתאות"}
              {mortgageTotals.monthlyTotal > 0 && (
                <>
                  {" · החזר חודשי "}
                  <span style={{ color: "#2C7A5A", fontFamily: "inherit" }}>
                    {fmtILS(mortgageTotals.monthlyTotal)}
                  </span>
                </>
              )}
              {mortgageTotals.balanceTotal > 0 && (
                <>
                  {" · יתרה "}
                  <span style={{ color: "#2C7A5A", fontFamily: "inherit" }}>
                    {fmtILS(mortgageTotals.balanceTotal)}
                  </span>
                </>
              )}
              {mortgageTotals.interestRemaining > 0 && (
                <>
                  {" · ריבית צפויה לתשלום "}
                  <span style={{ color: "#DC2626", fontFamily: "inherit" }}>
                    {fmtILS(mortgageTotals.interestRemaining)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Empty state — first-time users */}
        {mortgages.length === 0 && (
          <div className="px-5 pb-7 pt-5 text-center md:px-7">
            <span className="material-symbols-outlined text-[40px]" style={{ color: "#6B7280" }}>
              home
            </span>
            <h3 className="mt-2 text-sm font-extrabold" style={{ color: "#1A1A1A" }}>
              אין משכנתאות רשומות
            </h3>
            <p
              className="mx-auto mb-3 mt-1 max-w-xs text-[11px] leading-relaxed"
              style={{ color: "#6B7280" }}
            >
              לכל נכס שיש לו משכנתא — הוסף משכנתא משלו עם המסלולים, הריביות והיתרות.
            </p>
            <button onClick={addMortgage} className="btn btn-secondary btn-sm">
              <span className="material-symbols-outlined text-[14px]">add</span>
              הוסף משכנתא
            </button>
          </div>
        )}

        {/* Per-mortgage cards */}
        {mortgages.map((mortgage) => {
          const isOpen = expandedMortgageIds[mortgage.id] ?? true;
          const m_tracks = mortgage.tracks || [];
          const m_monthly = m_tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
          const m_balance = m_tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
          const m_original = m_tracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
          const m_progress = m_original > 0 ? (m_original - m_balance) / m_original : 0;
          const linkedProperty = mortgage.propertyId
            ? properties.find((p) => p.id === mortgage.propertyId)
            : undefined;

          return (
            <article
              key={mortgage.id}
              className="border-t"
              style={{ borderColor: "#FAFAF7" }}
            >
              {/* Mortgage card header */}
              <div
                className="flex items-start gap-3 px-5 py-4 md:px-7"
                style={{ background: "#FFFFFF" }}
              >
                <button
                  onClick={() =>
                    setExpandedMortgageIds((cur) => ({
                      ...cur,
                      [mortgage.id]: !isOpen,
                    }))
                  }
                  className="mt-1 rounded-lg p-1 hover:bg-[#FAFAF7]"
                  title={isOpen ? "סגור" : "פתח"}
                >
                  <span
                    className="material-symbols-outlined text-[18px] transition-transform"
                    style={{
                      color: "#6B7280",
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                  >
                    expand_more
                  </span>
                </button>
                <div className="flex-1">
                  {/* Bank name + property dropdown */}
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={mortgage.bank}
                      onChange={(e) =>
                        updateMortgageField(mortgage.id, "bank", e.target.value)
                      }
                      placeholder="שם הבנק"
                      className="border-none bg-transparent text-[15px] font-extrabold focus:outline-none"
                      style={{
                        color: "#1A1A1A",
                        borderBottom: "1px dotted transparent",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderBottomColor = "#059669";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderBottomColor = "transparent";
                      }}
                    />
                    {/* Property linker — central to the new model */}
                    <div
                      className="flex items-center gap-2 rounded-full px-3 py-1.5"
                      style={{
                        background: linkedProperty ? "#FAFAF7" : "rgba(180, 83, 9, 0.12)",
                        border: linkedProperty
                          ? "1px solid #E5E7EB"
                          : "1px solid rgba(180, 83, 9, 0.4)",
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{
                          color: linkedProperty ? "#2C7A5A" : "#B45309",
                        }}
                      >
                        {linkedProperty ? "link" : "link_off"}
                      </span>
                      <select
                        value={mortgage.propertyId || ""}
                        onChange={(e) =>
                          updateMortgageField(mortgage.id, "propertyId", e.target.value)
                        }
                        className="cursor-pointer border-none bg-transparent text-[12px] font-bold focus:outline-none"
                        style={{
                          color: linkedProperty ? "#FFFFFF" : "#B45309",
                        }}
                        title="שייך משכנתא זו לנכס מ-/realestate"
                      >
                        <option value="">לא משויך לנכס — בחר</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.city ? ` · ${p.city}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* LTV badge — uses linked property's currentValue when available */}
                    {(() => {
                      const valueForLtv = linkedProperty?.currentValue || mortgage.propertyValue;
                      if (!valueForLtv || !m_balance) return null;
                      const ltv = (m_balance / valueForLtv) * 100;
                      const source = linkedProperty
                        ? "מבוסס על שווי הנכס המקושר"
                        : 'מבוסס על שדה "שווי נכס" מקומי';
                      return (
                        <div
                          className="rounded-full px-3 py-1.5 text-[11px] font-extrabold"
                          style={{ background: "#FAFAF7", color: "#2C7A5A" }}
                          title={
                            `LTV = יתרת המשכנתא ÷ שווי הנכס × 100. ${source}.\n` +
                            "פחות מ-60% — מצב טוב, יותר מקום למשכנתא נוספת.\n" +
                            "60%-75% — נורמלי לרוב משקי הבית.\n" +
                            "מעל 75% — מקסימום במשכנתא ראשונה, עלולה להוריד את התנאים."
                          }
                        >
                          LTV {ltv.toFixed(0)}%
                        </div>
                      );
                    })()}
                  </div>
                  {/* Mortgage micro-summary */}
                  <div className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
                    {m_tracks.length} מסלולים
                    {m_monthly > 0 && (
                      <>
                        {" · "}
                        <span style={{ color: "#2C7A5A", fontFamily: "inherit" }}>
                          {fmtILS(m_monthly)}
                        </span>
                        {" /חודש"}
                      </>
                    )}
                    {m_balance > 0 && (
                      <>
                        {" · יתרה "}
                        <span style={{ color: "#2C7A5A", fontFamily: "inherit" }}>
                          {fmtILS(m_balance)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {/* Delete mortgage button */}
                <button
                  onClick={async () => {
                    if (m_tracks.length > 0) {
                      const ok = await confirm({
                        title: `למחוק את המשכנתא של ${mortgage.bank || "בנק זה"}?`,
                        body: "כל המסלולים יימחקו. פעולה זו אינה הפיכה.",
                        confirmLabel: "כן, מחק",
                        cancelLabel: "ביטול",
                        variant: "danger",
                      });
                      if (!ok) return;
                    }
                    deleteMortgage(mortgage.id);
                  }}
                  className="rounded-lg p-1 hover:bg-red-50"
                  style={{ color: "#6B7280" }}
                  title="מחק משכנתא"
                >
                  <span className="material-symbols-outlined text-[16px] hover:text-red-600">
                    delete
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 md:px-7">
                  {/* Mortgage's own propertyValue input — kept for backward compat;
                      surfaces when no linked property is selected. */}
                  {!linkedProperty && (
                    <div className="mb-4">
                      <label
                        className="mb-1 block text-[11px] font-bold"
                        style={{ color: "#6B7280" }}
                      >
                        שווי נכס (לצורך LTV, אם לא משויך לנכס)
                      </label>
                      <input
                        type="number"
                        value={mortgage.propertyValue || ""}
                        onChange={(e) =>
                          updateMortgageField(mortgage.id, "propertyValue", e.target.value)
                        }
                        placeholder="0"
                        className="rounded-lg border bg-transparent px-3 py-1.5 text-[13px] font-bold tabular-nums focus:outline-none"
                        style={{
                          color: "#1A1A1A",
                          borderColor: "#E5E7EB",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>
                  )}

                  {/* Mortgage progress bar */}
                  {m_original > 0 && (
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold" style={{ color: "#2C7A5A" }}>
                          התקדמות
                        </span>
                        <span
                          className="text-[11px] font-extrabold tabular-nums"
                          style={{ color: "#2C7A5A", fontFamily: "inherit" }}
                        >
                          {(m_progress * 100).toFixed(1)}% שולם
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full"
                        style={{ background: "#FAFAF7" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${m_progress * 100}%`,
                            background: "linear-gradient(90deg, #059669, #2C7A5A)",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Track column headers — 2026-05-18 visual cleanup:
                      bigger fonts, dropped uppercase (broken in Hebrew),
                      wider columns for breathing room. */}
                  {m_tracks.length > 0 && (
                    <div
                      className="mb-2 grid items-center pb-2 text-[12px] font-extrabold"
                      style={{
                        gridTemplateColumns:
                          "minmax(110px,1.3fr) 84px 84px 110px 110px 110px 92px 56px",
                        color: "#2C7A5A",
                        borderBottom: "1px solid #FAFAF7",
                        columnGap: "10px",
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
                  )}

                  {/* Track rows — bigger fonts, more space, clearer hierarchy */}
                  {m_tracks.map((track) => {
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
                          className="group grid items-center py-3"
                          style={{
                            gridTemplateColumns:
                              "minmax(110px,1.3fr) 84px 84px 110px 110px 110px 92px 56px",
                            borderBottom: "1px solid #FAFAF7",
                            columnGap: "10px",
                          }}
                        >
                          {/* Track name — bumped to 14px, primary hierarchy */}
                          <input
                            type="text"
                            value={track.name}
                            onChange={(e) =>
                              updateMortgageTrack(mortgage.id, track.id, "name", e.target.value)
                            }
                            placeholder="פריים / קל״צ..."
                            className="w-full border-none bg-transparent text-[14px] font-bold focus:outline-none"
                            style={{
                              color: "#1A1A1A",
                              borderBottom: "1px dotted transparent",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderBottomColor = "#059669";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderBottomColor = "transparent";
                            }}
                          />
                          {/* Interest rate — 14px, prominent.
                              Rates are stored as DECIMAL (0.048) in the model
                              but typed/displayed as PERCENT (4.8) in the UI.
                              2026-05-21 Phase 3: tooltip surfaces effective
                              nominal rate for CPI-linked tracks so a "low"
                              stated 2.5% indexed rate is shown alongside its
                              real-world ~5% nominal equivalent. */}
                          <div
                            className="flex items-center gap-0.5"
                            title={(() => {
                              const realRate = effectiveTrackRate(track, primeRate);
                              const cpi = trackCpiRate(track, assumptions.inflationRate);
                              const effNominal = effectiveNominalRate(realRate, cpi);
                              const lines: string[] = [];
                              if (typeof track.margin === "number") {
                                lines.push(
                                  `פריים (${(primeRate * 100).toFixed(2)}%) + ${(track.margin * 100).toFixed(2)}%`
                                );
                              }
                              if (cpi > 0) {
                                lines.push(
                                  `ריבית נקובה: ${(realRate * 100).toFixed(2)}%`,
                                  `מדד צפוי: ${(cpi * 100).toFixed(1)}%`,
                                  `ריבית אפקטיבית (כולל מדד): ${(effNominal * 100).toFixed(2)}%`
                                );
                              }
                              return lines.join("\n");
                            })()}
                          >
                            <input
                              type="number"
                              step="0.01"
                              value={
                                typeof track.margin === "number"
                                  ? (effectiveTrackRate(track, primeRate) * 100).toFixed(2)
                                  : track.interestRate
                                    ? (track.interestRate * 100).toFixed(2)
                                    : ""
                              }
                              onChange={(e) => {
                                const pct = parseFloat(e.target.value);
                                updateMortgageTrack(
                                  mortgage.id,
                                  track.id,
                                  "interestRate",
                                  Number.isFinite(pct) ? String(pct / 100) : ""
                                );
                              }}
                              readOnly={typeof track.margin === "number"}
                              placeholder="0"
                              className="w-full border-none bg-transparent text-left text-[14px] font-extrabold tabular-nums focus:outline-none"
                              style={{ color: "#2C7A5A", fontFamily: "inherit" }}
                            />
                            <span className="text-[11px]" style={{ color: "#9ca3af" }}>
                              %
                            </span>
                          </div>
                          {/* Indexation — 12px, was 10 */}
                          <select
                            value={track.indexation}
                            onChange={(e) =>
                              updateMortgageTrack(
                                mortgage.id,
                                track.id,
                                "indexation",
                                e.target.value
                              )
                            }
                            className="cursor-pointer border-none bg-transparent text-[12px] font-bold focus:outline-none"
                            style={{ color: "#6B7280" }}
                          >
                            <option value="לא צמוד">לא צמוד</option>
                            <option value="מדד">מדד</option>
                            <option value="דולר">דולר</option>
                            <option value="אחר">אחר</option>
                          </select>
                          {/* Original amount — 13px */}
                          <input
                            type="number"
                            value={track.originalAmount || ""}
                            onChange={(e) =>
                              updateMortgageTrack(
                                mortgage.id,
                                track.id,
                                "originalAmount",
                                e.target.value
                              )
                            }
                            placeholder="0"
                            className="w-full border-none bg-transparent text-left text-[13px] font-bold tabular-nums focus:outline-none"
                            style={{ color: "#1A1A1A", fontFamily: "inherit" }}
                          />
                          {/* Remaining balance — 13px */}
                          <input
                            type="number"
                            value={track.remainingBalance || ""}
                            onChange={(e) =>
                              updateMortgageTrack(
                                mortgage.id,
                                track.id,
                                "remainingBalance",
                                e.target.value
                              )
                            }
                            placeholder="0"
                            className="w-full border-none bg-transparent text-left text-[13px] font-extrabold tabular-nums focus:outline-none"
                            style={{ color: "#2C7A5A", fontFamily: "inherit" }}
                          />
                          {/* Monthly payment — 13px */}
                          <input
                            type="number"
                            value={track.monthlyPayment || ""}
                            onChange={(e) =>
                              updateMortgageTrack(
                                mortgage.id,
                                track.id,
                                "monthlyPayment",
                                e.target.value
                              )
                            }
                            placeholder="0"
                            className="w-full border-none bg-transparent text-left text-[13px] font-extrabold tabular-nums focus:outline-none"
                            style={{ color: "#2C7A5A", fontFamily: "inherit" }}
                          />
                          {/* End date — 12px */}
                          <input
                            type="month"
                            value={track.endDate}
                            onChange={(e) =>
                              updateMortgageTrack(
                                mortgage.id,
                                track.id,
                                "endDate",
                                e.target.value
                              )
                            }
                            className="w-full border-none bg-transparent text-[12px] font-semibold focus:outline-none"
                            style={{ color: "#6B7280" }}
                          />
                          {/* Refi simulator + Delete — both visible at 18px */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setRefiTrackId(track.id)}
                              className="rounded p-1 hover:bg-[#FAFAF7]"
                              style={{ color: "#2C7A5A" }}
                              title="סימולציית מיחזור / פירעון מואץ"
                            >
                              <span className="material-symbols-outlined text-[18px] transition-colors hover:text-verdant-emerald">
                                savings
                              </span>
                            </button>
                            <button
                              onClick={() => deleteMortgageTrack(mortgage.id, track.id)}
                              className="rounded p-1 opacity-100 transition-opacity hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100"
                              style={{ color: "#6B7280" }}
                              title="מחק מסלול"
                            >
                              <span className="material-symbols-outlined text-[16px] transition-colors hover:text-red-600">
                                close
                              </span>
                            </button>
                          </div>
                        </div>
                        {/* Track progress bar */}
                        {track.originalAmount > 0 && (
                          <div className="flex items-center gap-2 pb-2 pr-1">
                            <div
                              className="h-1.5 flex-1 overflow-hidden rounded-full"
                              style={{ background: "#FAFAF7" }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${trackProgress * 100}%`,
                                  background: "#059669",
                                }}
                              />
                            </div>
                            <span
                              className="text-[12px] font-bold tabular-nums"
                              style={{ color: "#9ca3af", fontFamily: "inherit" }}
                            >
                              {(trackProgress * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add track manually OR auto-import from PDF amortization */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => addMortgageTrack(mortgage.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      הוסף מסלול
                    </button>
                    <AmortizationUpload
                      onTracksParsed={(tracks) =>
                        addParsedTracksToMortgage(mortgage.id, tracks)
                      }
                    />
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {/* Add another mortgage. Per-mortgage "טען לוח סילוקין" lives inside
            each card so the parsed tracks land in the right mortgage. The old
            global link to /balance#amortization (a static promise card with
            no upload handler) was removed 2026-05-21 in Phase 4. */}
        {mortgages.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 px-5 py-4 md:px-7"
            style={{ background: "#FAFAF7", borderTop: "1px solid #E5E7EB" }}
          >
            <button onClick={addMortgage} className="btn btn-secondary btn-sm">
              <span className="material-symbols-outlined text-[14px]">add_home</span>
              הוסף משכנתא נוספת
            </button>
          </div>
        )}
      </section>

      {/* ═══ Full Refinance Simulator (since 2026-05-18) ═══
          Multi-track mortgage refinance — picks a mortgage, projects 3 mix
          scenarios. Hidden when no usable mortgages. */}
      <FullRefinanceSimulator mortgages={mortgages} />

      {/* ═══ Loans Section ═══
          2026-05-05 visual-cleanup: lighter border + no shadow. */}
      <section
        className="mb-5 overflow-hidden rounded-2xl bg-[#FFFFFF]"
        style={{ border: "1px solid #FAFAF7", boxShadow: "none" }}
      >
        <button
          onClick={() => setExpandedLoans(!expandedLoans)}
          className="flex w-full items-center gap-3 px-5 py-5 text-right md:px-7"
          style={{ background: expandedLoans ? "rgba(139,46,46,0.06)" : "#FFFFFF" }}
        >
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
            style={{ background: "rgba(139,46,46,0.10)", borderRadius: "0.75rem" }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#DC2626" }}>
              account_balance
            </span>
          </span>
          <div className="flex-1">
            <h2 className="text-base font-extrabold" style={{ color: "#1A1A1A" }}>
              הלוואות
            </h2>
            <div className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
              {loanTotals.count} הלוואות · החזר חודשי {fmtILS(loanTotals.monthlyTotal)}
            </div>
          </div>
          <span
            className="material-symbols-outlined text-[20px] transition-transform"
            style={{
              color: "#6B7280",
              transform: expandedLoans ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          >
            expand_more
          </span>
        </button>

        {expandedLoans && data.loans.length === 0 && (
          <div className="px-5 pb-7 pt-2 text-center md:px-7">
            <span className="material-symbols-outlined text-[40px]" style={{ color: "#6B7280" }}>
              check_circle
            </span>
            <h3 className="mt-2 text-sm font-extrabold" style={{ color: "#1A1A1A" }}>
              אין הלוואות צרכניות
            </h3>
            <p
              className="mx-auto mb-3 mt-1 max-w-xs text-[11px] leading-relaxed"
              style={{ color: "#6B7280" }}
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
            {/* Column headers — 2026-05-18 visual cleanup */}
            <div
              className="mb-2 grid items-center pb-2 text-[12px] font-extrabold"
              style={{
                gridTemplateColumns:
                  "minmax(110px,1.2fr) 110px 88px 110px 84px 110px 110px 40px",
                color: "#6B7280",
                borderBottom: "1px solid #E5E7EB",
                columnGap: "10px",
              }}
            >
              <div>שם המלווה</div>
              <div className="text-left">תאריך התחלה</div>
              <div className="text-left">תשלומים</div>
              <div className="text-left">החזר חודשי</div>
              <div className="text-left">ריבית %</div>
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
                  className="group grid items-center py-3"
                  style={{
                    gridTemplateColumns:
                      "minmax(110px,1.2fr) 110px 88px 110px 84px 110px 110px 40px",
                    borderBottom: "1px solid #E5E7EB",
                    columnGap: "10px",
                  }}
                >
                  {/* Lender */}
                  <input
                    type="text"
                    value={loan.lender}
                    onChange={(e) => updateLoan(loan.id, "lender", e.target.value)}
                    placeholder="שם המלווה"
                    className="w-full border-none bg-transparent text-[13px] font-semibold focus:outline-none"
                    style={{ color: "#1A1A1A", borderBottom: "1px dotted transparent" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "#059669";
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
                    style={{ color: "#1A1A1A" }}
                  />
                  {/* Total payments */}
                  <input
                    type="number"
                    value={loan.totalPayments || ""}
                    onChange={(e) => updateLoan(loan.id, "totalPayments", e.target.value)}
                    placeholder="0"
                    className="w-full border-none bg-transparent text-left text-[13px] font-bold tabular-nums focus:outline-none"
                    style={{ color: "#1A1A1A", borderBottom: "1px dotted transparent" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "#059669";
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
                    style={{ color: "#DC2626", borderBottom: "1px dotted transparent" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "#059669";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderBottomColor = "transparent";
                    }}
                  />
                  {/* Interest rate (%) */}
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={
                      loan.interestRate !== undefined
                        ? Math.round(loan.interestRate * 1000) / 10
                        : ""
                    }
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateLoan(
                        loan.id,
                        "interestRate" as keyof Loan,
                        Number.isFinite(v) ? String(v / 100) : ""
                      );
                    }}
                    placeholder="—"
                    title={
                      loan.interestRate === undefined
                        ? "הזינו ריבית כדי שהיתרה תחושב מדויק (אחרת מוערך)"
                        : ""
                    }
                    className="w-full border-none bg-transparent text-left text-[12px] font-semibold tabular-nums focus:outline-none"
                    style={{
                      color: loan.interestRate === undefined ? "#9ca3af" : "#FFFFFF",
                      borderBottom: "1px dotted transparent",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderBottomColor = "#059669";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderBottomColor = "transparent";
                    }}
                  />
                  {/* Counter */}
                  <div className="flex flex-col gap-0.5">
                    <div
                      className="text-[11px] font-bold tabular-nums"
                      style={{ color: "#1A1A1A" }}
                    >
                      {loan.startDate ? `${elapsed} מתוך ${loan.totalPayments}` : "—"}
                    </div>
                    {loan.totalPayments > 0 && (
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full"
                        style={{ background: "#E5E7EB" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress * 100}%`,
                            background: progress >= 1 ? "#059669" : "#B45309",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {/* Remaining balance */}
                  <div
                    className="text-left text-[13px] font-extrabold tabular-nums"
                    style={{ color: balance > 0 ? "#DC2626" : "#059669" }}
                  >
                    {loan.startDate ? fmtILS(balance) : "—"}
                  </div>
                  {/* Delete */}
                  <button
                    onClick={() => deleteLoan(loan.id)}
                    className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                    style={{ color: "#6B7280" }}
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

      {/* ═══ Installments Section ═══
          2026-05-05 visual-cleanup: lighter border + no shadow. */}
      <section
        className="mb-5 overflow-hidden rounded-2xl bg-[#FFFFFF]"
        style={{ border: "1px solid #FAFAF7", boxShadow: "none" }}
      >
        <button
          onClick={() => setExpandedInstallments(!expandedInstallments)}
          className="flex w-full items-center gap-3 px-5 py-5 text-right md:px-7"
          style={{ background: expandedInstallments ? "rgba(74,124,89,0.08)" : "#FFFFFF" }}
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
            <h2 className="text-base font-extrabold" style={{ color: "#1A1A1A" }}>
              עסקאות תשלומים
            </h2>
            <div className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
              {installmentTotals.count} עסקאות · חיוב חודשי {fmtILS(installmentTotals.monthlyTotal)}
            </div>
          </div>
          <span
            className="material-symbols-outlined text-[20px] transition-transform"
            style={{
              color: "#6B7280",
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
                      style={{ borderBottom: "1px solid #E5E7EB" }}
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ color: "#4A7C59" }}
                      >
                        credit_card
                      </span>
                      <span className="flex-1 text-[13px] font-bold" style={{ color: "#1A1A1A" }}>
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
                          color: "#6B7280",
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
                          className="mb-1 grid items-center pb-1 text-[11px] font-extrabold uppercase tracking-[0.08em]"
                          style={{
                            gridTemplateColumns: "minmax(100px,1fr) 100px 90px 80px 28px",
                            color: "#6B7280",
                            borderBottom: "1px solid #E5E7EB",
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
                              borderBottom: "1px solid #E5E7EB",
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
                              style={{ color: "#1A1A1A", borderBottom: "1px dotted transparent" }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderBottomColor = "#059669";
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
                              style={{ color: "#6B7280", borderBottom: "1px dotted transparent" }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderBottomColor = "#059669";
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
                                style={{ color: "#1A1A1A" }}
                              />
                              <span className="text-[11px]" style={{ color: "#6B7280" }}>
                                /
                              </span>
                              <input
                                type="number"
                                value={inst.totalPayments || ""}
                                onChange={(e) =>
                                  updateInstallment(inst.id, "totalPayments", e.target.value)
                                }
                                className="w-8 border-none bg-transparent text-left text-[12px] font-bold tabular-nums focus:outline-none"
                                style={{ color: "#1A1A1A" }}
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
                                e.currentTarget.style.borderBottomColor = "#059669";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderBottomColor = "transparent";
                              }}
                            />
                            {/* Delete */}
                            <button
                              onClick={() => deleteInstallment(inst.id)}
                              className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                              style={{ color: "#6B7280" }}
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
                className="rounded-xl px-4 py-6 text-center"
                style={{ background: "#FAFAF7", border: "1px dashed #E5E7EB" }}
              >
                <span
                  className="material-symbols-outlined mb-1 inline-block"
                  style={{ fontSize: 28, color: "#6B7280" }}
                >
                  shopping_cart
                </span>
                <div className="mb-1 text-[13px] font-bold text-verdant-ink">
                  אין עדיין עסקאות תשלומים
                </div>
                <div className="text-[11px] text-verdant-muted">
                  הוסיפו עסקה כדי לעקוב אחרי תשלומים שמתפרסים על מספר חודשים — כמו רכישת רהיטים בתשלומים או טיסה.
                </div>
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

      {/* Payoff simulator — "if I throw ₪X at one obligation, which one wins?".
          Renders only when there's something to simulate. (2026-05-14.) */}
      {(data.loans.length > 0 || data.installments.length > 0) && (
        <section className="mb-6">
          <PayoffSimulator data={data} />
        </section>
      )}

      {/* Refinance simulator modal — pops on row "savings" icon click. */}
      {refiTrackId &&
        (() => {
          const tr = mortgages
            .flatMap((m) => m.tracks)
            .find((t) => t.id === refiTrackId);
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
      className="relative flex flex-col gap-1 overflow-hidden rounded-xl p-3 transition-all duration-300"
      style={{
        background: `linear-gradient(180deg, ${color}0a 0%, #FFFFFF 55%)`,
        border: `1px solid ${color}22`,
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${color} 0%, ${color}55 100%)` }}
      />
      <div
        className="text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "#6B7280" }}
      >
        {label}
      </div>
      <div
        className="text-[22px] font-extrabold tabular-nums leading-tight tracking-tight"
        style={{ color }}
      >
        {value}
      </div>
      <div className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
        {sub}
      </div>
    </div>
  );
}
