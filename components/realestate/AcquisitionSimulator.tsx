"use client";

import { useState, useMemo } from "react";
import { analyzeRealEstate, calcPurchaseTax } from "@/lib/financial-math";
import { loadAssumptions } from "@/lib/assumptions";
import { fmtILS } from "@/lib/format";

export function AcquisitionSimulator() {
  const [open, setOpen] = useState(false);
  const assumptions = loadAssumptions();

  const [price, setPrice] = useState(2_000_000);
  const [equity, setEquity] = useState(1_000_000);
  const [rent, setRent] = useState(5_500);
  const [expenses, setExpenses] = useState(800);
  const [rate, setRate] = useState(Math.round((assumptions.primeRate + 0.012) * 1000) / 10);
  const [years, setYears] = useState(10);
  const [appreciation, setAppreciation] = useState(3.0);
  // Primary residence = 0% up to ~1.98M (massive savings vs investor).
  // Default to "investor" — most simulator users are planning an investment.
  const [propertyKind, setPropertyKind] = useState<"primary" | "investor">("investor");

  const result = useMemo(() => {
    const purchaseTax = calcPurchaseTax(price, propertyKind);
    const lawyerFees = Math.round(price * 0.005 + 2500);
    const closingCosts = purchaseTax + lawyerFees;

    const analysis = analyzeRealEstate({
      purchasePrice: price,
      downPayment: equity,
      closingCosts,
      mortgageRate: rate / 100,
      mortgageYears: 25,
      monthlyRent: rent,
      vacancyPct: 0.05,
      monthlyExpenses: expenses,
      annualAppreciation: appreciation / 100,
      annualRentGrowth: 0.02,
      annualExpenseGrowth: 0.02,
      holdYears: years,
      exitCostPct: 0.07,
      taxOnSalePct: 0.25,
      inflationRate: assumptions.inflationRate, // real gain for מס שבח
    });

    const dscr = analysis.monthlyPMT > 0 ? analysis.annualNOI / 12 / analysis.monthlyPMT : 0;

    return { ...analysis, purchaseTax, closingCosts, dscr };
  }, [
    price,
    equity,
    rent,
    expenses,
    rate,
    years,
    appreciation,
    propertyKind,
    assumptions.inflationRate,
  ]);

  // Verdict
  const coc = result.cashOnCash * 100;
  const verdict =
    coc > 5 && result.dscr > 1.2
      ? { label: "כדאי", color: "#2C7A5A", bg: "#FAFAF7", icon: "thumb_up" }
      : coc > 0 && result.dscr >= 1.0
        ? { label: "שווה בדיקה", color: "#D97706", bg: "rgba(217,119,6,0.08)", icon: "help" }
        : { label: "לא כדאי", color: "#DC2626", bg: "rgba(220,38,38,0.08)", icon: "thumb_down" };

  const inputCls =
    "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-verdant-emerald/30 bg-[#FFFFFF] text-verdant-ink text-left";
  const labelCls = "text-[10px] font-bold text-verdant-muted block mb-1";

  return (
    <section className="v-card mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-[#FFFFFF]"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            calculate
          </span>
          <span className="text-sm font-extrabold text-verdant-ink">סימולטור רכישת נכס חדש</span>
        </div>
        <span
          className="material-symbols-outlined text-[18px] text-verdant-muted transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="v-divider border-t px-5 pb-5">
          {/* Property kind toggle — affects purchase tax dramatically */}
          <div className="mb-3 mt-4 flex items-center gap-2">
            <span className="text-[11px] font-bold text-verdant-muted">סוג נכס:</span>
            <div
              className="inline-flex overflow-hidden rounded-lg border"
              style={{ borderColor: "#E5E7EB" }}
            >
              <button
                type="button"
                onClick={() => setPropertyKind("primary")}
                className="px-3 py-1.5 text-[11px] font-bold transition-colors"
                style={{
                  background: propertyKind === "primary" ? "#2C7A5A" : "#FFFFFF",
                  color: propertyKind === "primary" ? "#FFFFFF" : "#1A1A1A",
                }}
              >
                דירה יחידה
              </button>
              <button
                type="button"
                onClick={() => setPropertyKind("investor")}
                className="px-3 py-1.5 text-[11px] font-bold transition-colors"
                style={{
                  background: propertyKind === "investor" ? "#2C7A5A" : "#FFFFFF",
                  color: propertyKind === "investor" ? "#FFFFFF" : "#1A1A1A",
                }}
              >
                נכס להשקעה
              </button>
            </div>
            <span className="text-[10px] text-verdant-muted">
              {propertyKind === "primary" ? "מס רכישה פטור עד ~1.98M ₪" : "8% מהשקל הראשון"}
            </span>
          </div>

          {/* Inputs */}
          <div className="mb-5 mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className={labelCls}>מחיר נכס (₪)</label>
              <input
                className={inputCls}
                type="number"
                value={price}
                onChange={(e) => setPrice(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>הון עצמי (₪)</label>
              <input
                className={inputCls}
                type="number"
                value={equity}
                onChange={(e) => setEquity(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>שכ״ד צפוי (₪/חודש)</label>
              <input
                className={inputCls}
                type="number"
                value={rent}
                onChange={(e) => setRent(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>הוצאות חודשיות (₪)</label>
              <input
                className={inputCls}
                type="number"
                value={expenses}
                onChange={(e) => setExpenses(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>ריבית משכנתא (%)</label>
              <input
                className={inputCls}
                type="number"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>שנות החזקה</label>
              <input
                className={inputCls}
                type="number"
                value={years}
                onChange={(e) => setYears(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>עליית ערך שנתית (%)</label>
              <input
                className={inputCls}
                type="number"
                step="0.5"
                value={appreciation}
                onChange={(e) => setAppreciation(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>מס רכישה</label>
              <div className="tabular text-sm font-extrabold" style={{ color: "#DC2626" }}>
                {fmtILS(Math.round(result.purchaseTax))}
              </div>
            </div>
          </div>

          {/* Verdict */}
          <div
            className="mb-4 flex items-center gap-3 rounded-xl p-4"
            style={{ background: verdict.bg, border: `1.5px solid ${verdict.color}30` }}
          >
            <span
              className="material-symbols-outlined text-[28px]"
              style={{ color: verdict.color }}
            >
              {verdict.icon}
            </span>
            <div>
              <div className="text-base font-extrabold" style={{ color: verdict.color }}>
                {verdict.label}
              </div>
              <div className="text-[11px] text-verdant-muted">
                CoC: {coc.toFixed(1)}% · DSCR: {result.dscr.toFixed(2)} · IRR:{" "}
                {(result.irr * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Output metrics */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Cap Rate" value={`${(result.capRate * 100).toFixed(1)}%`} />
            <MetricCard
              label="Cash-on-Cash"
              value={`${coc.toFixed(1)}%`}
              color={coc > 5 ? "#2C7A5A" : coc > 0 ? "#D97706" : "#DC2626"}
            />
            <MetricCard label="Net Yield" value={`${(result.netYield * 100).toFixed(1)}%`} />
            <MetricCard label="IRR" value={`${(result.irr * 100).toFixed(1)}%`} color="#2C7A5A" />
            <MetricCard label="מכפיל הון" value={`${result.equityMultiple.toFixed(2)}x`} />
            <MetricCard
              label="תזרים חודשי"
              value={fmtILS(Math.round(result.monthlyCashflow))}
              color={result.monthlyCashflow >= 0 ? "#2C7A5A" : "#DC2626"}
            />
            <MetricCard label="החזר משכנתא" value={fmtILS(Math.round(result.monthlyPMT))} />
            <MetricCard
              label="DSCR"
              value={result.dscr.toFixed(2)}
              color={result.dscr >= 1.2 ? "#2C7A5A" : result.dscr >= 1.0 ? "#D97706" : "#DC2626"}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-lg p-3 text-center"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
    >
      <div className="mb-0.5 text-[10px] font-semibold" style={{ color: "#6B7280" }}>
        {label}
      </div>
      <div className="tabular text-sm font-extrabold" style={{ color: color ?? "#1A1A1A" }}>
        {value}
      </div>
    </div>
  );
}
