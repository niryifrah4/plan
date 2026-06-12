"use client";

import { useState, useEffect, useMemo } from "react";
import { pmt, calcPurchaseTax } from "@/lib/financial-math";
import { loadAssumptions } from "@/lib/assumptions";
import { fmtILS } from "@/lib/format";
import { scopedKey } from "@/lib/client-scope";
import { ToolboxNumberField } from "@/components/toolbox/ToolboxNumberField";
import { reportError } from "@/lib/report-error";

const TASK_INSIGHTS_KEY = "verdant:task_insights";

export function InvestmentPropertyCalc() {
  const [price, setPrice] = useState(1_800_000);
  const [equity, setEquity] = useState(900_000);
  const [monthlyRent, setMonthlyRent] = useState(5_500);
  const [mortgageRate, setMortgageRate] = useState(5.0);
  const [mortgageYears, setMortgageYears] = useState(20);
  const [monthlyExpenses, setMonthlyExpenses] = useState(800);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    const a = loadAssumptions();
    const defaultRate = ((a.primeRate || 0.06) + 0.012) * 100;
    setMortgageRate(parseFloat(defaultRate.toFixed(1)));
  }, []);

  const results = useMemo(() => {
    // Purchase tax
    const purchaseTax = calcPurchaseTax(price);
    const lawyerFees = Math.round(price * 0.005 + 2500); // ~0.5% + VAT
    const totalClosingCosts = purchaseTax + lawyerFees;

    // Max 50% LTV for investment property
    const maxMortgage = price * 0.5;
    const requiredEquity = price - maxMortgage;
    const totalEquityNeeded = requiredEquity + totalClosingCosts;

    // What the user is asking for (uncapped), used to decide if they're under-funded
    const requestedMortgage = Math.max(0, price - equity);
    const requestedLTV = price > 0 ? (requestedMortgage / price) * 100 : 0;
    const overLTV = requestedLTV > 50;

    // Apply the 50% cap regardless of what the user asked for
    const effectiveMortgage = Math.min(maxMortgage, requestedMortgage);
    const actualLTV = price > 0 ? (effectiveMortgage / price) * 100 : 0;
    const effectiveEquityNeeded = price - effectiveMortgage + totalClosingCosts;
    const equityShortfall = Math.max(0, effectiveEquityNeeded - equity);

    // Monthly payment
    const months = mortgageYears * 12;
    const rate = mortgageRate / 100;
    const monthlyPayment = effectiveMortgage > 0 ? pmt(effectiveMortgage, rate, months) : 0;

    // Yields
    const annualRent = monthlyRent * 12;
    const annualExpenses = monthlyExpenses * 12;
    const grossYield = price > 0 ? (annualRent / price) * 100 : 0;
    const netOperatingIncome = annualRent - annualExpenses;
    const netYield = price > 0 ? (netOperatingIncome / price) * 100 : 0;

    // Net yield after purchase tax amortized over 10 years
    const amortizedTax = totalClosingCosts / 10;
    const adjustedNOI = netOperatingIncome - amortizedTax;
    const netYieldAfterTax = price > 0 ? (adjustedNOI / price) * 100 : 0;

    // Monthly cashflow gap
    const monthlyCashflow = monthlyRent - monthlyExpenses - monthlyPayment;

    // Total cost summary
    const totalInterest = monthlyPayment * months - effectiveMortgage;

    return {
      purchaseTax,
      lawyerFees,
      totalClosingCosts,
      maxMortgage,
      effectiveMortgage,
      effectiveEquityNeeded,
      equityShortfall,
      actualLTV,
      requestedLTV,
      monthlyPayment,
      grossYield,
      netYield,
      netYieldAfterTax,
      monthlyCashflow,
      netOperatingIncome,
      totalInterest,
      overLTV,
    };
  }, [price, equity, monthlyRent, mortgageRate, mortgageYears, monthlyExpenses]);

  const handleExport = () => {
    try {
      const existing = JSON.parse(localStorage.getItem(scopedKey(TASK_INSIGHTS_KEY)) || "[]");
      existing.push({
        id: `invest-${Date.now()}`,
        source: "מחשבון דירה להשקעה",
        date: new Date().toISOString(),
        text: `נכס ${fmtILS(price)}: הון עצמי דרוש ${fmtILS(Math.round(results.effectiveEquityNeeded))} (כולל מס רכישה ${fmtILS(Math.round(results.purchaseTax))}). משכנתא ${fmtILS(Math.round(results.effectiveMortgage))}. תשואה גולמית ${results.grossYield.toFixed(1)}%, נקייה ${results.netYield.toFixed(1)}%. פער תזרימי ${fmtILS(Math.round(results.monthlyCashflow))}/חודש.`,
      });
      localStorage.setItem(scopedKey(TASK_INSIGHTS_KEY), JSON.stringify(existing));
      window.dispatchEvent(new Event("verdant:insights:updated"));
      setExported(true);
      setTimeout(() => setExported(false), 2500);
    } catch (e) { reportError("toolbox/InvestmentPropertyCalc", e); }
  };

  return (
    <div className="space-y-8" style={{ fontFamily: "'Assistant', sans-serif" }}>
      {/* Inputs */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
        <InputField label="מחיר נכס מבוקש" value={price} onChange={setPrice} suffix="₪" />
        <InputField label="הון עצמי" value={equity} onChange={setEquity} suffix="₪" />
        <InputField
          label="שכירות חודשית צפויה"
          value={monthlyRent}
          onChange={setMonthlyRent}
          suffix="₪/חודש"
        />
        <InputField
          label="ריבית משכנתא"
          value={mortgageRate}
          onChange={setMortgageRate}
          suffix="%"
          step={0.1}
        />
        <InputField
          label="תקופת משכנתא"
          value={mortgageYears}
          onChange={setMortgageYears}
          suffix="שנים"
        />
        <InputField
          label="הוצאות חודשיות (ועד, ביטוח)"
          value={monthlyExpenses}
          onChange={setMonthlyExpenses}
          suffix="₪/חודש"
        />
      </div>

      {/* 50% LTV warning */}
      {results.overLTV && (
        <div
          className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: "rgba(217,119,6,0.08)", border: "1px solid #D97706" }}
        >
          <span
            className="material-symbols-outlined mt-0.5 text-[20px]"
            style={{ color: "#D97706" }}
          >
            info
          </span>
          <div className="text-[11px] font-bold leading-relaxed" style={{ color: "#92400e" }}>
            דירה להשקעה מוגבלת ל-50% מימון. בקצב ההון הנוכחי ({results.requestedLTV.toFixed(0)}%
            LTV) תידרש תוספת של {fmtILS(Math.round(results.equityShortfall))} בהון עצמי, או הורדת
            מחיר הנכס.
          </div>
        </div>
      )}

      {/* Results: 3 key cards */}
      <div className="grid grid-cols-3 gap-4">
        <ResultCard
          label="הון עצמי דרוש (כולל מיסים)"
          value={fmtILS(Math.round(results.effectiveEquityNeeded))}
          icon="account_balance_wallet"
          color="#FFFFFF"
          highlight
        />
        <ResultCard
          label="משכנתא מקסימלית (50%)"
          value={fmtILS(Math.round(results.effectiveMortgage))}
          icon="account_balance"
          color="#2C7A5A"
        />
        <ResultCard
          label="פער תזרימי חודשי"
          value={fmtILS(Math.round(results.monthlyCashflow))}
          icon={results.monthlyCashflow >= 0 ? "trending_up" : "trending_down"}
          color={results.monthlyCashflow >= 0 ? "#2C7A5A" : "#DC2626"}
        />
      </div>

      {/* Purchase Tax Breakdown */}
      <div
        className="rounded-xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
      >
        <div className="caption mb-4">מס רכישה — מדרגות דירה שנייה 2026</div>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
          >
            <div className="mb-0.5 text-[9px] font-bold text-verdant-muted">מס רכישה</div>
            <div className="tabular text-lg font-extrabold" style={{ color: "#DC2626" }}>
              {fmtILS(Math.round(results.purchaseTax))}
            </div>
          </div>
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
          >
            <div className="mb-0.5 text-[9px] font-bold text-verdant-muted">שכ״ט עו״ד</div>
            <div className="tabular text-lg font-extrabold text-verdant-ink">
              {fmtILS(results.lawyerFees)}
            </div>
          </div>
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
          >
            <div className="mb-0.5 text-[9px] font-bold text-verdant-muted">סה״כ עלויות נלוות</div>
            <div className="tabular text-lg font-extrabold text-verdant-ink">
              {fmtILS(Math.round(results.totalClosingCosts))}
            </div>
          </div>
        </div>
        <div className="text-[10px] font-bold text-verdant-muted">
          מדרגות: עד ₪6,055,070 — 8% · מעל — 10%
        </div>
      </div>

      {/* Yield Analysis */}
      <div
        className="space-y-5 rounded-xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
      >
        <div className="caption">ניתוח תשואה</div>

        <div className="grid grid-cols-3 gap-4">
          <YieldCard
            label="תשואה גולמית"
            value={results.grossYield}
            description="שכירות שנתית / מחיר"
          />
          <YieldCard label="תשואה נקייה" value={results.netYield} description="NOI / מחיר" />
          <YieldCard
            label="תשואה בניכוי מיסים"
            value={results.netYieldAfterTax}
            description="בניכוי מס רכישה מופחת"
          />
        </div>

        {/* Gross vs Net bar */}
        <div className="border-t pt-4" style={{ borderColor: "#E5E7EB" }}>
          <div className="mb-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#2C7A5A" }} />
              <span className="text-[10px] font-bold text-verdant-muted">
                גולמית {results.grossYield.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#FFFFFF" }} />
              <span className="text-[10px] font-bold text-verdant-muted">
                נקייה {results.netYield.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#D97706" }} />
              <span className="text-[10px] font-bold text-verdant-muted">
                אחרי מיסים {results.netYieldAfterTax.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${Math.min(100, results.grossYield * 10)}%`, background: "#2C7A5A" }}
            />
          </div>
          <div
            className="mt-1 flex h-4 overflow-hidden rounded-full"
            style={{ background: "#E5E7EB" }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${Math.min(100, results.netYield * 10)}%`, background: "#FFFFFF" }}
            />
          </div>
          <div
            className="mt-1 flex h-4 overflow-hidden rounded-full"
            style={{ background: "#E5E7EB" }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, results.netYieldAfterTax) * 10)}%`,
                background: "#D97706",
              }}
            />
          </div>
        </div>
      </div>

      {/* Cashflow Details */}
      <div
        className="space-y-4 rounded-xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
      >
        <div className="caption">תזרים חודשי</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <DetailRow label="שכירות חודשית" value={`+${fmtILS(monthlyRent)}`} color="#2C7A5A" />
          <DetailRow
            label="החזר משכנתא"
            value={`-${fmtILS(Math.round(results.monthlyPayment))}`}
            color="#DC2626"
          />
          <DetailRow label="הוצאות שוטפות" value={`-${fmtILS(monthlyExpenses)}`} color="#DC2626" />
          <DetailRow label="סה״כ ריבית לתקופה" value={fmtILS(Math.round(results.totalInterest))} />
        </div>
        <div
          className="flex items-center justify-between border-t pt-4"
          style={{ borderColor: "#E5E7EB" }}
        >
          <span className="text-[12px] font-extrabold text-verdant-ink">פער תזרימי נטו</span>
          <span
            className="tabular text-lg font-extrabold"
            style={{ color: results.monthlyCashflow >= 0 ? "#2C7A5A" : "#DC2626" }}
          >
            {fmtILS(Math.round(results.monthlyCashflow))}/חודש
          </span>
        </div>
        {results.monthlyCashflow < 0 && (
          <div
            className="flex items-center gap-2 rounded-lg p-3 text-[11px] font-bold"
            style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}
          >
            <span className="material-symbols-outlined text-[16px]">warning</span>
            ההשקעה דורשת מימון נוסף של {fmtILS(Math.abs(Math.round(results.monthlyCashflow)))}/חודש
            מתזרים חיצוני
          </div>
        )}
      </div>

      {/* Export button */}
      <button onClick={handleExport} className="btn-botanical flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">
          {exported ? "check" : "file_export"}
        </span>
        {exported ? "נשמר בהמלצות" : "ייצא לסיכום"}
      </button>
    </div>
  );
}

/* ─── Sub-components ─── */

function InputField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  step?: number;
}) {
  return (
    <ToolboxNumberField
      label={label}
      value={value}
      onChange={onChange}
      suffix={suffix}
      min={0}
      steps={step < 1 ? [step, step * 5, step * 10] : undefined}
      labelClassName="mb-1.5 text-[10px] font-bold text-verdant-muted"
      buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2.5 text-left text-[13px] font-extrabold text-verdant-ink transition-colors hover:bg-[#FAFAF7]"
    />
  );
}

function ResultCard({
  label,
  value,
  icon,
  color,
  highlight,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-5 text-center"
      style={{
        background: highlight ? `linear-gradient(135deg, ${color}08, ${color}04)` : "#FFFFFF",
        border: `1px solid ${highlight ? color + "30" : "#E5E7EB"}`,
      }}
    >
      <span className="material-symbols-outlined mb-2 text-[24px]" style={{ color }}>
        {icon}
      </span>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-verdant-muted">
        {label}
      </div>
      <div className="tabular text-xl font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function YieldCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  const color = value >= 4 ? "#2C7A5A" : value >= 2.5 ? "#D97706" : "#DC2626";
  return (
    <div
      className="rounded-lg p-4 text-center"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
    >
      <div className="mb-1 text-[9px] font-bold text-verdant-muted">{label}</div>
      <div className="tabular text-2xl font-extrabold" style={{ color }}>
        {value.toFixed(1)}%
      </div>
      <div className="mt-0.5 text-[9px] font-bold text-verdant-muted">{description}</div>
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-verdant-muted">{label}</span>
      <span className="tabular text-[12px] font-extrabold" style={{ color: color || "#1A1A1A" }}>
        {value}
      </span>
    </div>
  );
}
