"use client";

import { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { SolidKpi } from "@/components/ui/SolidKpi";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { AnnualReportUpload } from "@/components/AnnualReportUpload";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { loadAssumptions, patchAssumptions, pensionAnnuityTax, section45and47Benefit, OLD_AGE_ALLOWANCE_DEFAULTS } from "@/lib/assumptions";
import { loadSalaryProfile, computeSalaryBreakdown, hasSavedSalaryProfile, STUDY_FUND_SALARY_CAP } from "@/lib/salary-engine";
import type { Assumptions } from "@/lib/assumptions";
import {
  loadPensionFunds, savePensionFunds, addPensionFund as addFundToStore,
  updatePensionFund as updateFundInStore, deletePensionFund as deleteFundFromStore,
  EVENT_NAME as PENSION_EVENT,
} from "@/lib/pension-store";
import type { PensionFund } from "@/lib/pension-store";
import { getFundById, getFundsByProvider, PROVIDERS } from "@/lib/fund-registry";
import type { RegisteredFund } from "@/lib/fund-registry";
import {
  loadScenarios, addScenario, deleteScenario, SCENARIOS_EVENT,
} from "@/lib/scenarios-store";
import type { Scenario } from "@/lib/scenarios-store";

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

export default function RetirementPage() {
  /* ── Save status indicator ── */
  const { status: saveStatus, pulse } = useSaveStatus();

  /* ── Assumptions ── */
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
  /* ── Simulation sliders ── */
  const [simRetireAge, setSimRetireAge] = useState<number | null>(null);
  const [simReturn, setSimReturn] = useState<number | null>(null);
  const [simInflation, setSimInflation] = useState<number | null>(null);
  const [simExtraContrib, setSimExtraContrib] = useState<number>(0); // ₪/month on top of current
  const [simMgmtFeeBalance, setSimMgmtFeeBalance] = useState<number | null>(null); // target % on balance
  const [simMgmtFeeDeposit, setSimMgmtFeeDeposit] = useState<number | null>(null); // target % on deposit

  /* ── תרחישי "מה אם" שמורים ── */
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioNameError, setScenarioNameError] = useState(false);

  useEffect(() => {
    const refresh = () => setScenarios(loadScenarios("pension"));
    refresh();
    window.addEventListener(SCENARIOS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SCENARIOS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const currentAge = assumptions?.currentAge ?? 42;
  const retireAge = simRetireAge ?? (assumptions?.retirementAge ?? 67);
  const yearsToRetire = Math.max(0, retireAge - currentAge);
  const annualReturn = (simReturn ?? ((assumptions?.expectedReturnPension ?? 0.05) * 100)) / 100;
  const inflRate = (simInflation ?? ((assumptions?.inflationRate ?? 0.025) * 100)) / 100;

  /* ── Aggregates ── */
  const totalFundsBalance = funds.reduce((s, f) => s + f.balance, 0);
  const baseMonthlyContrib = funds.reduce((s, f) => s + f.monthlyContrib, 0);
  const totalMonthlyContrib = baseMonthlyContrib + simExtraContrib;

  const weightedFee = useMemo(() => {
    if (totalFundsBalance === 0) return 0;
    return funds.reduce((s, f) => s + f.mgmtFeeBalance * f.balance, 0) / totalFundsBalance;
  }, [funds, totalFundsBalance]);

  const weightedFeeDeposit = useMemo(() => {
    if (baseMonthlyContrib === 0) return 0;
    return funds.reduce((s, f) => s + f.mgmtFeeDeposit * f.monthlyContrib, 0) / baseMonthlyContrib;
  }, [funds, baseMonthlyContrib]);

  // Effective slider values (fall back to current weighted averages)
  const targetFeeBalance = simMgmtFeeBalance ?? weightedFee;
  const targetFeeDeposit = simMgmtFeeDeposit ?? weightedFeeDeposit;

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
  }, [funds, fundsByType, totalFundsBalance]);

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

  /* ── Pension Simulation ──
     Runs a scenario with given levers and returns trajectory + payout numbers.
     Net return = gross return − mgmtFeeBalance. Effective monthly contrib is reduced
     by mgmtFeeDeposit (fee deducted before investing). */
  const runScenario = useMemo(() => {
    return (params: {
      years: number;
      grossReturn: number;   // decimal (e.g. 0.05)
      inflation: number;     // decimal
      monthlyContrib: number;
      feeBalancePct: number; // percent (e.g. 0.8 → 0.8%)
      feeDepositPct: number; // percent
    }) => {
      const { years, grossReturn, inflation, monthlyContrib, feeBalancePct, feeDepositPct } = params;
      const netReturn = grossReturn - feeBalancePct / 100;
      const effectiveMonthly = monthlyContrib * (1 - feeDepositPct / 100);

      const trajectory: { age: number; nominal: number; real: number }[] = [];
      let nominal = totalFundsBalance;
      let real = totalFundsBalance;
      for (let y = 0; y <= years; y++) {
        trajectory.push({ age: currentAge + y, nominal: Math.round(nominal), real: Math.round(real) });
        nominal = futureValue(nominal, effectiveMonthly, netReturn, 1);
        real = futureValue(real, effectiveMonthly, netReturn - inflation, 1);
      }

      const projectedNominal = trajectory[trajectory.length - 1]?.nominal ?? 0;
      const projectedReal = trajectory[trajectory.length - 1]?.real ?? 0;

      // Israeli pension payout: balance ÷ conversion factor (typical 200).
      const pensionTypeFunds = funds.filter(f => f.type === "pension" || f.type === "bituach");
      const pensionTypeBalance = pensionTypeFunds.reduce((s, f) => s + f.balance, 0);
      const weightedFactor = pensionTypeBalance > 0
        ? pensionTypeFunds.reduce((s, f) => s + (f.conversionFactor || 200) * f.balance, 0) / pensionTypeBalance
        : 200;
      const pensionShare = totalFundsBalance > 0 ? pensionTypeBalance / totalFundsBalance : 0;
      const nonPensionShare = 1 - pensionShare;

      const pensionPartNominal = projectedNominal * pensionShare / weightedFactor;
      const otherPartNominal   = projectedNominal * nonPensionShare * 0.04 / 12;
      const monthlyPensionNominal = Math.round(pensionPartNominal + otherPartNominal);

      const pensionPartReal = projectedReal * pensionShare / weightedFactor;
      const otherPartReal   = projectedReal * nonPensionShare * 0.04 / 12;
      const monthlyPensionReal = Math.round(pensionPartReal + otherPartReal);

      const monthlyIncome = assumptions?.monthlyIncome ?? 28500;
      const replacementRate = monthlyIncome > 0 ? monthlyPensionReal / monthlyIncome : 0;

      return {
        trajectory, projectedNominal, projectedReal,
        monthlyPensionNominal, monthlyPensionReal, replacementRate,
        weightedFactor,
      };
    };
  }, [funds, totalFundsBalance, currentAge, assumptions]);

  // Baseline scenario: current weighted fees, current monthly contrib (no extras),
  // default retire age (67), default return from assumptions (or 5%), default inflation.
  const baselineSim = useMemo(() => {
    const baseRetireAge = assumptions?.retirementAge ?? 67;
    const baseYears = Math.max(0, baseRetireAge - currentAge);
    const baseReturn = assumptions?.expectedReturnPension ?? 0.05;
    const baseInfl = assumptions?.inflationRate ?? 0.025;
    return runScenario({
      years: baseYears,
      grossReturn: baseReturn,
      inflation: baseInfl,
      monthlyContrib: baseMonthlyContrib,
      feeBalancePct: weightedFee,
      feeDepositPct: weightedFeeDeposit,
    });
  }, [runScenario, currentAge, assumptions, baseMonthlyContrib, weightedFee, weightedFeeDeposit]);

  // Optimized scenario: driven by sliders.
  const simulation = useMemo(() => {
    return runScenario({
      years: yearsToRetire,
      grossReturn: annualReturn,
      inflation: inflRate,
      monthlyContrib: totalMonthlyContrib,
      feeBalancePct: targetFeeBalance,
      feeDepositPct: targetFeeDeposit,
    });
  }, [runScenario, yearsToRetire, annualReturn, inflRate, totalMonthlyContrib, targetFeeBalance, targetFeeDeposit]);

  const pensionMonthlyDelta = simulation.monthlyPensionReal - baselineSim.monthlyPensionReal;
  const pensionBalanceDelta = simulation.projectedReal - baselineSim.projectedReal;

  /* ── Retirement Income (60+ only) ── */
  const retirementIncome = useMemo(() => {
    if (currentAge < 60) return null;

    const bituachLeumi = Math.max(0, Math.round(assumptions?.oldAgeAllowanceMonthly ?? OLD_AGE_ALLOWANCE_DEFAULTS.single));

    const pensionIncome = funds
      .filter(f => f.type === "pension" || f.type === "bituach")
      .map(f => {
        const factor = f.conversionFactor || 200;
        const projectedBalance = futureValue(f.balance, f.monthlyContrib, annualReturn, yearsToRetire);
        const monthlyPension = Math.round(projectedBalance / factor);
        return { company: f.company, monthly: monthlyPension, factor, subtype: f.subtype };
      });

    const totalPension = pensionIncome.reduce((s, p) => s + p.monthly, 0);
    const totalGross = bituachLeumi + totalPension;
    // Source of truth: pensionAnnuityTax() from lib/assumptions (reform § 190, 2025+).
    // Bituach Leumi elderly pension is exempt from income tax — excluded from taxable base.
    const { monthlyExemption, estimatedTax, effectiveRate } = pensionAnnuityTax(totalPension);
    const totalNet = totalGross - estimatedTax;

    return { bituachLeumi, pensionIncome, totalPension, monthlyExemption, estimatedTax, effectiveRate, totalGross, totalNet };
  }, [funds, currentAge, yearsToRetire, annualReturn, assumptions?.oldAgeAllowanceMonthly]);

  /* ── Section 45א + 47 — Voluntary pension tax benefit ──
   * Surfaces how many shekels the client "leaves on the table" each year
   * by not depositing the full ceiling. Needs a saved salary profile to
   * know the marginal tax rate and current voluntary contribution. */
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
    // "Voluntary" = employee pension contribution above the 6% statutory floor.
    const voluntaryPct = Math.max(0, profile.pensionEmployeePct - 6);
    const currentVoluntaryMonthly = profile.monthlyGross * (voluntaryPct / 100);
    // "At max" = hypothetical full utilization at this salary's insured ceiling.
    const hypotheticalMax = profile.monthlyGross; // anything ≥ 7% of insured → saturates
    const atMax = section45and47Benefit(hypotheticalMax, profile.monthlyGross, br.marginalBracket);
    const atCurrent = section45and47Benefit(currentVoluntaryMonthly, profile.monthlyGross, br.marginalBracket);
    const gap = Math.max(0, atMax.totalAnnual - atCurrent.totalAnnual);
    if (gap < 500) return null; // too small to bother mentioning
    return {
      currentMonthly: Math.round(currentVoluntaryMonthly),
      maxMonthly: atMax.maxVoluntaryMonthly,
      currentBenefit: atCurrent.totalAnnual,
      maxBenefit: atMax.totalAnnual,
      gap,
    };
  }, [funds, salaryTick]);

  /* ── Study fund above-cap warning ──
   * When gross > STUDY_FUND_SALARY_CAP and the employer contributes on the full
   * salary, the portion above the cap is a taxable fringe benefit at the
   * marginal rate, and also subject to BL + health (~12%) on the employee. */
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

  /* ── SVG Chart helpers ── */
  const chartW = 500, chartH = 140;
  const maxVal = Math.max(...simulation.trajectory.map(t => t.nominal), 1);

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
      {/* ===== 1. PageHeader with quantitative subtitle ===== */}
      <PageHeader
        subtitle="שלב 5"
        title="פנסיה ופרישה"
        description={`צבירה כוללת: ${fmtILS(totalFundsBalance)}`}
      />
      {/* אינדיקטור שמירה */}
      <div className="flex justify-end -mt-4 mb-3 min-h-[18px]">
        <SaveStatus status={saveStatus} />
      </div>

      {/* ===== 2. KPI Row ===== */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <SolidKpi label="צבירה פנסיונית"       value={fmtILS(totalFundsBalance)}          icon="savings"        tone="forest" />
        <SolidKpi label="הפקדה חודשית"         value={fmtILS(totalMonthlyContrib)}        icon="calendar_month" tone="emerald" />
        <SolidKpi label="דמי ניהול ממוצעים"    value={`${weightedFee.toFixed(2)}%`}       icon="percent"
                  tone={feeBenchmark(weightedFee).color === "#b91c1c" ? "red" : feeBenchmark(weightedFee).color === "#1B4332" ? "emerald" : "amber"}
                  sub={feeBenchmark(weightedFee).label} />
        <SolidKpi label="שנים לפרישה"          value={String(yearsToRetire)}              icon="elderly"        tone="ink"     sub={`גיל ${retireAge}`} />
        <SolidKpi label="קצבה חזויה"           value={fmtILS(simulation.monthlyPensionReal)} icon="payments"    tone="emerald"
                  sub={simulation.replacementRate > 0 ? `${Math.round(simulation.replacementRate * 100)}% מההכנסה · ריאלי` : "לחודש · ריאלי"} />
      </section>

      {/* ===== 2b. Distribution Donuts (product type + asset class) ===== */}
      {funds.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <div className="card-pad">
            <h3 className="text-sm font-extrabold text-verdant-ink mb-3">כמה יש מכל מוצר</h3>
            <MiniDonut data={fundsByTypeForChart} />
          </div>
          <div className="card-pad">
            <h3 className="text-sm font-extrabold text-verdant-ink mb-3">איפה הכסף מושקע</h3>
            <MiniDonut data={pensionAssetClassBreakdown} />
          </div>
        </section>
      )}

      {/* ===== 3. Pension Funds Table (CRUD + insurance alert + summary) ===== */}
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

        {/* Insurance duplication alert — compact */}
        {insuranceDuplication && (
          <div className="mx-5 mt-3 p-3 rounded-lg flex items-center gap-2 text-xs" style={{ background: "#fef3c7", border: "1px solid #f59e0b" }}>
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#f59e0b" }}>warning</span>
            <span className="font-bold" style={{ color: "#92400e" }}>
              זוהו כיסויים כפולים ({insuranceDuplication.map(d => d.label).join(", ")}) —
              בזבוז משוער: ₪{(insuranceDuplication.reduce((s, d) => s + d.estimatedWaste, 0) * 12).toLocaleString("he-IL")}/שנה
            </span>
          </div>
        )}

        {/* Guaranteed factor alert — don't touch old policies */}
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
            <p className="text-xs text-verdant-muted max-w-sm mx-auto mb-4 leading-relaxed">
              כדי לראות את התמונה המלאה — צבירה, דמי ניהול, מסלולים וביטוחים —
              העלה את הדיוור השנתי המפורט (PDF) שמגיע מהקרן, או הוסף קרן ידנית.
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
                  {/* Edit / Delete */}
                  <div className="flex gap-1">
                    <button onClick={() => { setShowAddForm(false); setEditingFund(f.id); }} className="p-1 rounded hover:bg-[#f4f7ed]">
                      <span className="material-symbols-outlined text-[14px] text-verdant-muted">edit</span>
                    </button>
                    <button onClick={() => handleDeleteFund(f.id)} className="p-1 rounded hover:bg-red-50">
                      <span className="material-symbols-outlined text-[14px] text-red-400">delete</span>
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
              <div className="text-sm font-extrabold text-verdant-emerald tabular">{fmtILS(totalMonthlyContrib)}</div>
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

      {/* ===== 3b. Keren Hishtalmut Insights ===== */}
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
                {/* Fund header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-extrabold text-verdant-ink">{f.company}</div>
                  <div className="text-sm font-extrabold text-verdant-ink tabular">{fmtILS(f.balance)}</div>
                </div>

                {/* Liquidity status */}
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

                {/* Strategic insight */}
                <div className="p-3 rounded-lg border text-right" style={{ background: "#fafdf5", borderColor: "#d1e7c8" }}>
                  <div className="text-[10px] font-bold text-verdant-emerald uppercase tracking-wider mb-1.5">💡 תובנה אסטרטגית</div>
                  {isLiquid ? (
                    <div className="text-[11px] font-bold text-verdant-ink leading-relaxed space-y-1">
                      <p>הקרן <strong>נזילה</strong> — אפשר למשוך ללא מס רווחי הון.</p>
                      <p>שימושים חכמים: סגירת/הקטנת משכנתא, הון עצמי לרכישת דירה, עזרה לילדים בדיור.</p>
                      <p style={{ color: "#1B4332" }}>
                        <strong>המלצה:</strong> אם אין צורך דחוף — עדיף להשאיר. ב-5 שנים נוספות הצבירה תגדל ל-{fmtILS(projectedIn5)} (ריבית דריבית פטורה ממס).
                      </p>
                    </div>
                  ) : f.openingDate ? (
                    <div className="text-[11px] font-bold text-verdant-ink leading-relaxed space-y-1">
                      <p>הקרן <strong>עדיין לא נזילה</strong> — תהיה נזילה ב-{liquidityDate?.toLocaleDateString("he-IL")}.</p>
                      <p>בינתיים הכסף צובר ריבית דריבית פטורה ממס — זה &quot;כסף אחרון&quot; שעדיף לא לגעת בו.</p>
                      <p style={{ color: "#1B4332" }}>
                        <strong>תכנון:</strong> כשהקרן תיפתח, אפשר לשקול שימוש אסטרטגי (דירה, משכנתא) — לא טיולים. לטיול חוסכים מהיום קדימה.
                      </p>
                    </div>
                  ) : (
                    <div className="text-[11px] font-bold text-verdant-ink leading-relaxed">
                      <p>קרן השתלמות היא &quot;כסף אחרון&quot; — פטור ממס רווחי הון. עדיף לא לפדות אלא להמשיך לצבור ריבית דריבית.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        );
      })()}

      {/* ===== 4. Retirement Simulation (3 sliders + chart + results) ===== */}
      <section className="card-pad mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">show_chart</span>
            <div>
              <div className="caption mb-0.5">סימולציית פנסיה</div>
              <h3 className="text-sm font-extrabold text-verdant-ink">צבירה צפויה עד גיל {retireAge}</h3>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#1B4332" }} /> נומינלי</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#2B694D" }} /> ריאלי</span>
          </div>
        </div>

        {/* 6 Sliders */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">
              תוספת הפקדה: {simExtraContrib > 0 ? `+${fmtILS(simExtraContrib)}` : "0"}
            </label>
            <input type="range" min={0} max={3000} step={100} value={simExtraContrib}
              onChange={e => setSimExtraContrib(+e.target.value)}
              className="w-full accent-verdant-emerald" />
            <div className="flex justify-between text-[9px] text-verdant-muted"><span>0</span><span>₪3,000</span></div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">גיל פרישה: {retireAge}</label>
            <input type="range" min={55} max={75} value={retireAge}
              onChange={e => setSimRetireAge(+e.target.value)}
              className="w-full accent-verdant-emerald" />
            <div className="flex justify-between text-[9px] text-verdant-muted"><span>55</span><span>75</span></div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">תשואה צפויה: {(annualReturn * 100).toFixed(1)}%</label>
            <input type="range" min={30} max={80} value={Math.round(annualReturn * 1000)}
              onChange={e => setSimReturn(+e.target.value / 10)}
              className="w-full accent-verdant-emerald" />
            <div className="flex justify-between text-[9px] text-verdant-muted"><span>3%</span><span>8%</span></div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">אינפלציה: {(inflRate * 100).toFixed(1)}%</label>
            <input type="range" min={10} max={40} value={Math.round(inflRate * 1000)}
              onChange={e => setSimInflation(+e.target.value / 10)}
              className="w-full accent-verdant-emerald" />
            <div className="flex justify-between text-[9px] text-verdant-muted"><span>1%</span><span>4%</span></div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">
              דמי ניהול מצבירה (יעד): {targetFeeBalance.toFixed(2)}%
            </label>
            <input type="range" min={0} max={150} step={5} value={Math.round(targetFeeBalance * 100)}
              onChange={e => setSimMgmtFeeBalance(+e.target.value / 100)}
              className="w-full accent-verdant-emerald" />
            <div className="flex justify-between text-[9px] text-verdant-muted"><span>0%</span><span>1.5%</span></div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted block mb-1">
              דמי ניהול מהפקדה (יעד): {targetFeeDeposit.toFixed(1)}%
            </label>
            <input type="range" min={0} max={60} step={1} value={Math.round(targetFeeDeposit * 10)}
              onChange={e => setSimMgmtFeeDeposit(+e.target.value / 10)}
              className="w-full accent-verdant-emerald" />
            <div className="flex justify-between text-[9px] text-verdant-muted"><span>0%</span><span>6%</span></div>
          </div>
        </div>

        {/* SVG Chart */}
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36">
          {/* Nominal area */}
          <path
            d={`M 0 ${chartH} ` + simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.nominal / maxVal) * (chartH - 8);
              return `L ${x} ${y}`;
            }).join(" ") + ` L ${chartW} ${chartH} Z`}
            fill="#1B4332" opacity="0.15"
          />
          {/* Nominal line */}
          <polyline
            points={simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.nominal / maxVal) * (chartH - 8);
              return `${x},${y}`;
            }).join(" ")}
            fill="none" stroke="#1B4332" strokeWidth="2.5" strokeLinecap="round"
          />
          {/* Real line */}
          <polyline
            points={simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.real / maxVal) * (chartH - 8);
              return `${x},${y}`;
            }).join(" ")}
            fill="none" stroke="#2B694D" strokeWidth="2" strokeDasharray="6 3" strokeLinecap="round"
          />
          {/* End dots */}
          {(() => {
            const last = simulation.trajectory[simulation.trajectory.length - 1];
            if (!last) return null;
            const x = chartW;
            return <>
              <circle cx={x} cy={chartH - (last.nominal / maxVal) * (chartH - 8)} r="4" fill="#1B4332" stroke="#fff" strokeWidth="2" />
              <circle cx={x} cy={chartH - (last.real / maxVal) * (chartH - 8)} r="4" fill="#2B694D" stroke="#fff" strokeWidth="2" />
            </>;
          })()}
        </svg>
        <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-1">
          <span>גיל {currentAge}</span>
          <span>גיל {retireAge}</span>
        </div>

        {/* Side-by-side comparison: current vs optimized */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t v-divider">
          {/* Current path (grey) */}
          <div className="p-4 rounded-xl" style={{ background: "#f4f7ed", border: "1px solid #d8e0d0" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[14px]" style={{ color: "#5a7a6a" }}>timeline</span>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "#5a7a6a" }}>
                מצב נוכחי
              </div>
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="text-[10px] font-bold mb-0.5" style={{ color: "#5a7a6a" }}>צבירה צפויה בפרישה</div>
                <div className="text-xl font-extrabold tabular" style={{ color: "#012d1d" }}>
                  {fmtILS(baselineSim.projectedReal)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold mb-0.5" style={{ color: "#5a7a6a" }}>קצבה חודשית</div>
                <div className="text-xl font-extrabold tabular" style={{ color: "#012d1d" }}>
                  {fmtILS(baselineSim.monthlyPensionReal)}
                </div>
              </div>
              <div className="text-[9px] font-bold pt-1" style={{ color: "#5a7a6a" }}>
                דמ״נ: {weightedFee.toFixed(2)}% צבירה · {weightedFeeDeposit.toFixed(1)}% הפקדה · גיל {assumptions?.retirementAge ?? 67}
              </div>
            </div>
          </div>

          {/* Optimized path (green) */}
          <div className="p-4 rounded-xl" style={{ background: "#f0fdf4", border: "2px solid #1B4332" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[14px]" style={{ color: "#1B4332" }}>rocket_launch</span>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "#1B4332" }}>
                מצב מותאם
              </div>
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="text-[10px] font-bold mb-0.5" style={{ color: "#1B4332" }}>צבירה צפויה בפרישה</div>
                <div className="text-xl font-extrabold tabular" style={{ color: "#012d1d" }}>
                  {fmtILS(simulation.projectedReal)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold mb-0.5" style={{ color: "#1B4332" }}>קצבה חודשית</div>
                <div className="text-xl font-extrabold tabular" style={{ color: "#1B4332" }}>
                  {fmtILS(simulation.monthlyPensionReal)}
                </div>
              </div>
              <div className="text-[9px] font-bold pt-1" style={{ color: "#1B4332" }}>
                דמ״נ: {targetFeeBalance.toFixed(2)}% צבירה · {targetFeeDeposit.toFixed(1)}% הפקדה · גיל {retireAge}
              </div>
            </div>
          </div>
        </div>

        {/* Delta banner */}
        <div className="mt-3 px-4 py-3 rounded-xl flex items-center justify-between"
          style={{
            background: pensionMonthlyDelta >= 0 ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${pensionMonthlyDelta >= 0 ? "#2B694D" : "#f97316"}`,
          }}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]"
              style={{ color: pensionMonthlyDelta >= 0 ? "#2B694D" : "#f97316" }}>
              {pensionMonthlyDelta >= 0 ? "trending_up" : "trending_down"}
            </span>
            <div className="text-xs font-extrabold" style={{ color: "#012d1d" }}>
              {pensionMonthlyDelta >= 0 ? "רווח מהתאמות" : "הפסד מהתאמות"}
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-left">
              <div className="text-[9px] font-bold" style={{ color: "#5a7a6a" }}>לחודש</div>
              <div className="text-base font-extrabold tabular"
                style={{ color: pensionMonthlyDelta >= 0 ? "#2B694D" : "#f97316" }}>
                {pensionMonthlyDelta >= 0 ? "+" : ""}{fmtILS(pensionMonthlyDelta)}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[9px] font-bold" style={{ color: "#5a7a6a" }}>לצבירה</div>
              <div className="text-base font-extrabold tabular"
                style={{ color: pensionBalanceDelta >= 0 ? "#2B694D" : "#f97316" }}>
                {pensionBalanceDelta >= 0 ? "+" : ""}{fmtILS(pensionBalanceDelta)}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[9px] font-bold" style={{ color: "#5a7a6a" }}>שיעור החלפה</div>
              <div className="text-base font-extrabold tabular"
                style={{ color: simulation.replacementRate >= 0.7 ? "#1B4332" : "#f97316" }}>
                {(simulation.replacementRate * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {/* ── תרחישי "מה אם" שמורים ── */}
        <div className="mt-4 pt-4 border-t v-divider">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[14px]" style={{ color: "#1B4332" }}>bookmark</span>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "#1B4332" }}>
              תרחישים שמורים
            </div>
          </div>

          {/* שורת שמירה */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => { setScenarioName(e.target.value); if (scenarioNameError) setScenarioNameError(false); }}
              placeholder="לדוגמה: דמי ניהול 0.3% + פרישה ב-70"
              className="flex-1 px-3 py-2 text-[12px] rounded-lg outline-none transition-colors"
              style={{
                background: "#eef2e8",
                border: `1px solid ${scenarioNameError ? "#f97316" : "#d8e0d0"}`,
                color: "#012d1d",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const trimmed = scenarioName.trim();
                  if (!trimmed) { setScenarioNameError(true); return; }
                  addScenario({
                    type: "pension",
                    name: trimmed,
                    payload: {
                      extraMonthly: simExtraContrib,
                      retireAge: retireAge,
                      annualReturn: annualReturn * 100,
                      inflation: inflRate * 100,
                      mgmtFeeBalance: targetFeeBalance,
                      mgmtFeeDeposit: targetFeeDeposit,
                    },
                    result: {
                      projectedBalance: simulation.projectedReal,
                      monthlyPension: simulation.monthlyPensionReal,
                    },
                  });
                  setScenarioName("");
                  pulse();
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const trimmed = scenarioName.trim();
                if (!trimmed) { setScenarioNameError(true); return; }
                addScenario({
                  type: "pension",
                  name: trimmed,
                  payload: {
                    extraMonthly: simExtraContrib,
                    retireAge: retireAge,
                    annualReturn: annualReturn * 100,
                    inflation: inflRate * 100,
                    mgmtFeeBalance: targetFeeBalance,
                    mgmtFeeDeposit: targetFeeDeposit,
                  },
                  result: {
                    projectedBalance: simulation.projectedReal,
                    monthlyPension: simulation.monthlyPensionReal,
                  },
                });
                setScenarioName("");
                pulse();
              }}
              className="btn-botanical text-[12px] !px-4 !py-2"
            >
              שמור תרחיש
            </button>
          </div>

          {/* רשימת תרחישים */}
          {scenarios.length === 0 ? (
            <div className="text-[11px] text-center py-3" style={{ color: "#5a7a6a" }}>
              תרחישים שמורים יופיעו כאן
            </div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {scenarios.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((sc) => {
                const deltaMonthly = sc.result.monthlyPension - simulation.monthlyPensionReal;
                const deltaBalance = sc.result.projectedBalance - simulation.projectedReal;
                const dateStr = new Date(sc.createdAt).toLocaleDateString("he-IL", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                });
                return (
                  <div
                    key={sc.id}
                    className="group flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: "#f4f7ed", border: "1px solid #d8e0d0" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[13px] font-extrabold truncate" style={{ color: "#012d1d" }}>
                          {sc.name}
                        </div>
                        <div className="text-[11px]" style={{ color: "#5a7a6a" }}>{dateStr}</div>
                      </div>
                      <div className="flex items-center gap-4 mt-0.5 flex-wrap">
                        <div className="text-[12px] tabular" style={{ color: "#012d1d" }}>
                          <span style={{ color: "#5a7a6a" }}>קצבה: </span>
                          <span className="font-extrabold">{fmtILS(sc.result.monthlyPension)}</span>
                          <span
                            className="font-extrabold mr-1"
                            style={{ color: deltaMonthly >= 0 ? "#2B694D" : "#f97316" }}
                          >
                            ({deltaMonthly >= 0 ? "+" : ""}{fmtILS(deltaMonthly)})
                          </span>
                        </div>
                        <div className="text-[12px] tabular" style={{ color: "#012d1d" }}>
                          <span style={{ color: "#5a7a6a" }}>צבירה: </span>
                          <span className="font-extrabold">{fmtILS(sc.result.projectedBalance)}</span>
                          <span
                            className="font-extrabold mr-1"
                            style={{ color: deltaBalance >= 0 ? "#2B694D" : "#f97316" }}
                          >
                            ({deltaBalance >= 0 ? "+" : ""}{fmtILS(deltaBalance)})
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // טעינת התרחיש חזרה לסליידרים
                        setSimExtraContrib(sc.payload.extraMonthly);
                        setSimRetireAge(sc.payload.retireAge);
                        setSimReturn(sc.payload.annualReturn);
                        setSimInflation(sc.payload.inflation);
                        setSimMgmtFeeBalance(sc.payload.mgmtFeeBalance);
                        setSimMgmtFeeDeposit(sc.payload.mgmtFeeDeposit);
                        pulse();
                      }}
                      className="px-3 py-1.5 text-[11px] font-extrabold rounded-lg transition-colors"
                      style={{ background: "#1B4332", color: "#fff" }}
                    >
                      טען
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteScenario(sc.id)}
                      aria-label="מחק תרחיש"
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md"
                      style={{ color: "#f97316" }}
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===== 6a. Retirement Income Card (60+ only) ===== */}
      {retirementIncome && (
        <section className="card-pad mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">elderly</span>
            <div>
              <div className="caption mb-0.5">אומדן</div>
              <h3 className="text-sm font-extrabold text-verdant-ink">הכנסה צפויה בפרישה</h3>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-verdant-muted font-bold">קצבת זקנה (ביטוח לאומי)</span>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border v-divider overflow-hidden" role="group" aria-label="מצב משפחתי לקצבת זקנה">
                  <button
                    type="button"
                    onClick={() => {
                      const next = patchAssumptions({
                        oldAgeAllowanceStatus: "single",
                        oldAgeAllowanceMonthly: OLD_AGE_ALLOWANCE_DEFAULTS.single,
                      });
                      setAssumptions(next);
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold ${
                      (assumptions?.oldAgeAllowanceStatus ?? "single") === "single"
                        ? "bg-verdant-emerald text-white"
                        : "text-verdant-muted"
                    }`}
                  >
                    יחיד
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = patchAssumptions({
                        oldAgeAllowanceStatus: "couple",
                        oldAgeAllowanceMonthly: OLD_AGE_ALLOWANCE_DEFAULTS.couple,
                      });
                      setAssumptions(next);
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold border-r v-divider ${
                      assumptions?.oldAgeAllowanceStatus === "couple"
                        ? "bg-verdant-emerald text-white"
                        : "text-verdant-muted"
                    }`}
                  >
                    זוג
                  </button>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10}
                  value={assumptions?.oldAgeAllowanceMonthly ?? OLD_AGE_ALLOWANCE_DEFAULTS.single}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    const next = patchAssumptions({ oldAgeAllowanceMonthly: v });
                    setAssumptions(next);
                  }}
                  className="w-20 text-left border v-divider rounded-md px-2 py-0.5 text-[11px] font-extrabold text-verdant-ink tabular"
                  aria-label="קצבת זקנה חודשית"
                />
              </div>
            </div>

            {retirementIncome.pensionIncome.map((p, i) => (
              <div key={i} className="flex justify-between text-[11px]">
                <span className="text-verdant-muted font-bold">
                  {p.company}
                  <span className="text-[9px] text-verdant-muted mr-1">(מקדם {p.factor})</span>
                </span>
                <span className="font-extrabold text-verdant-ink tabular">{fmtILS(p.monthly)}</span>
              </div>
            ))}

            <div className="border-t v-divider pt-2 mt-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-verdant-muted font-bold">סה&quot;כ ברוטו</span>
                <span className="font-extrabold text-verdant-ink tabular">{fmtILS(retirementIncome.totalGross)}</span>
              </div>
              <div className="flex justify-between text-[11px] mt-1">
                <span className="text-verdant-muted font-bold">פטור קצבה מזכה (חודשי)</span>
                <span className="font-extrabold tabular" style={{ color: "#1B4332" }}>{fmtILS(retirementIncome.monthlyExemption)}</span>
              </div>
              <div className="flex justify-between text-[11px] mt-1">
                <span className="text-verdant-muted font-bold">מס משוער (~{Math.round(retirementIncome.effectiveRate * 100)}%)</span>
                <span className="font-extrabold tabular" style={{ color: "#b91c1c" }}>-{fmtILS(retirementIncome.estimatedTax)}</span>
              </div>
            </div>

            <div className="flex justify-between text-sm pt-2 border-t v-divider">
              <span className="font-extrabold text-verdant-ink">הכנסה חודשית נטו (אומדן)</span>
              <span className="font-extrabold text-lg text-verdant-emerald tabular">{fmtILS(retirementIncome.totalNet)}</span>
            </div>
          </div>

          <p className="text-[10px] text-verdant-muted mt-3 leading-relaxed">
            * אומדן בלבד. לא כולל קצבה מוכרת, תיקון 190, נדל&quot;ן, או הכנסות נוספות.
            מומלץ לבצע תכנון פרישה מלא עם רו&quot;ח.
          </p>
        </section>
      )}

      {/* ===== 6. Retirement Insight (forest card) ===== */}
      <div className="card-forest mb-6">
        <div className="flex items-start gap-4">
          <div className="icon-sm flex-shrink-0" style={{ background: "rgba(193,236,212,0.18)", color: "#C1ECD4" }}>
            <span className="material-symbols-outlined text-[20px]">elderly</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="caption mb-2">תובנת פרישה</div>
            <h3 className="t-lg font-extrabold text-white mb-2">
              שיעור החלפת הכנסה: {(simulation.replacementRate * 100).toFixed(0)}%
            </h3>
            <p className="text-[13px] leading-6" style={{ color: "rgba(249,250,242,0.75)" }}>
              {currentAge < 45
                ? `בגיל ${currentAge} המפתח הוא מסלול השקעה מנייתי ודמי ניהול נמוכים. ` +
                  (weightedFee > 0.5 ? "דמי הניהול שלכם גבוהים — שווה לנהל מו\"מ או להחליף קרן." : "דמי הניהול שלכם סבירים.") +
                  (funds.some(f => f.subtype === "bituach_classic" || f.subtype === "pension_vatika")
                    ? " שימו לב: יש לכם פוליסות עם מקדם מובטח — נכס נדיר, אל תיגעו בהן."
                    : "")
                : currentAge < 60
                  ? simulation.replacementRate >= 0.7
                    ? "שיעור ההחלפה סביר. שקלו הגדלת הפקדות או הפחתת דמי ניהול לשיפור."
                    : "שיעור ההחלפה נמוך. מומלץ להגדיל הפקדות, להפחית דמי ניהול, או להוסיף קופת גמל להשקעה."
                  : "מומלץ לבצע תכנון מס מקיף לפני הפרישה — פריסת מענקים, רצף קצבה, ובחינת היוון. " +
                    "השתמשו במחשבון הפרישה בארגז הכלים."
              }
            </p>
          </div>
        </div>
      </div>

      {/* ===== 6b. Section 45א + 47 — Voluntary contribution benefit ===== */}
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

      {/* ===== 6c. Study fund above-cap warning ===== */}
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

      {/* ===== 7. Annual Report (PDF) Upload ===== */}
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
  const [provider, setProvider] = useState("");
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
