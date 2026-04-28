"use client";

/**
 * /pension — Pension & Savings Data Management
 * ─────────────────────────────────────────────
 * Purpose: CRUD for pension funds + data-quality insights (fees, insurance
 * duplication, §45א+47 benefit, study-fund above-cap).
 *
 * What lives here:
 *   • Fund table (add/edit/delete)
 *   • KPIs: צבירה, הפקדה חודשית, דמ"נ ממוצע
 *   • Donuts: product split + asset class
 *   • Data-quality cards (insurance dup, voluntary benefit, study-fund cap)
 *   • Annual report upload
 *
 * What does NOT live here (moved to /retirement):
 *   • Retirement simulation (sliders, projected balance, projected pension)
 *   • Retirement income breakdown (pension + BTL + tax)
 *   • Scenarios store (use /retirement live overrides instead)
 *
 * Link at the top → /retirement for the full planning workshop.
 */

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { SolidKpi } from "@/components/ui/SolidKpi";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { AnnualReportUpload } from "@/components/AnnualReportUpload";
import { fmtILS } from "@/lib/format";
import { loadAssumptions, section45and47Benefit } from "@/lib/assumptions";
import { loadSalaryProfile, computeSalaryBreakdown, hasSavedSalaryProfile, STUDY_FUND_SALARY_CAP } from "@/lib/salary-engine";
import type { Assumptions } from "@/lib/assumptions";
import {
  loadPensionFunds,
  addPensionFund as addFundToStore,
  updatePensionFund as updateFundInStore,
  deletePensionFund as deleteFundFromStore,
  EVENT_NAME as PENSION_EVENT,
} from "@/lib/pension-store";
import type { PensionFund } from "@/lib/pension-store";
import { getFundById, getFundsByProvider, PROVIDERS } from "@/lib/fund-registry";
import type { RegisteredFund } from "@/lib/fund-registry";
import { AllocationPie } from "@/components/charts/AllocationPie";
import { buildPensionAllocations } from "@/lib/pension-allocation";

/* ── Constants ── */

const FUND_TYPE_LABELS: Record<string, string> = {
  pension: "פנסיה מקיפה",
  gemel: "קופת גמל",
  hishtalmut: "קרן השתלמות",
  bituach: "ביטוח מנהלים",
};
const FUND_TYPE_COLORS: Record<string, string> = {
  pension: "#1B4332",
  gemel: "#2B694D",
  hishtalmut: "#1a6b42",
  bituach: "#125c38",
};

const SUBTYPE_LABELS: Record<string, string> = {
  pension_vatika: "קרן פנסיה ותיקה (לפני 1995)",
  pension_hadasha: "קרן פנסיה חדשה",
  bituach_classic: "ביטוח מנהלים קלאסי (לפני 1992)",
  bituach_adif: "ביטוח מנהלים עדיף (1992-2004)",
  bituach_2004: "ביטוח מנהלים חדש (2004+)",
  gemel_regular: "קופת גמל",
  gemel_190: "קופת גמל — תיקון 190",
  gemel_lehashkaa: "גמל להשקעה",
};

const SUBTYPES_BY_TYPE: Record<string, string[]> = {
  pension: ["pension_hadasha", "pension_vatika"],
  bituach: ["bituach_2004", "bituach_adif", "bituach_classic"],
  gemel: ["gemel_regular", "gemel_190", "gemel_lehashkaa"],
  hishtalmut: [],
};

/** בנצ'מרק דמי ניהול צבירה */
function feeBenchmark(fee: number): { color: string; label: string } {
  if (fee <= 0.3) return { color: "#1B4332", label: "מצוין" };
  if (fee <= 0.5) return { color: "#f59e0b", label: "סביר" };
  return { color: "#b91c1c", label: "גבוה" };
}

