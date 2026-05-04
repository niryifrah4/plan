"use client";

import { useState, useEffect, useMemo } from "react";
import { pmt, calcPurchaseTax } from "@/lib/financial-math";
import { loadAssumptions } from "@/lib/assumptions";
import { fmtILS } from "@/lib/format";
import { scopedKey } from "@/lib/client-scope";

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

    // Actual mortgage (can be less if user has more equity)
    const actualMortgage = Math.min(maxMortgage, Math.max(0, price - equity));
    const actualLTV = price > 0 ? (actualMortgage / price) * 100 : 0;
    const overLTV = actualLTV > 50;

    // If equity is less than required, cap mortgage at 50%
    const effectiveMortgage = overLTV ? maxMortgage : actualMortgage;
    const effectiveEquityNeeded = price - effectiveMortgage + totalClosingCosts;

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
      actualLTV: Math.min(actualLTV, 50),
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
    } catch {}
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
          style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}
        >
          <span
            className="material-symbols-outlined mt-0.5 text-[20px]"
            style={{ color: "#f59e0b" }}
          >
            info
          </span>
          <div className="text-[11px] font-bold" style={{ color: "#92400e" }}>
            דירה להשקעה מוגבלת ל-50% מימון. ההון העצמי הנדרש הותאם בהתאם.
          </div>
        </div>
      )}

      {/* Results: 3 key cards */}
      <div className="grid grid-cols-3 gap-4">
        <ResultCard
          label="הון עצמי דרוש (כולל מיסים)"
          value={fmtILS(Math.round(results.effectiveEquityNeeded))}
          icon="account_balance_wallet"
          color="#012d1d"
          highlight
        />
        <ResultCard
          label="משכנתא מקסימלית (50%)"
          value={fmtILS(Math.round(results.effectiveMortgage))}
          icon="account_balance"
          color="#1B4332"
        />
        <ResultCard
          label="פער תזרימי חודשי"
          value={fmtILS(Math.round(results.monthlyCashflow))}
          icon={results.monthlyCashflow >= 0 ? "trending_up" : "trending_down"}
          color={results.monthlyCashflow >= 0 ? "#1B4332" : "#b91c1c"}
        />
      </div>

      {/* Purchase Tax Breakdown */}
      <div
        className="rounded-xl p-6"
        style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}
      >
        <div className="caption mb-4">מס רכישה — מדרגות דירה שנייה 2026</div>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: "#fff", border: "1px solid #eef2e8" }}
          >
            <div className="mb-0.5 text-[9px] font-bold text-verdant-muted">מס רכישה</div>
            <div className="tabular text-lg font-extrabold" style={{ color: "#b91c1c" }}>
              {fmtILS(Math.round(results.purchaseTax))}
            </div>
          </div>
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: "#fff", border: "1px solid #eef2e8" }}
          >
            <div className="mb-0.5 text-[9px] font-bold text-verdant-muted">שכ״ט עו״ד</div>
            <div className="tabular text-lg font-extrabold text-verdant-ink">
              {fmtILS(results.lawyerFees)}
            </div>
          </div>
          <div
            className="rounded-lg p-3 text-center"
            style={{ background: "#fff", border: "1px solid #eef2e8" }}
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
        style={{ background: "#fff", border: "1px solid #d8e0d0" }}
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
        <div className="border-t pt-4" style={{ borderColor: "#eef2e8" }}>
          <div className="mb-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#1B4332" }} />
              <span className="text-[10px] font-bold text-verdant-muted">
                גולמית {results.grossYield.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#012d1d" }} />
              <span className="text-[10px] font-bold text-verdant-muted">
                נקייה {results.netYield.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#f59e0b" }} />
              <span className="text-[10px] font-bold text-verdant-muted">
                אחרי מיסים {results.netYieldAfterTax.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full" style={{ background: "#eef2e8" }}>
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${Math.min(100, results.grossYield * 10)}%`, background: "#1B4332" }}
            />
          </div>
          <div
            className="mt-1 flex h-4 overflow-hidden rounded-full"
            style={{ background: "#eef2e8" }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${Math.min(100, results.netYield * 10)}%`, background: "#012d1d" }}
            />
          </div>
          <div
            className="mt-1 flex h-4 overflow-hidden rounded-full"
            style={{ background: "#eef2e8" }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, results.netYieldAfterTax) * 10)}%`,
                background: "#f59e0b",
              }}
            />
          </div>
        </div>
      </div>

      {/* Cashflow Details */}
      <div
        className="space-y-4 rounded-xl p-6"
        style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}
      >
        <div className="caption">תזרים חודשי</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <DetailRow label="שכירות חודשית" value={`+${fmtILS(monthlyRent)}`} color="#1B4332" />
          <DetailRow
            label="החזר משכנתא"
            value={`-${fmtILS(Math.round(results.monthlyPayment))}`}
            color="#b91c1c"
          />
          <DetailRow label="הוצאות שוטפות" value={`-${fmtILS(monthlyExpenses)}`} color="#b91c1c" />
          <DetailRow label="סה״כ ריבית לתקופה" value={fmtILS(Math.round(results.totalInterest))} />
        </div>
        <div
          className="flex items-center justify-between border-t pt-4"
          style={{ borderColor: "#d8e0d0" }}
        >
          <span className="text-[12px] font-extrabold text-verdant-ink">פער תזרימי נטו</span>
          <span
            className="tabular text-lg font-extrabold"
            style={{ color: results.monthlyCashflow >= 0 ? "#1B4332" : "#b91c1c" }}
          >
            {fmtILS(Math.round(results.monthlyCashflow))}/חודש
          </span>
        </div>
        {results.monthlyCashflow < 0 && (
          <div
            className="flex items-center gap-2 rounded-lg p-3 text-[11px] font-bold"
            style={{ background: "#fef2f2", color: "#b91c1c" }}
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
    <div>
      <div className="mb-1.5 text-[10px] font-bold text-verdant-muted">{label}</div>
      <div
        className="flex items-center gap-2 rounded-xl border px-4 py-2.5"
        style={{ borderColor: "#d8e0d0", background: "#fff" }}
      >
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="tabular flex-1 bg-transparent text-[13px] font-extrabold text-verdant-ink outline-none"
        />
        <span className="text-[10px] font-bold text-verdant-muted">{suffix}</span>
      </div>
    </div>
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
        background: highlight ? `linear-gradient(135deg, ${color}08, ${color}04)` : "#fff",
        border: `1px solid ${highlight ? color + "30" : "#eef2e8"}`,
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
  const color = value >= 4 ? "#1B4332" : value >= 2.5 ? "#f59e0b" : "#b91c1c";
  return (
    <div
      className="rounded-lg p-4 text-center"
      style={{ background: "#f9faf2", border: "1px solid #eef2e8" }}
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
      <span className="tabular text-[12px] font-extrabold" style={{ color: color || "#012d1d" }}>
        {value}
      </span>
    </div>
  );
}
