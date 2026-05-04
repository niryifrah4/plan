"use client";

import { useState, useEffect, useMemo } from "react";
import { pmt } from "@/lib/financial-math";
import { loadAssumptions } from "@/lib/assumptions";
import { fmtILS } from "@/lib/format";
import { scopedKey } from "@/lib/client-scope";

const TASK_INSIGHTS_KEY = "verdant:task_insights";

/**
 * Affordability Calculator — מחשבון יכולת רכישה
 * Logic:
 *   maxProperty = equity / 0.25 (75% LTV)
 *   maxMortgage = maxProperty - equity
 *   monthlyPayment = PMT(mortgage, rate, years)
 *   affordability check: payment <= 35% × (income - existingDebts)
 */

export function AffordabilityCalc() {
  const [equity, setEquity] = useState(400000);
  const [monthlyIncome, setMonthlyIncome] = useState(28500);
  const [existingDebts, setExistingDebts] = useState(0);
  const [mortgageRate, setMortgageRate] = useState(5.0);
  const [mortgageYears, setMortgageYears] = useState(25);
  const [exported, setExported] = useState(false);

  // Load assumptions on mount
  useEffect(() => {
    const a = loadAssumptions();
    setMonthlyIncome(a.monthlyIncome || 28500);
    // Default mortgage rate: 5% representative rate
    setMortgageRate(5.0);
  }, []);

  const results = useMemo(() => {
    const maxPropertyByEquity = equity / 0.25; // 75% LTV → equity is 25%
    const maxMortgage = maxPropertyByEquity - equity;
    const months = mortgageYears * 12;
    const rate = mortgageRate / 100;
    const monthlyPayment = pmt(maxMortgage, rate, months);

    // Affordability check: payment <= 35% of disposable income
    const disposable = monthlyIncome - existingDebts;
    const maxPaymentAllowed = disposable * 0.35;
    const isAffordable = monthlyPayment <= maxPaymentAllowed;

    // If not affordable, calculate the max mortgage by affordability
    let adjustedMaxProperty = maxPropertyByEquity;
    let adjustedMortgage = maxMortgage;
    let adjustedPayment = monthlyPayment;

    if (!isAffordable && maxPaymentAllowed > 0) {
      // Reverse PMT: find max principal for given payment
      const r = rate / 12;
      if (r > 0) {
        adjustedMortgage = (maxPaymentAllowed * (1 - Math.pow(1 + r, -months))) / r;
      } else {
        adjustedMortgage = maxPaymentAllowed * months;
      }
      adjustedMaxProperty = adjustedMortgage + equity;
      adjustedPayment = maxPaymentAllowed;
    }

    const totalInterest = adjustedPayment * months - adjustedMortgage;
    const paymentToIncomeRatio = disposable > 0 ? (adjustedPayment / disposable) * 100 : 0;

    return {
      maxPropertyByEquity,
      maxMortgage,
      monthlyPayment,
      isAffordable,
      adjustedMaxProperty,
      adjustedMortgage,
      adjustedPayment,
      maxPaymentAllowed,
      disposable,
      totalInterest,
      paymentToIncomeRatio,
      effectiveMax: isAffordable ? maxPropertyByEquity : adjustedMaxProperty,
      effectiveMortgage: isAffordable ? maxMortgage : adjustedMortgage,
      effectivePayment: isAffordable ? monthlyPayment : adjustedPayment,
    };
  }, [equity, monthlyIncome, existingDebts, mortgageRate, mortgageYears]);

  const handleExport = () => {
    try {
      const existing = JSON.parse(localStorage.getItem(scopedKey(TASK_INSIGHTS_KEY)) || "[]");
      existing.push({
        id: `afford-${Date.now()}`,
        source: "מחשבון יכולת רכישה",
        date: new Date().toISOString(),
        text: `יכולת רכישה מקסימלית: ${fmtILS(Math.round(results.effectiveMax))}. משכנתא: ${fmtILS(Math.round(results.effectiveMortgage))}. החזר חודשי: ${fmtILS(Math.round(results.effectivePayment))}. יחס החזר/הכנסה: ${results.paymentToIncomeRatio.toFixed(1)}%.`,
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
        <InputField label="הון עצמי זמין" value={equity} onChange={setEquity} suffix="₪" />
        <InputField
          label="הכנסה חודשית נטו (זוגית)"
          value={monthlyIncome}
          onChange={setMonthlyIncome}
          suffix="₪"
        />
        <InputField
          label="החזרי הלוואות קיימים"
          value={existingDebts}
          onChange={setExistingDebts}
          suffix="₪/חודש"
        />
        <InputField
          label="ריבית משכנתא צפויה"
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
      </div>

      {/* Affordability Alert */}
      {!results.isAffordable && (
        <div
          className="flex items-start gap-3 rounded-xl p-5"
          style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
        >
          <span
            className="material-symbols-outlined mt-0.5 text-[22px]"
            style={{ color: "#b91c1c" }}
          >
            warning
          </span>
          <div>
            <div className="text-[12px] font-extrabold" style={{ color: "#b91c1c" }}>
              חריגה מכושר החזר
            </div>
            <div className="mt-1 text-[11px] font-bold leading-relaxed text-verdant-muted">
              לפי 75% מימון, ההחזר החודשי ({fmtILS(Math.round(results.monthlyPayment))}) עולה על 35%
              מההכנסה הפנויה ({fmtILS(Math.round(results.maxPaymentAllowed))}).
              <br />
              המערכת חישבה מחיר מקסימלי מותאם בהתבסס על כושר ההחזר שלכם.
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="grid grid-cols-3 gap-4">
        <ResultCard
          label="מחיר דירה מקסימלי"
          value={fmtILS(Math.round(results.effectiveMax))}
          icon="home"
          color="#1B4332"
          highlight
        />
        <ResultCard
          label="גובה משכנתא דרוש"
          value={fmtILS(Math.round(results.effectiveMortgage))}
          icon="account_balance"
          color="#012d1d"
        />
        <ResultCard
          label="החזר חודשי משוער"
          value={fmtILS(Math.round(results.effectivePayment))}
          icon="payments"
          color={results.paymentToIncomeRatio > 35 ? "#b91c1c" : "#1B4332"}
        />
      </div>

      {/* Details */}
      <div
        className="space-y-4 rounded-xl p-6"
        style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}
      >
        <div className="caption">פירוט</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <DetailRow
            label="הכנסה פנויה (נטו - חובות)"
            value={fmtILS(Math.round(results.disposable))}
          />
          <DetailRow
            label="תקרת החזר (35%)"
            value={fmtILS(Math.round(results.maxPaymentAllowed))}
          />
          <DetailRow
            label="יחס החזר/הכנסה"
            value={`${results.paymentToIncomeRatio.toFixed(1)}%`}
            color={
              results.paymentToIncomeRatio > 35
                ? "#b91c1c"
                : results.paymentToIncomeRatio > 30
                  ? "#f59e0b"
                  : "#1B4332"
            }
          />
          <DetailRow label="סה״כ ריבית לתקופה" value={fmtILS(Math.round(results.totalInterest))} />
          <DetailRow label="LTV (אחוז מימון)" value="75%" />
          <DetailRow label="ריבית שוק (מהנחות יסוד)" value={`${mortgageRate}%`} />
        </div>

        {/* Visual: Payment ratio bar */}
        <div className="border-t pt-4" style={{ borderColor: "#d8e0d0" }}>
          <div className="mb-2 flex justify-between text-[10px] font-bold text-verdant-muted">
            <span>יחס החזר מהכנסה פנויה</span>
            <span className="tabular">{results.paymentToIncomeRatio.toFixed(1)}% מתוך 35%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full" style={{ background: "#eef2e8" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (results.paymentToIncomeRatio / 35) * 100)}%`,
                background:
                  results.paymentToIncomeRatio > 35
                    ? "#ef4444"
                    : results.paymentToIncomeRatio > 30
                      ? "#f59e0b"
                      : "#1B4332",
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[9px] font-bold text-verdant-muted">
            <span>0%</span>
            <span style={{ color: "#f59e0b" }}>30%</span>
            <span style={{ color: "#b91c1c" }}>35% (תקרה)</span>
          </div>
        </div>
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