/** בדיקת התאמת מסלול לפי גיל */
function trackAlert(fund: PensionFund, currentAge: number): string | null {
  const trackLower = fund.track.toLowerCase();
  const isBondish = trackLower.includes("אג") || trackLower.includes("שקלי") || trackLower.includes("שמרני");
  const isEquity = trackLower.includes("מניות") || trackLower.includes("מנייתי") || trackLower.includes("s&p") || trackLower.includes("נאסדק");

  if (currentAge < 45 && isBondish && fund.type === "pension") {
    return "מסלול שמרני מדי לגילך — שקול מסלול כללי או מנייתי";
  }
  if (currentAge >= 60 && isEquity && fund.type === "pension") {
    return "מסלול מנייתי בגיל פרישה — שקול להקטין חשיפה";
  }
  return null;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const EMPTY_FUND: Omit<PensionFund, "id"> = {
  company: "", type: "pension", balance: 0, mgmtFeeDeposit: 0, mgmtFeeBalance: 0,
  track: "", monthlyContrib: 0,
};

/* ══════════════════════════════════════════════════ */

export default function PensionPage() {
  /* ── Save status indicator ── */
  const { status: saveStatus, pulse } = useSaveStatus();

  /* ── Assumptions (needed for currentAge → trackAlert) ── */
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);

  useEffect(() => {
    setAssumptions(loadAssumptions());
    const handler = () => setAssumptions(loadAssumptions());
    window.addEventListener("verdant:assumptions", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("verdant:assumptions", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  /* ── Pension Funds (localStorage CRUD) ── */
  const [funds, setFunds] = useState<PensionFund[]>([]);

  useEffect(() => {
    setFunds(loadPensionFunds());
    const handler = () => setFunds(loadPensionFunds());
    window.addEventListener(PENSION_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(PENSION_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  /* ── UI State ── */
  const [editingFund, setEditingFund] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const currentAge = assumptions?.currentAge ?? 42;

  /* ── Aggregates ── */
  const totalFundsBalance = funds.reduce((s, f) => s + f.balance, 0);
  const baseMonthlyContrib = funds.reduce((s, f) => s + f.monthlyContrib, 0);

  const weightedFee = useMemo(() => {
    if (totalFundsBalance === 0) return 0;
    return funds.reduce((s, f) => s + f.mgmtFeeBalance * f.balance, 0) / totalFundsBalance;
  }, [funds, totalFundsBalance]);

  const weightedFeeDeposit = useMemo(() => {
    if (baseMonthlyContrib === 0) return 0;
    return funds.reduce((s, f) => s + f.mgmtFeeDeposit * f.monthlyContrib, 0) / baseMonthlyContrib;
  }, [funds, baseMonthlyContrib]);

  const fundsByType = useMemo(() => {
    const groups: Record<string, PensionFund[]> = {};
    for (const f of funds) {
      if (!groups[f.type]) groups[f.type] = [];
      groups[f.type].push(f);
    }
    return groups;
  }, [funds]);

  /* ── Donut chart data ── */
  const fundsByTypeForChart = useMemo(() => {
    const data: { label: string; pct: number; color: string }[] = [];
    if (totalFundsBalance === 0) return data;
    for (const [type, typeFunds] of Object.entries(fundsByType)) {
      const total = typeFunds.reduce((s, f) => s + f.balance, 0);
      data.push({
        label: FUND_TYPE_LABELS[type] || type,
        pct: Math.round((total / totalFundsBalance) * 100),
        color: FUND_TYPE_COLORS[type] || "#999",
      });
    }
    return data.filter(d => d.pct > 0);
  }, [fundsByType, totalFundsBalance]);

  const pensionAssetClassBreakdown = useMemo(() => {
    if (totalFundsBalance === 0) return [];
    const classes: Record<string, number> = { equity: 0, bonds: 0, cash: 0, alternative: 0 };
    for (const f of funds) {
      const reg = f.registeredFundId ? getFundById(f.registeredFundId) : null;
      if (reg) {
        const weight = f.balance / totalFundsBalance;
        for (const [k, v] of Object.entries(reg.allocation.assetClass)) {
          classes[k] = (classes[k] || 0) + (v as number) * weight;
        }
      } else {
        // Default: assume general allocation 50/40/10
        const weight = f.balance / totalFundsBalance;
        classes.equity += 50 * weight;
        classes.bonds += 40 * weight;
        classes.cash += 10 * weight;
      }
    }
    const labels: Record<string, string> = { equity: "מניות", bonds: "אג״ח", cash: "מזומן", alternative: "אלטרנטיבי" };
    const colors: Record<string, string> = { equity: "#1B4332", bonds: "#1a6b42", cash: "#2B694D", alternative: "#f59e0b" };
    return Object.entries(classes)
      .filter(([, v]) => v > 0.5)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: labels[k] || k, pct: Math.round(v), color: colors[k] || "#999" }));
  }, [funds, totalFundsBalance]);

  /* ── Section 45א + 47 — Voluntary pension tax benefit ─────────────
   * Surfaces shekels "left on the table" by not depositing to the ceiling.
   * Needs a saved salary profile to know marginal tax + current voluntary rate. */
  const [salaryTick, setSalaryTick] = useState(0);
  useEffect(() => {
    const handler = () => setSalaryTick(t => t + 1);
    window.addEventListener("verdant:salary_profile:updated", handler);
    return () => window.removeEventListener("verdant:salary_profile:updated", handler);
  }, []);

  const voluntaryBenefit = useMemo(() => {
    if (!hasSavedSalaryProfile()) return null;
    const profile = loadSalaryProfile();
    if (!profile.monthlyGross) return null;
    const br = computeSalaryBreakdown(profile);
    const voluntaryPct = Math.max(0, profile.pensionEmployeePct - 6);
    const currentVoluntaryMonthly = profile.monthlyGross * (voluntaryPct / 100);
    const hypotheticalMax = profile.monthlyGross;
    const atMax = section45and47Benefit(hypotheticalMax, profile.monthlyGross, br.marginalBracket);
    const atCurrent = section45and47Benefit(currentVoluntaryMonthly, profile.monthlyGross, br.marginalBracket);
    const gap = Math.max(0, atMax.totalAnnual - atCurrent.totalAnnual);
    if (gap < 500) return null;
    return {
      currentMonthly: Math.round(currentVoluntaryMonthly),
      maxMonthly: atMax.maxVoluntaryMonthly,
      currentBenefit: atCurrent.totalAnnual,
      maxBenefit: atMax.totalAnnual,
      gap,
    };
  }, [funds, salaryTick]);

  /* ── Study fund above-cap warning ─────────────────────────────────
   * When gross > STUDY_FUND_SALARY_CAP and employer contributes on the full
   * salary, the portion above cap is a taxable fringe benefit at marginal +
   * ~12% BL/health on employee. */
  const studyFundWarning = useMemo(() => {
    if (!hasSavedSalaryProfile()) return null;
    const profile = loadSalaryProfile();
    if (!profile.monthlyGross || profile.monthlyGross <= STUDY_FUND_SALARY_CAP) return null;
    const br = computeSalaryBreakdown(profile);
    if (br.studyFundExcessGross <= 0) return null;
    const excessEmployer = br.studyFundExcessGross * (profile.studyFundEmployerPct / 100);
    const totalMonthlyCost = br.studyFundFringeTaxMonthly + br.studyFundBLTaxMonthly;
    return {
      excessGross: Math.round(br.studyFundExcessGross),
      excessEmployerMonthly: Math.round(excessEmployer),
      fringeTaxMonthly: br.studyFundFringeTaxMonthly,
      blTaxMonthly: br.studyFundBLTaxMonthly,
      totalMonthlyCost,
      fringeTaxAnnual: totalMonthlyCost * 12,
      marginalPct: Math.round(br.marginalBracket * 100),
      cap: STUDY_FUND_SALARY_CAP,
    };
  }, [funds, salaryTick]);

  /* ── Insurance Duplication Check ── */
  const insuranceDuplication = useMemo(() => {
    const fundsWithInsurance = funds.filter(f => f.insuranceCover);
    if (fundsWithInsurance.length < 2) return null;

    const deathCovers = fundsWithInsurance.filter(f => f.insuranceCover?.death);
    const disabilityCovers = fundsWithInsurance.filter(f => f.insuranceCover?.disability);
    const lowCovers = fundsWithInsurance.filter(f => f.insuranceCover?.lossOfWork);

    const duplicates: { type: string; label: string; funds: string[]; estimatedWaste: number }[] = [];
    if (deathCovers.length > 1) duplicates.push({ type: "death", label: "ביטוח חיים (מוות)", funds: deathCovers.map(f => f.company), estimatedWaste: 80 });
    if (disabilityCovers.length > 1) duplicates.push({ type: "disability", label: "אובדן כושר עבודה", funds: disabilityCovers.map(f => f.company), estimatedWaste: 120 });
    if (lowCovers.length > 1) duplicates.push({ type: "low", label: "פיצוי אבטלה", funds: lowCovers.map(f => f.company), estimatedWaste: 60 });

    return duplicates.length > 0 ? duplicates : null;
  }, [funds]);

  /* ── CRUD handlers ── */
  function handleSaveFund(fund: PensionFund) {
    if (editingFund) {
      updateFundInStore(fund.id, fund);
    } else {
      addFundToStore({ ...fund, id: uid() });
    }
    pulse();
    setFunds(loadPensionFunds());
    setEditingFund(null);
    setShowAddForm(false);
  }

  function handleDeleteFund(id: string) {
    deleteFundFromStore(id);
    pulse();
    setFunds(loadPensionFunds());
  }

  /* ════════════════════════════════════════════════ */
  /*                     RENDER                       */
  /* ════════════════════════════════════════════════ */

  return (
    <div className="max-w-6xl mx-auto">
      {/* ===== 1. PageHeader ===== */}
      <PageHeader
        subtitle="ניהול נתונים"
        title="פנסיה והשקעות"
        description={`צבירה כוללת: ${fmtILS(totalFundsBalance)}`}
      />
      <div className="flex justify-end -mt-4 mb-3 min-h-[18px]">
        <SaveStatus status={saveStatus} />
      </div>

      {/* ===== 2. Cross-link banner → /retirement ===== */}
      <Link
        href="/retirement"
        className="block mb-6 p-4 rounded-xl transition-shadow hover:shadow-md"
        style={{ background: "linear-gradient(135deg, #1B4332 0%, #2B694D 100%)" }}
      >
        <div className="flex items-center gap-3 text-white">
          <span className="material-symbols-outlined text-[22px]" style={{ color: "#C1ECD4" }}>beach_access</span>
          <div className="flex-1">
            <div className="text-sm font-extrabold">תכנון פרישה המלא</div>
          </div>
          <span className="material-symbols-outlined" style={{ color: "#C1ECD4" }}>chevron_left</span>
        </div>
      </Link>

      {/* ===== 3. KPI Row (3 only — data-focused) ===== */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <SolidKpi label="צבירה פנסיונית"    value={fmtILS(totalFundsBalance)}    icon="savings"        tone="forest" />
        <SolidKpi label="הפקדה חודשית"      value={fmtILS(baseMonthlyContrib)}   icon="calendar_month" tone="emerald" />
        <SolidKpi label="דמי ניהול ממוצעים" value={`${weightedFee.toFixed(2)}%`} icon="percent"
                  tone={feeBenchmark(weightedFee).color === "#b91c1c" ? "red" : feeBenchmark(weightedFee).color === "#1B4332" ? "emerald" : "amber"}
                  sub={feeBenchmark(weightedFee).label} />
      </section>

      {/* ===== 4. Allocation Pies (3 cuts: type / risk / geo) — 2026-04-28 redesign ===== */}
      {funds.length > 0 && (() => {
        const alloc = buildPensionAllocations(funds);
        const missingPct = alloc.total > 0
          ? Math.round((alloc.missingCoverage / alloc.total) * 100)
          : 0;
        return (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              <AllocationPie title="לפי סוג קופה" slices={alloc.byType} size="md" />
              <AllocationPie
                title="לפי רמת סיכון"
                slices={alloc.byRisk}
                size="md"
                emptyHint="אין מסלולים מזוהים — בחר מסלול ידנית כדי לראות חתך סיכון"
              />
              <AllocationPie
                title="לפי גאוגרפיה"
                slices={alloc.byGeo}
                size="md"
                emptyHint="אין מסלולים מזוהים — בחר מסלול ידנית כדי לראות חתך גאוגרפי"
              />
            </section>
            {missingPct > 0 && (
              <div className="rounded-xl px-4 py-2.5 mb-6 flex items-start gap-2 text-[12px]"
                   style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}>
                <span className="material-symbols-outlined text-[18px]" style={{ color: "#92400E" }}>info</span>
                <span style={{ color: "#92400E" }}>
                  {missingPct}% מהקופות ללא מסלול מזוהה — חתכי סיכון וגאוגרפיה חלקיים. בחר מסלול בכל קופה לראייה מלאה.
                </span>
              </div>
            )}
          </>
        );
      })()}

      {/* ===== 5. Pension Funds Table (CRUD + insurance alert + summary) ===== */}
      <section className="v-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b v-divider flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-verdant-ink">קרנות פנסיה וחיסכון</h2>
            <p className="text-[11px] text-verdant-muted mt-0.5">{funds.length} קרנות · מעודכן מהמסלקה הפנסיונית</p>
          </div>
          <button
            onClick={() => { setEditingFund(null); setShowAddForm(true); }}
            className="btn-botanical text-xs !px-3 !py-1.5"
          >
            + הוסף קרן
          </button>
        </div>

        {/* Insurance duplication alert */}
        {insuranceDuplication && (
          <div className="mx-5 mt-3 p-3 rounded-lg flex items-center gap-2 text-xs" style={{ background: "#fef3c7", border: "1px solid #f59e0b" }}>
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#f59e0b" }}>warning</span>
            <span className="font-bold" style={{ color: "#92400e" }}>
              זוהו כיסויים כפולים ({insuranceDuplication.map(d => d.label).join(", ")}) —
              בזבוז משוער: ₪{(insuranceDuplication.reduce((s, d) => s + d.estimatedWaste, 0) * 12).toLocaleString("he-IL")}/שנה
            </span>
          </div>
        )}

        {/* Guaranteed factor alert */}
        {funds.some(f => f.subtype === "bituach_classic" || f.subtype === "bituach_adif" || f.subtype === "pension_vatika") && (
          <div className="mx-5 mt-2 p-3 rounded-lg flex items-start gap-2 text-xs"
            style={{ background: "#fef3c7", border: "1px solid #f59e0b" }}>
            <span className="material-symbols-outlined text-[16px] mt-0.5" style={{ color: "#f59e0b" }}>lock</span>
            <div>
              <span className="font-bold" style={{ color: "#92400e" }}>
                זוהו קרנות עם מקדם מובטח —{" "}
              </span>
              <span style={{ color: "#78350f" }}>
                פוליסות ישנות עם מקדם מובטח הן נכס נדיר.
                לעולם אין להעביר, לסגור, או לאחד אותן עם קרנות אחרות.
                מקדם נמוך = קצבה גבוהה יותר בפרישה.
              </span>
            </div>
          </div>
        )}

        {/* Add / Edit Form */}
        {(showAddForm || editingFund) && (
          <FundForm
            initial={editingFund ? funds.find(f => f.id === editingFund) ?? { ...EMPTY_FUND, id: "" } : { ...EMPTY_FUND, id: "" }}
            onSave={handleSaveFund}
            onCancel={() => { setEditingFund(null); setShowAddForm(false); }}
          />
        )}

        {/* Empty state */}
        {funds.length === 0 && !showAddForm && !editingFund && (
          <div className="px-6 py-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-verdant-muted mb-3" style={{ display: "inline-block" }}>
              account_balance
            </span>
            <h3 className="text-base font-extrabold text-verdant-ink mb-1">עדיין לא נוספו קרנות</h3>
            <p className="text-xs text-verdant-muted mb-4">
              העלה דוח שנתי או הוסף ידנית.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => { setEditingFund(null); setShowAddForm(true); }}
                className="btn-botanical text-xs !px-4 !py-2"
              >
                + הוסף קרן ידנית
              </button>
              <button
                onClick={() => {
                  document.getElementById("annual-upload")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="text-xs font-bold px-4 py-2 rounded-lg border v-divider text-verdant-ink hover:bg-[#f4f7ed] transition-colors"
              >
                העלה דיוור שנתי (PDF)
              </button>
            </div>
          </div>
        )}

        {/* Grouped rows */}
        {funds.length > 0 && Object.entries(fundsByType).map(([type, typeFunds]) => (
          <div key={type}>
            <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: "#f4f7ed" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: FUND_TYPE_COLORS[type] || "#1B4332" }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">
                {FUND_TYPE_LABELS[type] || type}
              </span>
            </div>
            {typeFunds.map(f => (
              <div key={f.id} className="px-5 py-3.5 border-b v-divider hover:bg-[#f9faf2] transition-colors">
                <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-extrabold text-verdant-ink">{f.company}</div>
                    {f.insuranceCover && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                        כולל ביטוח
                      </span>
                    )}
                    {f.type === "hishtalmut" && f.openingDate && (() => {
                      const vestYrs = f.isEmployed === false ? 3 : 6;
                      const liqDate = new Date(f.openingDate);
                      liqDate.setFullYear(liqDate.getFullYear() + vestYrs);
                      const isLiq = new Date() >= liqDate;
                      return (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: isLiq ? "#dcfce7" : "#fef9c3", color: isLiq ? "#166534" : "#854d0e" }}>
                          {isLiq ? "נזילה ✓" : `נזילה ${liqDate.toLocaleDateString("he-IL")}`}
                        </span>
                      );
                    })()}
                    {(f.subtype === "bituach_classic" || f.subtype === "bituach_adif" || f.subtype === "pension_vatika") && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "#fef3c7", color: "#92400e" }}>
                        מקדם מובטח{f.conversionFactor ? ` (${f.conversionFactor})` : ""}
                      </span>
                    )}
                    {f.guaranteedRate != null && f.guaranteedRate > 0 && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "#e0f2fe", color: "#0369a1" }}>
                        ריבית מובטחת {f.guaranteedRate}%
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-verdant-muted mt-0.5">
                    {f.subtype && SUBTYPE_LABELS[f.subtype] && (
                      <span className="text-verdant-emerald font-bold">{SUBTYPE_LABELS[f.subtype]} · </span>
                    )}
                    מסלול: {f.track} · הפקדה: {fmtILS(f.monthlyContrib)}/חודש
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-left">
                    <div className="text-[10px] text-verdant-muted font-bold">דמי ניהול</div>
                    <div className="text-xs font-extrabold tabular" style={{ color: feeBenchmark(f.mgmtFeeBalance).color }}>
                      {f.mgmtFeeDeposit}% הפקדה · {f.mgmtFeeBalance}% צבירה
                    </div>
                    <div className="text-[9px] font-bold" style={{ color: feeBenchmark(f.mgmtFeeBalance).color }}>
                      {feeBenchmark(f.mgmtFeeBalance).label}
                    </div>
                  </div>
                  <div className="text-left min-w-[100px]">
                    <div className="text-[10px] text-verdant-muted font-bold">יתרה</div>
                    <div className="text-sm font-extrabold text-verdant-ink tabular">{fmtILS(f.balance)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setShowAddForm(false); setEditingFund(f.id); }}
                      title="עריכה"
                      className="px-2.5 py-1.5 rounded-lg hover:bg-[#f4f7ed] flex items-center gap-1 text-[11px] text-verdant-muted font-bold"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteFund(f.id)}
                      title="מחיקת קופה"
                      className="px-2.5 py-1.5 rounded-lg hover:bg-red-50 flex items-center gap-1 text-[11px] text-red-600 font-bold border border-red-200"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      מחק
                    </button>
                  </div>
                </div>
                </div>
                {(() => {
                  const alert = trackAlert(f, currentAge);
                  if (!alert) return null;
                  return (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-bold" style={{ color: "#b45309" }}>
                      <span className="material-symbols-outlined text-[12px]">info</span>
                      {alert}
                    </div>
                  );
                })()}
                {/* Multi-track drill-down — shown only when fund has tracks[]. */}
                {f.tracks && f.tracks.length > 1 && (
                  <div className="mt-2 pt-2 border-t v-divider">
                    <div className="text-[10px] font-bold text-verdant-muted mb-1.5">
                      פילוח מסלולים ({f.tracks.length})
                    </div>
                    <div className="space-y-1">
                      {f.tracks.map((t, ti) => {
                        const pct = f.balance > 0 ? (t.balance / f.balance) * 100 : 0;
                        return (
                          <div key={ti} className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-sm shrink-0 ${t.registeredFundId ? "" : "ring-1 ring-amber-400"}`}
                                    style={{ background: t.registeredFundId ? "#1B4332" : "#FCD34D" }} />
                              <span className="text-verdant-ink truncate">{t.name}</span>
                              {!t.registeredFundId && (
                                <span className="text-[9px] font-bold text-amber-700">לא מזוהה</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-verdant-muted tabular">{fmtILS(t.balance)}</span>
                              <span className="text-verdant-ink font-bold tabular w-10 text-left">{Math.round(pct)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Summary row */}
        {funds.length > 0 && (
        <div className="px-5 py-3.5 border-t-2 v-divider flex items-center justify-between" style={{ background: "#f4f7ed" }}>
          <div className="text-sm font-extrabold text-verdant-ink">סה״כ</div>
          <div className="flex items-center gap-6">
            <div className="text-left">
              <div className="text-[10px] text-verdant-muted font-bold">הפקדה חודשית</div>
              <div className="text-sm font-extrabold text-verdant-emerald tabular">{fmtILS(baseMonthlyContrib)}</div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-verdant-muted font-bold">דמ&quot;נ ממוצע</div>
              <div className="text-sm font-extrabold tabular" style={{ color: feeBenchmark(weightedFee).color }}>{weightedFee.toFixed(2)}%</div>
            </div>
            <div className="text-left min-w-[100px]">
              <div className="text-[10px] text-verdant-muted font-bold">צבירה כוללת</div>
              <div className="text-sm font-extrabold text-verdant-ink tabular">{fmtILS(totalFundsBalance)}</div>
            </div>
          </div>
        </div>
        )}
      </section>

      {/* ===== 6. Keren Hishtalmut Insights ===== */}
      {(() => {
        const hishtalmutFunds = funds.filter(f => f.type === "hishtalmut");
        if (hishtalmutFunds.length === 0) return null;

        const totalHishtalmut = hishtalmutFunds.reduce((s, f) => s + f.balance, 0);
        const today = new Date();

        const insights = hishtalmutFunds.map(f => {
          const vestingYears = f.isEmployed === false ? 3 : 6;
          let liquidityDate: Date | null = null;
          let isLiquid = false;
          let yearsLeft = 0;
          let monthsLeft = 0;

          if (f.openingDate) {
            const openDate = new Date(f.openingDate);
            liquidityDate = new Date(openDate);
            liquidityDate.setFullYear(liquidityDate.getFullYear() + vestingYears);
            isLiquid = today >= liquidityDate;
            if (!isLiquid) {
              const diffMs = liquidityDate.getTime() - today.getTime();
              const totalMonths = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30.44));
              yearsLeft = Math.floor(totalMonths / 12);
              monthsLeft = totalMonths % 12;
            }
          }

          // Project future value at 5% annual for compound growth insight
          const annualReturn = 0.05;
          const projectedIn5 = Math.round(f.balance * Math.pow(1 + annualReturn, 5));
          const projectedIn10 = Math.round(f.balance * Math.pow(1 + annualReturn, 10));

          return { fund: f, vestingYears, liquidityDate, isLiquid, yearsLeft, monthsLeft, projectedIn5, projectedIn10 };
        });

        return (
          <section className="v-card mb-6 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2" style={{ background: "#f0fdf4" }}>
              <span className="material-symbols-outlined text-[18px]" style={{ color: "#1a6b42" }}>school</span>
              <div>
                <div className="caption mb-0.5">קרן השתלמות</div>
                <h3 className="text-sm font-extrabold text-verdant-ink">
                  סה״כ {fmtILS(totalHishtalmut)} · {hishtalmutFunds.length === 1 ? "קרן אחת" : `${hishtalmutFunds.length} קרנות`}
                </h3>
              </div>
            </div>

            {insights.map(({ fund: f, vestingYears, liquidityDate, isLiquid, yearsLeft, monthsLeft, projectedIn5, projectedIn10 }) => (
              <div key={f.id} className="px-5 py-4 border-b v-divider">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-extrabold text-verdant-ink">{f.company}</div>
                  <div className="text-sm font-extrabold text-verdant-ink tabular">{fmtILS(f.balance)}</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  {f.openingDate ? (
                    <>
                      <div className="p-2.5 rounded-lg" style={{ background: "#f4f7ed" }}>
                        <div className="text-[10px] text-verdant-muted font-bold">תאריך פתיחה</div>
                        <div className="text-xs font-extrabold text-verdant-ink mt-0.5">
                          {new Date(f.openingDate).toLocaleDateString("he-IL")}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: isLiquid ? "#f0fdf4" : "#fefce8" }}>
                        <div className="text-[10px] text-verdant-muted font-bold">
                          נזילות ({vestingYears} שנים · {f.isEmployed === false ? "עצמאי" : "שכיר"})
                        </div>
                        {isLiquid ? (
                          <div className="text-xs font-extrabold mt-0.5" style={{ color: "#1B4332" }}>
                            נזילה ✓
                          </div>
                        ) : (
                          <div className="text-xs font-extrabold mt-0.5" style={{ color: "#92400e" }}>
                            {liquidityDate ? liquidityDate.toLocaleDateString("he-IL") : "—"}
                            {yearsLeft > 0 && ` (${yearsLeft} שנים`}
                            {yearsLeft > 0 && monthsLeft > 0 && ` ו-${monthsLeft} חודשים`}
                            {yearsLeft === 0 && monthsLeft > 0 && ` (${monthsLeft} חודשים`}
                            {(yearsLeft > 0 || monthsLeft > 0) && ")"}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-2.5 rounded-lg col-span-2" style={{ background: "#fefce8" }}>
                      <div className="flex items-center gap-1 text-[11px] font-bold" style={{ color: "#92400e" }}>
                        <span className="material-symbols-outlined text-[14px]">info</span>
                        הגדר תאריך פתיחה כדי לראות מועד נזילות
                      </div>
                    </div>
                  )}
                  <div className="p-2.5 rounded-lg" style={{ background: "#f4f7ed" }}>
                    <div className="text-[10px] text-verdant-muted font-bold">צפי עוד 5 שנים</div>
                    <div className="text-xs font-extrabold text-verdant-ink mt-0.5 tabular">{fmtILS(projectedIn5)}</div>
                  </div>
                  <div className="p-2.5 rounded-lg" style={{ background: "#f4f7ed" }}>
                    <div className="text-[10px] text-verdant-muted font-bold">צפי עוד 10 שנים</div>
                    <div className="text-xs font-extrabold text-verdant-ink mt-0.5 tabular">{fmtILS(projectedIn10)}</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border text-right" style={{ background: "#fafdf5", borderColor: "#d1e7c8" }}>
                  {isLiquid ? (
                    <div className="text-[12px] font-bold text-verdant-ink">
                      ✓ נזילה — ב-5 שנים נוספות תגדל ל-{fmtILS(projectedIn5)} פטור ממס. עדיף להשאיר.
                    </div>
                  ) : f.openingDate ? (
                    <div className="text-[12px] font-bold text-verdant-ink">
                      תיפתח ב-{liquidityDate?.toLocaleDateString("he-IL")} · "כסף אחרון" — לא לגעת.
                    </div>
                  ) : (
                    <div className="text-[12px] font-bold text-verdant-ink">
                      "כסף אחרון" — פטור ממס. הוסף תאריך פתיחה לתכנון נזילות.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        );
      })()}

      {/* ===== 7. Section 45א + 47 — Voluntary contribution benefit ===== */}
      {voluntaryBenefit && (
        <div className="card-pad mb-6" style={{ borderInlineStart: "4px solid #2B694D" }}>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-verdant-emerald flex-shrink-0">savings</span>
            <div className="flex-1 min-w-0">
              <div className="caption mb-1">הטבת מס על הפקדה וולונטרית</div>
              <h3 className="text-sm font-extrabold text-verdant-ink mb-2">
                אתה מפסיד כ-{fmtILS(voluntaryBenefit.gap)} בשנה
              </h3>
              <p className="text-[12px] text-verdant-muted leading-6">
                הפקדה וולונטרית נוספת לפנסיה/ביטוח חיים מזכה ב-<b>זיכוי 35%</b> (סעיף 45א)
                וב-<b>ניכוי 11%</b> (סעיף 47). היום אתה מפקיד וולונטרית {fmtILS(voluntaryBenefit.currentMonthly)}/חודש
                (הטבה שנתית: {fmtILS(voluntaryBenefit.currentBenefit)}). מיצוי התקרה של {fmtILS(voluntaryBenefit.maxMonthly)}/חודש
                יעלה את ההטבה ל-{fmtILS(voluntaryBenefit.maxBenefit)}/שנה.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 8. Study fund above-cap warning ===== */}
      {studyFundWarning && (
        <div className="card-pad mb-6" style={{ borderInlineStart: "4px solid #b91c1c" }}>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] flex-shrink-0" style={{ color: "#b91c1c" }}>warning</span>
            <div className="flex-1 min-w-0">
              <div className="caption mb-1">זקיפת שווי — קרן השתלמות מעל התקרה</div>
              <h3 className="text-sm font-extrabold text-verdant-ink mb-2">
                אתה משלם כ-{fmtILS(studyFundWarning.totalMonthlyCost)}/חודש מס על חלק המעסיק שמעל {fmtILS(studyFundWarning.cap)}
              </h3>
              <p className="text-[12px] text-verdant-muted leading-6">
                השכר שלך מעל תקרת ההטבה ({fmtILS(studyFundWarning.cap)}). חלק המעסיק שמעל התקרה —
                כ-{fmtILS(studyFundWarning.excessEmployerMonthly)}/חודש — נזקף כהכנסה חייבת,
                ומחייב אותך במס שולי ({studyFundWarning.marginalPct}%) וגם בביטוח לאומי ובריאות
                (~12% · {fmtILS(studyFundWarning.blTaxMonthly)}/חודש). עלות שנתית כוללת:
                <b> {fmtILS(studyFundWarning.fringeTaxAnnual)}</b>.
                שקול להגביל את הפקדת המעסיק לתקרה, או להפנות את העודף לקופת גמל להשקעה.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 9. Annual Report (PDF) Upload ===== */}
      <div id="annual-upload" className="mt-6 scroll-mt-20">
        <AnnualReportUpload />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*              MiniDonut — SVG Donut Chart              */
/* ══════════════════════════════════════════════════════ */

function MiniDonut({ data, size = 140 }: { data: { label: string; pct: number; color: string }[]; size?: number }) {
  const r = 50, cx = 60, cy = 60;
  let cum = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" style={{ width: size, height: size }} className="flex-shrink-0">
        {data.map((d, i) => {
          const angle = (d.pct / 100) * 360;
          const start = cum;
          cum += angle;
          if (d.pct < 1) return null;
          const sr = ((start - 90) * Math.PI) / 180;
          const er = ((start + angle - 90) * Math.PI) / 180;
          const la = angle > 180 ? 1 : 0;
          return (
            <path
              key={i}
              d={`M ${cx} ${cy} L ${cx + r * Math.cos(sr)} ${cy + r * Math.sin(sr)} A ${r} ${r} 0 ${la} 1 ${cx + r * Math.cos(er)} ${cy + r * Math.sin(er)} Z`}
              fill={d.color} stroke="#fff" strokeWidth="2"
            />
          );
        })}
        <circle cx={cx} cy={cy} r="28" fill="#f9faf2" />
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-[11px] text-verdant-ink font-bold">{d.label}</span>
            <span className="text-[11px] text-verdant-muted font-bold tabular">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*              FundForm — Add / Edit Modal              */
/* ══════════════════════════════════════════════════════ */

function FundForm({ initial, onSave, onCancel }: {
  initial: PensionFund;
  onSave: (f: PensionFund) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PensionFund>({ ...initial });
  // Pre-fill provider when editing an existing fund so the user sees the
  // track dropdown pre-populated (2026-04-28 — was always blank before).
  const initialProvider = (() => {
    if (initial.registeredFundId) {
      const reg = getFundById(initial.registeredFundId);
      if (reg) return reg.provider;
    }
    return initial.company || "";
  })();
  const [provider, setProvider] = useState(initialProvider);
  const [selectedFundId, setSelectedFundId] = useState(form.registeredFundId || "");
  const set = (patch: Partial<PensionFund>) => setForm(prev => ({ ...prev, ...patch }));

  const providerFunds = provider ? getFundsByProvider(provider) : [];
  const selectedFund: RegisteredFund | undefined = selectedFundId ? getFundById(selectedFundId) : undefined;

  function handleFundSelect(fundId: string) {
    setSelectedFundId(fundId);
    const fund = getFundById(fundId);
    if (fund) {
      set({
        registeredFundId: fundId,
        track: fund.name,
        mgmtFeeBalance: fund.mgmtFee,
      });
    }
  }

  return (
    <div className="px-5 py-4 border-b v-divider" style={{ background: "#f9faf2" }}>
      {/* Row 1: Registry selection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">חברה מנהלת</label>
          <select value={provider} onChange={e => { setProvider(e.target.value); setSelectedFundId(""); }}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            <option value="">בחר חברה</option>
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">מסלול השקעה</label>
          <select value={selectedFundId} onChange={e => handleFundSelect(e.target.value)}
            disabled={!provider}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#d8e0d0", background: provider ? "#fff" : "#f4f7ed" }}>
            <option value="">בחר מסלול</option>
            {providerFunds.map(f => (
              <option key={f.id} value={f.id}>
                {f.name} — {f.equityExposure}% מניות · דמ&quot;נ {f.mgmtFee}%
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">סוג</label>
          <select value={form.type} onChange={e => set({ type: e.target.value as PensionFund["type"], subtype: undefined })}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            <option value="pension">פנסיה מקיפה</option>
            <option value="gemel">קופת גמל</option>
            <option value="hishtalmut">קרן השתלמות</option>
            <option value="bituach">ביטוח מנהלים</option>
          </select>
        </div>
      </div>

      {/* Subtype + conversion factor + guaranteed rate */}
      {(SUBTYPES_BY_TYPE[form.type]?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">תת-סוג</label>
            <select value={form.subtype || ""} onChange={e => set({ subtype: (e.target.value || undefined) as PensionFund["subtype"] })}
              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
              style={{ borderColor: "#d8e0d0", background: "#fff" }}>
              <option value="">לא צוין</option>
              {SUBTYPES_BY_TYPE[form.type]?.map(st => (
                <option key={st} value={st}>{SUBTYPE_LABELS[st]}</option>
              ))}
            </select>
          </div>

          {(form.subtype === "pension_vatika" || form.subtype === "bituach_classic" || form.subtype === "bituach_adif") && (
            <div>
              <label className="text-[10px] font-bold text-verdant-muted block mb-1">מקדם קצבה</label>
              <input type="number" step="1" value={form.conversionFactor || ""}
                onChange={e => set({ conversionFactor: +e.target.value || undefined })}
                className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink tabular"
                style={{ borderColor: "#d8e0d0", background: "#fff" }} placeholder="לדוג' 120" />
            </div>
          )}

          {form.subtype === "bituach_classic" && (
            <div>
              <label className="text-[10px] font-bold text-verdant-muted block mb-1">ריבית מובטחת %</label>
              <input type="number" step="0.1" value={form.guaranteedRate || ""}
                onChange={e => set({ guaranteedRate: +e.target.value || undefined })}
                className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink tabular"
                style={{ borderColor: "#d8e0d0", background: "#fff" }} placeholder="לדוג' 4.0" />
            </div>
          )}
        </div>
      )}

      {/* Selected fund summary */}
      {selectedFund && (
        <div className="p-3 rounded-lg mb-3" style={{ background: "#f4f7ed" }}>
          <div className="text-[10px] font-bold text-verdant-muted mb-1">אלוקציה אוטומטית:</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-[11px] text-verdant-ink font-bold">
            <span>מניות: {selectedFund.equityExposure}%</span>
            <span>חו&quot;ל: {selectedFund.foreignExposure}%</span>
            <span>חשיפה למט&quot;ח: {selectedFund.currencyExposure}%</span>
            <span>דמ&quot;נ: {selectedFund.mgmtFee}%</span>
          </div>
        </div>
      )}

      {/* Row 2: Core fields */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">חברה (שם חופשי)</label>
          <input type="text" value={form.company} onChange={e => set({ company: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#d8e0d0", background: "#fff" }} placeholder={provider || "שם החברה"} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">יתרה</label>
          <input type="number" value={form.balance || ""} onChange={e => set({ balance: +e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink tabular"
            style={{ borderColor: "#d8e0d0", background: "#fff" }} placeholder="₪" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">הפקדה חודשית</label>
          <input type="number" value={form.monthlyContrib || ""} onChange={e => set({ monthlyContrib: +e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink tabular"
            style={{ borderColor: "#d8e0d0", background: "#fff" }} placeholder="₪" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">מסלול</label>
          <input type="text" value={form.track} onChange={e => set({ track: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#d8e0d0", background: "#fff" }} placeholder="כללי / מניות / אג״ח" />
        </div>
      </div>

      {/* Hishtalmut-specific: opening date + employment status */}
      {form.type === "hishtalmut" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">תאריך פתיחה</label>
            <input type="date" value={form.openingDate || ""}
              onChange={e => set({ openingDate: e.target.value || undefined })}
              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
              style={{ borderColor: "#d8e0d0", background: "#fff" }} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">סטטוס תעסוקה</label>
            <select value={form.isEmployed === false ? "self" : "employed"}
              onChange={e => set({ isEmployed: e.target.value === "employed" })}
              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink"
              style={{ borderColor: "#d8e0d0", background: "#fff" }}>
              <option value="employed">שכיר (נזילות 6 שנים)</option>
              <option value="self">עצמאי (נזילות 3 שנים)</option>
            </select>
          </div>
        </div>
      )}

      {/* Row 3: Fees + Insurance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">דמ&quot;נ הפקדה %</label>
          <input type="number" step="0.01" value={form.mgmtFeeDeposit || ""} onChange={e => set({ mgmtFeeDeposit: +e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink tabular"
            style={{ borderColor: "#d8e0d0", background: "#fff" }} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">דמ&quot;נ צבירה %</label>
          <input type="number" step="0.01" value={form.mgmtFeeBalance || ""} onChange={e => set({ mgmtFeeBalance: +e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-verdant-ink tabular"
            style={{ borderColor: "#d8e0d0", background: "#fff" }} />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] font-bold text-verdant-muted block mb-1">כיסויים ביטוחיים</label>
          <div className="flex flex-wrap gap-2 mt-0.5">
            {[
              { key: "death" as const, label: "מוות" },
              { key: "disability" as const, label: "נכות" },
              { key: "lossOfWork" as const, label: "אבטלה" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1 text-[10px] text-verdant-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.insuranceCover?.[key] ?? false}
                  onChange={e => set({
                    insuranceCover: {
                      death: form.insuranceCover?.death ?? false,
                      disability: form.insuranceCover?.disability ?? false,
                      lossOfWork: form.insuranceCover?.lossOfWork ?? false,
                      [key]: e.target.checked,
                    },
                  })}
                  className="accent-verdant-emerald"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            const name = form.company.trim() || provider;
            if (name) onSave({ ...form, company: name });
          }}
          className="btn-botanical text-xs !px-4 !py-1.5"
        >
          {initial.id ? "עדכן" : "הוסף"}
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost text-xs !px-4 !py-1.5">
          ביטול
        </button>
      </div>
    </div>
  );
}
