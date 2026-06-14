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
import {
  loadSalaryProfile,
  computeSalaryBreakdown,
  hasSavedSalaryProfile,
  STUDY_FUND_SALARY_CAP,
} from "@/lib/salary-engine";
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
import { FundSimulationModal } from "@/components/pension/FundSimulationModal";
import { Modal } from "@/app/(client)/goals/page-files/Modal";
import { scopedKey } from "@/lib/client-scope";

/* ── Constants ── */

const FUND_TYPE_LABELS: Record<string, string> = {
  pension: "פנסיה מקיפה",
  gemel: "קופת גמל",
  hishtalmut: "קרן השתלמות",
  bituach: "ביטוח מנהלים",
};
const FUND_TYPE_COLORS: Record<string, string> = {
  pension: "#2C7A5A",
  gemel: "#059669",
  hishtalmut: "#0EA5E9",
  bituach: "#4A9B7A",
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
  if (fee <= 0.3) return { color: "#2C7A5A", label: "מצוין" };
  if (fee <= 0.5) return { color: "#D97706", label: "סביר" };
  return { color: "#DC2626", label: "גבוה" };
}

/** בדיקת התאמת מסלול לפי גיל */
function trackAlert(fund: PensionFund, currentAge: number): string | null {
  const trackLower = fund.track.toLowerCase();
  const isBondish =
    trackLower.includes("אג") || trackLower.includes("שקלי") || trackLower.includes("שמרני");
  const isEquity =
    trackLower.includes("מניות") ||
    trackLower.includes("מנייתי") ||
    trackLower.includes("s&p") ||
    trackLower.includes("נאסדק");

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
  company: "",
  type: "pension",
  balance: 0,
  mgmtFeeDeposit: 0,
  mgmtFeeBalance: 0,
  track: "",
  monthlyContrib: 0,
  owner: "spouse_a",
};

/** Read spouse names from onboarding fields (fallback labels if blank). */
function loadSpouseNames(): { a: string; b: string; hasB: boolean } {
  if (typeof window === "undefined") return { a: "בן זוג א'", b: "בן זוג ב'", hasB: false };
  try {
    // 2026-05-24 — scoped-only. The legacy unscoped fallback leaked the
    // previous client's spouse names into a freshly-opened household's
    // pension view. usePersistedState now scopes onboarding writes, so the
    // scoped key is populated on the form side too.
    const raw = localStorage.getItem(scopedKey("verdant:onboarding:fields"));
    if (!raw) return { a: "בן זוג א'", b: "בן זוג ב'", hasB: false };
    const f = JSON.parse(raw) as Record<string, string>;
    const a = (f.p1_name || "").trim() || "בן זוג א'";
    const b = (f.p2_name || "").trim() || "בן זוג ב'";
    const hasB = !!(f.p2_name && f.p2_name.trim());
    return { a, b, hasB };
  } catch {
    return { a: "בן זוג א'", b: "בן זוג ב'", hasB: false };
  }
}

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

  /* Allocation-chart fund filter — multi-select (empty = whole portfolio) */
  const [allocFundIds, setAllocFundIds] = useState<string[]>([]);
  const [allocModalOpen, setAllocModalOpen] = useState(false);

  /* Inline liquidity-date editor (per hishtalmut fund) */
  const [editingLiquidityId, setEditingLiquidityId] = useState<string | null>(null);
  const [liquidityDraft, setLiquidityDraft] = useState<string>("");

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
  // Per-fund simulation modal — pops on row "סימולציה" click.
  const [simFundId, setSimFundId] = useState<string | null>(null);
  // Accordion: which fund is expanded? null = all collapsed.
  const [expandedFundId, setExpandedFundId] = useState<string | null>(null);

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
    return data.filter((d) => d.pct > 0);
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
    const labels: Record<string, string> = {
      equity: "מניות",
      bonds: "אג״ח",
      cash: "מזומן",
      alternative: "אלטרנטיבי",
    };
    const colors: Record<string, string> = {
      equity: "#2C7A5A",
      bonds: "#0EA5E9",
      cash: "#9CA3AF",
      alternative: "#D97706",
    };
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
    const handler = () => setSalaryTick((t) => t + 1);
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
    const atCurrent = section45and47Benefit(
      currentVoluntaryMonthly,
      profile.monthlyGross,
      br.marginalBracket
    );
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
    const fundsWithInsurance = funds.filter((f) => f.insuranceCover);
    if (fundsWithInsurance.length < 2) return null;

    const deathCovers = fundsWithInsurance.filter((f) => f.insuranceCover?.death);
    const disabilityCovers = fundsWithInsurance.filter((f) => f.insuranceCover?.disability);
    const lowCovers = fundsWithInsurance.filter((f) => f.insuranceCover?.lossOfWork);

    const duplicates: { type: string; label: string; funds: string[]; estimatedWaste: number }[] =
      [];
    if (deathCovers.length > 1)
      duplicates.push({
        type: "death",
        label: "ביטוח חיים (מוות)",
        funds: deathCovers.map((f) => f.company),
        estimatedWaste: 80,
      });
    if (disabilityCovers.length > 1)
      duplicates.push({
        type: "disability",
        label: "אובדן כושר עבודה",
        funds: disabilityCovers.map((f) => f.company),
        estimatedWaste: 120,
      });
    if (lowCovers.length > 1)
      duplicates.push({
        type: "low",
        label: "פיצוי אבטלה",
        funds: lowCovers.map((f) => f.company),
        estimatedWaste: 60,
      });

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
    <div className="mx-auto max-w-6xl">
      {/* ===== 1. PageHeader ===== */}
      <PageHeader
        subtitle="ניהול נתונים"
        title="פנסיה והשקעות"
        description={`צבירה כוללת: ${fmtILS(totalFundsBalance)}`}
      />
      <div className="-mt-4 mb-3 flex min-h-[18px] justify-end">
        <SaveStatus status={saveStatus} />
      </div>

      {/* Cross-link to /retirement removed 2026-04-29 — pages merged. */}

      {/* ===== 3. KPI Row (3 portfolio-level metrics) ===== */}
      <section data-pension-summary className="mb-3 grid scroll-mt-24 grid-cols-1 gap-3 md:grid-cols-3">
        <SolidKpi
          label="צבירה פנסיונית"
          value={fmtILS(totalFundsBalance)}
          icon="savings"
          tone="forest"
        />
        <SolidKpi
          label="הפקדה חודשית"
          value={fmtILS(baseMonthlyContrib)}
          icon="calendar_month"
          tone="emerald"
        />
        <SolidKpi
          label="דמי ניהול ממוצעים"
          value={`${weightedFee.toFixed(2)}%`}
          icon="percent"
          tone={
            feeBenchmark(weightedFee).color === "#DC2626"
              ? "red"
              : feeBenchmark(weightedFee).color === "#2C7A5A"
                ? "emerald"
                : "amber"
          }
          sub={feeBenchmark(weightedFee).label}
        />
      </section>

      {/* ===== 3b. Per-spouse summary — 2026-04-28 per Nir ===== */}
      {funds.length > 0 &&
        (() => {
          const names = loadSpouseNames();
          const aTotal = funds
            .filter((f) => (f.owner || "spouse_a") === "spouse_a")
            .reduce((s, f) => s + f.balance, 0);
          const bTotal = funds
            .filter((f) => f.owner === "spouse_b")
            .reduce((s, f) => s + f.balance, 0);
          const jointTotal = funds
            .filter((f) => f.owner === "joint")
            .reduce((s, f) => s + f.balance, 0);
          if (!names.hasB && bTotal === 0 && jointTotal === 0) return null;
          return (
            <section
              className={`grid grid-cols-1 sm:grid-cols-2 ${jointTotal > 0 ? "lg:grid-cols-3" : ""} mb-6 gap-3`}
            >
              <SolidKpi
                label={`כמה יש ל${names.a}`}
                value={fmtILS(aTotal)}
                icon="person"
                tone="forest"
              />
              <SolidKpi
                label={`כמה יש ל${names.b}`}
                value={fmtILS(bTotal)}
                icon="person"
                tone="emerald"
              />
              {jointTotal > 0 && (
                <SolidKpi label="משותף" value={fmtILS(jointTotal)} icon="people" tone="ink" />
              )}
            </section>
          );
        })()}

      {/* ===== 4. Allocation Pies — report-only cuts ===== */}
      {funds.length > 0 &&
        (() => {
          const typeLabels: Record<PensionFund["type"], string> = {
            pension: "פנסיה",
            hishtalmut: "השתלמות",
            gemel: "גמל",
            bituach: "ביטוח מנהלים",
          };
          const fundLabel = (f: PensionFund) => {
            const acct = f.annualReportDetails?.accountNumber;
            return `${f.company} · ${typeLabels[f.type]}${acct ? ` · ${acct}` : ""}`;
          };
          // Drop any stale ids (funds deleted after being picked). Empty = all.
          const selectedIds = allocFundIds.filter((id) => funds.some((f) => f.id === id));
          const shownFunds = selectedIds.length ? funds.filter((f) => selectedIds.includes(f.id)) : funds;
          const alloc = buildPensionAllocations(shownFunds);
          const toggleFund = (id: string) =>
            setAllocFundIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            );
          const triggerLabel = selectedIds.length
            ? `${selectedIds.length} קרנות נבחרו`
            : `כל הקרנות (${funds.length})`;
          return (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <span className="text-[11px] font-bold text-verdant-muted">הצג ניתוח עבור</span>
                <button
                  type="button"
                  onClick={() => setAllocModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink transition-all hover:opacity-80"
                  style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
                >
                  <span className="material-symbols-outlined text-[16px]">filter_list</span>
                  {triggerLabel}
                </button>
              </div>

              <Modal
                open={allocModalOpen}
                title="בחירת קרנות לניתוח"
                onClose={() => setAllocModalOpen(false)}
              >
                <div className="space-y-3" dir="rtl">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-verdant-muted">
                      {selectedIds.length
                        ? `${selectedIds.length} מתוך ${funds.length} קרנות`
                        : "כל הקרנות מוצגות"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAllocFundIds(funds.map((f) => f.id))}
                        className="rounded-md border px-2 py-1 text-[11px] font-bold text-verdant-ink hover:opacity-80"
                        style={{ borderColor: "#E5E7EB" }}
                      >
                        בחר הכל
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllocFundIds([])}
                        className="rounded-md border px-2 py-1 text-[11px] font-bold text-verdant-ink hover:opacity-80"
                        style={{ borderColor: "#E5E7EB" }}
                      >
                        נקה
                      </button>
                    </div>
                  </div>

                  <ul className="max-h-80 space-y-1.5 overflow-y-auto">
                    {funds.map((f) => {
                      const checked = selectedIds.includes(f.id);
                      return (
                        <li key={f.id}>
                          <label
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all hover:bg-[#FAFAF7]"
                            style={{ borderColor: checked ? "#2B694D" : "#E5E7EB" }}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFund(f.id)}
                                className="h-4 w-4 shrink-0 accent-[#2B694D]"
                              />
                              <span className="truncate text-xs font-bold text-verdant-ink">
                                {fundLabel(f)}
                              </span>
                            </div>
                            <span className="shrink-0 text-[11px] tabular-nums text-verdant-muted">
                              {fmtILS(f.balance)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex justify-end border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
                    <button
                      type="button"
                      onClick={() => setAllocModalOpen(false)}
                      className="btn-botanical !px-4 !py-1.5 text-xs"
                    >
                      הצג ניתוח
                    </button>
                  </div>
                </div>
              </Modal>
              <section
                id="pension-graphs"
                className="mb-3 grid scroll-mt-24 grid-cols-1 gap-4 md:grid-cols-2"
              >
                <AllocationPie
                  title="לפי סוג קופה"
                  slices={alloc.byType}
                  size="md"
                  tooltipForSlice={(s) => {
                    return `${s.label}: ${fmtILS(s.value)} (${s.pct.toFixed(1)}% מהתיק)`;
                  }}
                />
                <AllocationPie
                  title="לפי מסלול השקעה"
                  slices={alloc.byTrack}
                  size="md"
                  emptyHint="אין פירוט מסלולי השקעה בדוח שהועלה"
                />
              </section>
            </>
          );
        })()}

      {/* ===== 5. Pension Funds Table (CRUD + insurance alert + summary) ===== */}
      <section className="v-card mb-6 overflow-hidden">
        <div className="v-divider flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-extrabold text-verdant-ink">קרנות פנסיה וחיסכון</h2>
            <p className="mt-0.5 text-[11px] text-verdant-muted">
              {funds.length} קרנות · מעודכן מהמסלקה הפנסיונית
            </p>
          </div>
          <button
            onClick={() => {
              setEditingFund(null);
              setShowAddForm(true);
            }}
            className="btn-botanical !px-3 !py-1.5 text-xs"
          >
            + הוסף קרן
          </button>
        </div>

        {/* Insurance duplication alert */}
        {insuranceDuplication && (
          <div
            className="mx-5 mt-3 flex items-center gap-2 rounded-lg p-3 text-xs"
            style={{ background: "rgba(217,119,6,0.12)", border: "1px solid #f59e0b" }}
          >
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#D97706" }}>
              warning
            </span>
            <span className="font-bold" style={{ color: "#92400e" }}>
              זוהו כיסויים כפולים ({insuranceDuplication.map((d) => d.label).join(", ")}) — בזבוז
              משוער: ₪
              {(insuranceDuplication.reduce((s, d) => s + d.estimatedWaste, 0) * 12).toLocaleString(
                "he-IL"
              )}
              /שנה
            </span>
          </div>
        )}

        {/* Guaranteed factor alert */}
        {funds.some(
          (f) =>
            f.subtype === "bituach_classic" ||
            f.subtype === "bituach_adif" ||
            f.subtype === "pension_vatika"
        ) && (
          <div
            className="mx-5 mt-2 flex items-start gap-2 rounded-lg p-3 text-xs"
            style={{ background: "rgba(217,119,6,0.12)", border: "1px solid #f59e0b" }}
          >
            <span
              className="material-symbols-outlined mt-0.5 text-[16px]"
              style={{ color: "#D97706" }}
            >
              lock
            </span>
            <div>
              <span className="font-bold" style={{ color: "#92400e" }}>
                זוהו קרנות עם מקדם מובטח —{" "}
              </span>
              <span style={{ color: "#78350f" }}>
                פוליסות ישנות עם מקדם מובטח הן נכס נדיר. לעולם אין להעביר, לסגור, או לאחד אותן עם
                קרנות אחרות. מקדם נמוך = קצבה גבוהה יותר בפרישה.
              </span>
            </div>
          </div>
        )}

        {/* Add / Edit Form */}
        {(showAddForm || editingFund) && (
          <FundForm
            initial={
              editingFund
                ? (funds.find((f) => f.id === editingFund) ?? { ...EMPTY_FUND, id: "" })
                : { ...EMPTY_FUND, id: "" }
            }
            onSave={handleSaveFund}
            onCancel={() => {
              setEditingFund(null);
              setShowAddForm(false);
            }}
          />
        )}

        {/* Empty state */}
        {funds.length === 0 && !showAddForm && !editingFund && (
          <div className="px-6 py-12 text-center">
            <span
              className="material-symbols-outlined mb-3 text-[48px] text-verdant-muted"
              style={{ display: "inline-block" }}
            >
              account_balance
            </span>
            <h3 className="mb-1 text-base font-extrabold text-verdant-ink">עדיין לא נוספו קרנות</h3>
            <p className="mb-4 text-xs text-verdant-muted">העלה דוח שנתי או הוסף ידנית.</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => {
                  setEditingFund(null);
                  setShowAddForm(true);
                }}
                className="btn-botanical !px-4 !py-2 text-xs"
              >
                + הוסף קרן ידנית
              </button>
              <button
                onClick={() => {
                  document
                    .getElementById("annual-upload")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="v-divider rounded-lg border px-4 py-2 text-xs font-bold text-verdant-ink transition-colors hover:bg-[#FAFAF7]"
              >
                העלה דיוור שנתי (PDF)
              </button>
            </div>
          </div>
        )}

        {/* Grouped rows */}
        {funds.length > 0 &&
          Object.entries(fundsByType).map(([type, typeFunds]) => (
            <div key={type}>
              <div
                className="flex items-center gap-2 px-5 py-2.5"
                style={{ background: "#FAFAF7" }}
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: FUND_TYPE_COLORS[type] || "#2C7A5A" }}
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">
                  {FUND_TYPE_LABELS[type] || type}
                </span>
              </div>
              {typeFunds.map((f) => {
                const isExpanded = expandedFundId === f.id;
                return (
                  <div key={f.id} className="v-divider border-b">
                    {/* Collapsed row — clickable to expand. Always visible. */}
                    <button
                      onClick={() => setExpandedFundId(isExpanded ? null : f.id)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-right transition-colors hover:bg-[#FFFFFF]"
                    >
                      <span className="material-symbols-outlined text-[20px] text-verdant-muted">
                        {isExpanded ? "expand_less" : "expand_more"}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-sm font-extrabold text-verdant-ink">
                            {f.company}
                          </span>
                          <span
                            className="truncate text-[11px] text-verdant-muted"
                            title={f.track || undefined}
                          >
                            · {f.track || "—"}
                          </span>
                        </div>
                        <div className="shrink-0 text-sm font-extrabold tabular-nums text-verdant-ink">
                          {fmtILS(f.balance)}
                        </div>
                      </div>
                    </button>

                    {/* Expanded body — only when accordion open. */}
                    {isExpanded && (
                      <div className="bg-white px-5 pb-4 pt-1">
                        {/* Badges — only meaningful flags, no repeated name/balance */}
                        {(() => {
                          const badges: React.ReactNode[] = [];
                          if (f.insuranceCover)
                            badges.push(
                              <span
                                key="ins"
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                style={{ background: "#e0f2fe", color: "#0369a1" }}
                              >
                                כולל ביטוח
                              </span>
                            );
                          if (f.type === "hishtalmut") {
                            const explicit = f.liquidityDate || f.annualReportDetails?.liquidityDate;
                            let liqDate: Date | null = null;
                            if (explicit) liqDate = new Date(explicit);
                            else if (f.openingDate) {
                              const d = new Date(f.openingDate);
                              d.setFullYear(d.getFullYear() + (f.isEmployed === false ? 3 : 6));
                              liqDate = d;
                            }
                            if (liqDate) {
                              const isLiq = new Date() >= liqDate;
                              badges.push(
                                <span
                                  key="liq"
                                  className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                  style={{
                                    background: isLiq ? "#dcfce7" : "#fef9c3",
                                    color: isLiq ? "#166534" : "#854d0e",
                                  }}
                                >
                                  {isLiq ? "נזילה ✓" : `נזילה ${liqDate.toLocaleDateString("he-IL")}`}
                                </span>
                              );
                            }
                          }
                          if (
                            f.subtype === "bituach_classic" ||
                            f.subtype === "bituach_adif" ||
                            f.subtype === "pension_vatika"
                          )
                            badges.push(
                              <span
                                key="factor"
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                style={{ background: "rgba(217,119,6,0.12)", color: "#92400e" }}
                              >
                                מקדם מובטח{f.conversionFactor ? ` (${f.conversionFactor})` : ""}
                              </span>
                            );
                          if (f.guaranteedRate != null && f.guaranteedRate > 0)
                            badges.push(
                              <span
                                key="rate"
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                style={{ background: "#e0f2fe", color: "#0369a1" }}
                              >
                                ריבית מובטחת {f.guaranteedRate}%
                              </span>
                            );
                          return badges.length ? (
                            <div className="mb-3 flex flex-wrap items-center gap-1.5">{badges}</div>
                          ) : null;
                        })()}

                        {/* Scannable detail grid — label above value, evenly spaced */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
                          <div>
                            <div className="text-[10px] font-bold text-verdant-muted">מסלול</div>
                            <div className="mt-0.5 text-xs font-extrabold text-verdant-ink">
                              {f.subtype && SUBTYPE_LABELS[f.subtype] && (
                                <span className="text-verdant-emerald">
                                  {SUBTYPE_LABELS[f.subtype]} ·{" "}
                                </span>
                              )}
                              {f.track || "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-verdant-muted">
                              הפקדה חודשית
                            </div>
                            <div className="tabular mt-0.5 text-xs font-extrabold text-verdant-ink">
                              {fmtILS(f.monthlyContrib)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-verdant-muted">דמי ניהול</div>
                            <div
                              className="tabular mt-0.5 text-xs font-extrabold"
                              style={{ color: feeBenchmark(f.mgmtFeeBalance).color }}
                            >
                              {f.mgmtFeeBalance}% צבירה · {f.mgmtFeeDeposit}% הפקדה
                              <span className="mr-1 text-[9px]">
                                ({feeBenchmark(f.mgmtFeeBalance).label})
                              </span>
                            </div>
                          </div>
                          {f.annualReportDetails?.accountNumber && (
                            <div>
                              <div className="text-[10px] font-bold text-verdant-muted">
                                מספר חשבון
                              </div>
                              <div className="tabular mt-0.5 text-xs font-extrabold text-verdant-ink">
                                {f.annualReportDetails.accountNumber}
                              </div>
                            </div>
                          )}
                        </div>

                        {(() => {
                          const alert = trackAlert(f, currentAge);
                          if (!alert) return null;
                          return (
                            <div
                              className="mt-2 flex items-center gap-1 text-[10px] font-bold"
                              style={{ color: "#b45309" }}
                            >
                              <span className="material-symbols-outlined text-[12px]">info</span>
                              {alert}
                            </div>
                          );
                        })()}

                        {/* Actions — grouped at the bottom, out of the data's way */}
                        <div className="mt-3 flex justify-end gap-1.5">
                          <button
                            onClick={() => setSimFundId(f.id)}
                            title="סימולציה — what if על הקופה הזו"
                            className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold hover:bg-[#FAFAF7]"
                            style={{ color: "#2C7A5A", borderColor: "#E5E7EB" }}
                          >
                            <span className="material-symbols-outlined text-[16px]">tune</span>
                            סימולציה
                          </button>
                          <button
                            onClick={() => {
                              setShowAddForm(false);
                              setEditingFund(f.id);
                            }}
                            title="עריכה"
                            className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold text-verdant-muted hover:bg-[#FAFAF7]"
                            style={{ borderColor: "#E5E7EB" }}
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                            עריכה
                          </button>
                          <button
                            onClick={() => handleDeleteFund(f.id)}
                            title="מחיקת קופה"
                            className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                            מחק
                          </button>
                        </div>
                        {/* Multi-track drill-down — shown only when fund has tracks[]. */}
                        {f.tracks && f.tracks.length > 1 && (
                          <div className="v-divider mt-2 border-t pt-2">
                            <div className="mb-1.5 text-[10px] font-bold text-verdant-muted">
                              פילוח מסלולים ({f.tracks.length})
                            </div>
                            <div className="space-y-1">
                              {f.tracks.map((t, ti) => {
                                const pct = f.balance > 0 ? (t.balance / f.balance) * 100 : 0;
                                return (
                                  <div
                                    key={ti}
                                    className="flex items-center justify-between text-[11px]"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span
                                        className={`h-2 w-2 shrink-0 rounded-sm ${t.registeredFundId ? "" : "ring-1 ring-amber-400"}`}
                                        style={{
                                          background: t.registeredFundId ? "#2C7A5A" : "#D97706",
                                        }}
                                      />
                                      <span className="truncate text-verdant-ink">{t.name}</span>
                                      {!t.registeredFundId && (
                                        <span className="text-[9px] font-bold text-amber-700">
                                          לא מזוהה
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className="tabular text-[10px] text-verdant-muted">
                                        {fmtILS(t.balance)}
                                      </span>
                                      <span className="tabular w-10 text-left font-bold text-verdant-ink">
                                        {Math.round(pct)}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

        {/* Summary row */}
        {funds.length > 0 && (
          <div
            className="v-divider flex items-center justify-between border-t-2 px-5 py-3.5"
            style={{ background: "#FAFAF7" }}
          >
            <div className="text-sm font-extrabold text-verdant-ink">סה״כ</div>
            <div className="flex items-center gap-6">
              <div className="text-left">
                <div className="text-[10px] font-bold text-verdant-muted">הפקדה חודשית</div>
                <div className="tabular text-sm font-extrabold text-verdant-emerald">
                  {fmtILS(baseMonthlyContrib)}
                </div>
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold text-verdant-muted">דמ&quot;נ ממוצע</div>
                <div
                  className="tabular text-sm font-extrabold"
                  style={{ color: feeBenchmark(weightedFee).color }}
                >
                  {weightedFee.toFixed(2)}%
                </div>
              </div>
              <div className="min-w-[100px] text-left">
                <div className="text-[10px] font-bold text-verdant-muted">צבירה כוללת</div>
                <div className="tabular text-sm font-extrabold text-verdant-ink">
                  {fmtILS(totalFundsBalance)}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===== 6. Keren Hishtalmut Insights ===== */}
      {(() => {
        const hishtalmutFunds = funds.filter((f) => f.type === "hishtalmut");
        if (hishtalmutFunds.length === 0) return null;

        const totalHishtalmut = hishtalmutFunds.reduce((s, f) => s + f.balance, 0);
        const today = new Date();

        const insights = hishtalmutFunds.map((f) => {
          const vestingYears = f.isEmployed === false ? 3 : 6;
          let liquidityDate: Date | null = null;
          let isLiquid = false;
          let yearsLeft = 0;
          let monthsLeft = 0;

          // Priority: manual override → date from the report → computed from
          // opening date + vesting period.
          const explicit = f.liquidityDate || f.annualReportDetails?.liquidityDate;
          // "fromReport" only when the explicit value came from the report and
          // wasn't manually overridden — used to show the source hint.
          const liquiditySource: "manual" | "report" | "computed" | "none" = f.liquidityDate
            ? "manual"
            : f.annualReportDetails?.liquidityDate
              ? "report"
              : f.openingDate
                ? "computed"
                : "none";

          if (explicit) {
            liquidityDate = new Date(explicit);
          } else if (f.openingDate) {
            const openDate = new Date(f.openingDate);
            liquidityDate = new Date(openDate);
            liquidityDate.setFullYear(liquidityDate.getFullYear() + vestingYears);
          }

          if (liquidityDate) {
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

          return {
            fund: f,
            vestingYears,
            liquidityDate,
            liquiditySource,
            isLiquid,
            yearsLeft,
            monthsLeft,
            projectedIn5,
            projectedIn10,
          };
        });

        return (
          <section className="v-card mb-6 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4" style={{ background: "#FAFAF7" }}>
              <span className="material-symbols-outlined text-[18px]" style={{ color: "#059669" }}>
                school
              </span>
              <div>
                <div className="caption mb-0.5">קרן השתלמות</div>
                <h3 className="text-sm font-extrabold text-verdant-ink">
                  סה״כ {fmtILS(totalHishtalmut)} ·{" "}
                  {hishtalmutFunds.length === 1 ? "קרן אחת" : `${hishtalmutFunds.length} קרנות`}
                </h3>
              </div>
            </div>

            {insights.map(
              ({
                fund: f,
                vestingYears,
                liquidityDate,
                liquiditySource,
                isLiquid,
                yearsLeft,
                monthsLeft,
                projectedIn5,
                projectedIn10,
              }) => (
                <div key={f.id} className="v-divider border-b px-5 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-extrabold text-verdant-ink">{f.company}</div>
                    <div className="tabular text-sm font-extrabold text-verdant-ink">
                      {fmtILS(f.balance)}
                    </div>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {f.openingDate && (
                      <div className="rounded-lg p-2.5" style={{ background: "#FAFAF7" }}>
                        <div className="text-[10px] font-bold text-verdant-muted">תאריך פתיחה</div>
                        <div className="mt-0.5 text-xs font-extrabold text-verdant-ink">
                          {new Date(f.openingDate).toLocaleDateString("he-IL")}
                        </div>
                      </div>
                    )}
                    <div
                      className={`rounded-lg p-2.5 ${f.openingDate ? "" : "col-span-2"}`}
                      style={{
                        background:
                          liquiditySource === "none"
                            ? "rgba(217,119,6,0.08)"
                            : isLiquid
                              ? "#FAFAF7"
                              : "rgba(217,119,6,0.08)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-[10px] font-bold text-verdant-muted">
                          מועד נזילות
                          {liquiditySource === "manual" && " (הוגדר ידנית)"}
                          {liquiditySource === "report" && " (מהדוח)"}
                          {liquiditySource === "computed" &&
                            ` (${vestingYears} שנים · ${f.isEmployed === false ? "עצמאי" : "שכיר"})`}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLiquidityId(f.id);
                            setLiquidityDraft(
                              (liquiditySource !== "computed" && liquidityDate
                                ? liquidityDate.toISOString().slice(0, 10)
                                : f.liquidityDate) || ""
                            );
                          }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:opacity-70"
                          title="ערוך מועד נזילות"
                          style={{ color: "#6B7280" }}
                        >
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                        </button>
                      </div>

                      {editingLiquidityId === f.id ? (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input
                            type="date"
                            value={liquidityDraft}
                            onChange={(e) => setLiquidityDraft(e.target.value)}
                            className="min-w-0 flex-1 rounded border px-1.5 py-1 text-[11px] font-bold text-verdant-ink"
                            style={{ borderColor: "#E5E7EB" }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              updateFundInStore(f.id, { liquidityDate: liquidityDraft || undefined });
                              setFunds(loadPensionFunds());
                              setEditingLiquidityId(null);
                            }}
                            className="shrink-0 rounded bg-[#2B694D] px-1.5 py-1 text-[11px] font-bold text-white hover:opacity-80"
                            title="שמור"
                          >
                            <span className="material-symbols-outlined text-[14px]">check</span>
                          </button>
                          {f.liquidityDate && (
                            <button
                              type="button"
                              onClick={() => {
                                updateFundInStore(f.id, { liquidityDate: undefined });
                                setFunds(loadPensionFunds());
                                setEditingLiquidityId(null);
                              }}
                              className="shrink-0 rounded border px-1.5 py-1 text-[11px] font-bold text-verdant-muted hover:opacity-80"
                              style={{ borderColor: "#E5E7EB" }}
                              title="אפס לערך מהדוח/מחושב"
                            >
                              <span className="material-symbols-outlined text-[14px]">undo</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingLiquidityId(null)}
                            className="shrink-0 rounded border px-1.5 py-1 text-[11px] font-bold text-verdant-muted hover:opacity-80"
                            style={{ borderColor: "#E5E7EB" }}
                            title="ביטול"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>
                      ) : liquiditySource === "none" ? (
                        <div
                          className="mt-0.5 flex items-center gap-1 text-[11px] font-bold"
                          style={{ color: "#92400e" }}
                        >
                          <span className="material-symbols-outlined text-[14px]">info</span>
                          לא זוהה — לחץ לעריכה כדי להגדיר
                        </div>
                      ) : isLiquid ? (
                        <div className="mt-0.5 text-xs font-extrabold" style={{ color: "#2C7A5A" }}>
                          נזילה ✓ ({liquidityDate?.toLocaleDateString("he-IL")})
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs font-extrabold" style={{ color: "#92400e" }}>
                          {liquidityDate ? liquidityDate.toLocaleDateString("he-IL") : "—"}
                          {yearsLeft > 0 && ` (${yearsLeft} שנים`}
                          {yearsLeft > 0 && monthsLeft > 0 && ` ו-${monthsLeft} חודשים`}
                          {yearsLeft === 0 && monthsLeft > 0 && ` (${monthsLeft} חודשים`}
                          {(yearsLeft > 0 || monthsLeft > 0) && ")"}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg p-2.5" style={{ background: "#FAFAF7" }}>
                      <div className="text-[10px] font-bold text-verdant-muted">צפי עוד 5 שנים</div>
                      <div className="tabular mt-0.5 text-xs font-extrabold text-verdant-ink">
                        {fmtILS(projectedIn5)}
                      </div>
                    </div>
                    <div className="rounded-lg p-2.5" style={{ background: "#FAFAF7" }}>
                      <div className="text-[10px] font-bold text-verdant-muted">
                        צפי עוד 10 שנים
                      </div>
                      <div className="tabular mt-0.5 text-xs font-extrabold text-verdant-ink">
                        {fmtILS(projectedIn10)}
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-lg border p-3 text-right"
                    style={{ background: "#FAFAF7", borderColor: "#d1e7c8" }}
                  >
                    {isLiquid ? (
                      <div className="text-[12px] font-bold text-verdant-ink">
                        ✓ נזילה — ב-5 שנים נוספות תגדל ל-{fmtILS(projectedIn5)} פטור ממס. עדיף
                        להשאיר.
                      </div>
                    ) : f.openingDate ? (
                      <div className="text-[12px] font-bold text-verdant-ink">
                        תיפתח ב-{liquidityDate?.toLocaleDateString("he-IL")} · "כסף אחרון" — לא
                        לגעת.
                      </div>
                    ) : (
                      <div className="text-[12px] font-bold text-verdant-ink">
                        "כסף אחרון" — פטור ממס. הוסף תאריך פתיחה לתכנון נזילות.
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </section>
        );
      })()}

      {/* ===== 7. Section 45א + 47 — Voluntary contribution benefit ===== */}
      {voluntaryBenefit && (
        <div className="card-pad mb-6" style={{ borderInlineStart: "4px solid #059669" }}>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined flex-shrink-0 text-[22px] text-verdant-emerald">
              savings
            </span>
            <div className="min-w-0 flex-1">
              <div className="caption mb-1">הטבת מס על הפקדה וולונטרית</div>
              <h3 className="mb-2 text-sm font-extrabold text-verdant-ink">
                אתה מפסיד כ-{fmtILS(voluntaryBenefit.gap)} בשנה
              </h3>
              <p className="text-[12px] leading-6 text-verdant-muted">
                הפקדה וולונטרית נוספת לפנסיה/ביטוח חיים מזכה ב-<b>זיכוי 35%</b> (סעיף 45א) וב-
                <b>ניכוי 11%</b> (סעיף 47). היום אתה מפקיד וולונטרית{" "}
                {fmtILS(voluntaryBenefit.currentMonthly)}/חודש (הטבה שנתית:{" "}
                {fmtILS(voluntaryBenefit.currentBenefit)}). מיצוי התקרה של{" "}
                {fmtILS(voluntaryBenefit.maxMonthly)}/חודש יעלה את ההטבה ל-
                {fmtILS(voluntaryBenefit.maxBenefit)}/שנה.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 8. Study fund above-cap warning ===== */}
      {studyFundWarning && (
        <div className="card-pad mb-6" style={{ borderInlineStart: "4px solid #DC2626" }}>
          <div className="flex items-start gap-3">
            <span
              className="material-symbols-outlined flex-shrink-0 text-[22px]"
              style={{ color: "#DC2626" }}
            >
              warning
            </span>
            <div className="min-w-0 flex-1">
              <div className="caption mb-1">זקיפת שווי — קרן השתלמות מעל התקרה</div>
              <h3 className="mb-2 text-sm font-extrabold text-verdant-ink">
                אתה משלם כ-{fmtILS(studyFundWarning.totalMonthlyCost)}/חודש מס על חלק המעסיק שמעל{" "}
                {fmtILS(studyFundWarning.cap)}
              </h3>
              <p className="text-[12px] leading-6 text-verdant-muted">
                השכר שלך מעל תקרת ההטבה ({fmtILS(studyFundWarning.cap)}). חלק המעסיק שמעל התקרה — כ-
                {fmtILS(studyFundWarning.excessEmployerMonthly)}/חודש — נזקף כהכנסה חייבת, ומחייב
                אותך במס שולי ({studyFundWarning.marginalPct}%) וגם בביטוח לאומי ובריאות (~12% ·{" "}
                {fmtILS(studyFundWarning.blTaxMonthly)}/חודש). עלות שנתית כוללת:
                <b> {fmtILS(studyFundWarning.fringeTaxAnnual)}</b>. שקול להגביל את הפקדת המעסיק
                לתקרה, או להפנות את העודף לקופת גמל להשקעה.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 9. Annual Report (PDF) Upload ===== */}
      <div id="annual-upload" className="mt-6 scroll-mt-20">
        <AnnualReportUpload />
      </div>

      {/* Per-fund simulation modal — opens on row "סימולציה" click. */}
      {simFundId &&
        (() => {
          const f = funds.find((x) => x.id === simFundId);
          if (!f) return null;
          return <FundSimulationModal fund={f} onClose={() => setSimFundId(null)} />;
        })()}
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*              MiniDonut — SVG Donut Chart              */
/* ══════════════════════════════════════════════════════ */

function MiniDonut({
  data,
  size = 140,
}: {
  data: { label: string; pct: number; color: string }[];
  size?: number;
}) {
  const r = 50,
    cx = 60,
    cy = 60;
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
              fill={d.color}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          );
        })}
        <circle cx={cx} cy={cy} r="28" fill="#FFFFFF" />
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="text-[11px] font-bold text-verdant-ink">{d.label}</span>
            <span className="tabular text-[11px] font-bold text-verdant-muted">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
/*              FundForm — Add / Edit Modal              */
/* ══════════════════════════════════════════════════════ */

function FundForm({
  initial,
  onSave,
  onCancel,
}: {
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
  const set = (patch: Partial<PensionFund>) => setForm((prev) => ({ ...prev, ...patch }));

  const providerFunds = provider ? getFundsByProvider(provider) : [];
  const selectedFund: RegisteredFund | undefined = selectedFundId
    ? getFundById(selectedFundId)
    : undefined;

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
    <div className="v-divider border-b px-5 py-4" style={{ background: "#FFFFFF" }}>
      {/* Row 1: Registry selection */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">חברה מנהלת</label>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setSelectedFundId("");
            }}
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
          >
            <option value="">בחר חברה</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">מסלול השקעה</label>
          <select
            value={selectedFundId}
            onChange={(e) => handleFundSelect(e.target.value)}
            disabled={!provider}
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: provider ? "#FFFFFF" : "#FAFAF7" }}
          >
            <option value="">בחר מסלול</option>
            {providerFunds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} — {f.equityExposure}% מניות · דמ&quot;נ {f.mgmtFee}%
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">סוג</label>
          <select
            value={form.type}
            onChange={(e) =>
              set({ type: e.target.value as PensionFund["type"], subtype: undefined })
            }
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
          >
            <option value="pension">פנסיה מקיפה</option>
            <option value="gemel">קופת גמל</option>
            <option value="hishtalmut">קרן השתלמות</option>
            <option value="bituach">ביטוח מנהלים</option>
          </select>
        </div>
        {/* Ownership selector — drives the per-spouse summary on the page. */}
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">בעלות</label>
          <select
            value={form.owner || "spouse_a"}
            onChange={(e) => set({ owner: e.target.value as PensionFund["owner"] })}
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
          >
            {(() => {
              const names = loadSpouseNames();
              return (
                <>
                  <option value="spouse_a">{names.a}</option>
                  {names.hasB && <option value="spouse_b">{names.b}</option>}
                  {names.hasB && <option value="joint">משותף</option>}
                </>
              );
            })()}
          </select>
        </div>
      </div>

      {/* Subtype + conversion factor + guaranteed rate */}
      {(SUBTYPES_BY_TYPE[form.type]?.length ?? 0) > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">תת-סוג</label>
            <select
              value={form.subtype || ""}
              onChange={(e) =>
                set({ subtype: (e.target.value || undefined) as PensionFund["subtype"] })
              }
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
              style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            >
              <option value="">לא צוין</option>
              {SUBTYPES_BY_TYPE[form.type]?.map((st) => (
                <option key={st} value={st}>
                  {SUBTYPE_LABELS[st]}
                </option>
              ))}
            </select>
          </div>

          {(form.subtype === "pension_vatika" ||
            form.subtype === "bituach_classic" ||
            form.subtype === "bituach_adif") && (
            <div>
              <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                מקדם קצבה
              </label>
              <input
                type="number"
                step="1"
                value={form.conversionFactor || ""}
                onChange={(e) => set({ conversionFactor: +e.target.value || undefined })}
                className="tabular w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
                style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
                placeholder="לדוג' 120"
              />
            </div>
          )}

          {form.subtype === "bituach_classic" && (
            <div>
              <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                ריבית מובטחת %
              </label>
              <input
                type="number"
                step="0.1"
                value={form.guaranteedRate || ""}
                onChange={(e) => set({ guaranteedRate: +e.target.value || undefined })}
                className="tabular w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
                style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
                placeholder="לדוג' 4.0"
              />
            </div>
          )}
        </div>
      )}

      {/* Selected fund summary */}
      {selectedFund && (
        <div className="mb-3 rounded-lg p-3" style={{ background: "#FAFAF7" }}>
          <div className="mb-1 text-[10px] font-bold text-verdant-muted">אלוקציה אוטומטית:</div>
          <div className="grid grid-cols-2 gap-1 text-[11px] font-bold text-verdant-ink md:grid-cols-4">
            <span>מניות: {selectedFund.equityExposure}%</span>
            <span>חו&quot;ל: {selectedFund.foreignExposure}%</span>
            <span>חשיפה למט&quot;ח: {selectedFund.currencyExposure}%</span>
            <span>דמ&quot;נ: {selectedFund.mgmtFee}%</span>
          </div>
        </div>
      )}

      {/* Row 2: Core fields */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
            חברה (שם חופשי)
          </label>
          <input
            type="text"
            value={form.company}
            onChange={(e) => set({ company: e.target.value })}
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            placeholder={provider || "שם החברה"}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">יתרה</label>
          <input
            type="number"
            value={form.balance || ""}
            onChange={(e) => set({ balance: +e.target.value })}
            className="tabular w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            placeholder="₪"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
            הפקדה חודשית
          </label>
          <input
            type="number"
            value={form.monthlyContrib || ""}
            onChange={(e) => set({ monthlyContrib: +e.target.value })}
            className="tabular w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            placeholder="₪"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">מסלול</label>
          <input
            type="text"
            value={form.track}
            onChange={(e) => set({ track: e.target.value })}
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            placeholder="כללי / מניות / אג״ח"
          />
        </div>
      </div>

      {/* Hishtalmut-specific: opening date + employment status */}
      {form.type === "hishtalmut" && (
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
              תאריך פתיחה
            </label>
            <input
              type="date"
              value={form.openingDate || ""}
              onChange={(e) => set({ openingDate: e.target.value || undefined })}
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
              style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
              סטטוס תעסוקה
            </label>
            <select
              value={form.isEmployed === false ? "self" : "employed"}
              onChange={(e) => set({ isEmployed: e.target.value === "employed" })}
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
              style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            >
              <option value="employed">שכיר (נזילות 6 שנים)</option>
              <option value="self">עצמאי (נזילות 3 שנים)</option>
            </select>
          </div>
        </div>
      )}

      {/* Row 3: Fees + Insurance */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
            דמ&quot;נ הפקדה %
          </label>
          <input
            type="number"
            step="0.01"
            value={form.mgmtFeeDeposit || ""}
            onChange={(e) => set({ mgmtFeeDeposit: +e.target.value })}
            className="tabular w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
            דמ&quot;נ צבירה %
          </label>
          <input
            type="number"
            step="0.01"
            value={form.mgmtFeeBalance || ""}
            onChange={(e) => set({ mgmtFeeBalance: +e.target.value })}
            className="tabular w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold text-verdant-ink"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
            כיסויים ביטוחיים
          </label>
          <div className="mt-0.5 flex flex-wrap gap-2">
            {[
              { key: "death" as const, label: "מוות" },
              { key: "disability" as const, label: "נכות" },
              { key: "lossOfWork" as const, label: "אבטלה" },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-1 text-[10px] text-verdant-muted"
              >
                <input
                  type="checkbox"
                  checked={form.insuranceCover?.[key] ?? false}
                  onChange={(e) =>
                    set({
                      insuranceCover: {
                        death: form.insuranceCover?.death ?? false,
                        disability: form.insuranceCover?.disability ?? false,
                        lossOfWork: form.insuranceCover?.lossOfWork ?? false,
                        [key]: e.target.checked,
                      },
                    })
                  }
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
          className="btn-botanical !px-4 !py-1.5 text-xs"
        >
          {initial.id ? "עדכן" : "הוסף"}
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost !px-4 !py-1.5 text-xs">
          ביטול
        </button>
      </div>
    </div>
  );
}
