"use client";

/**
 * RentVsBuyCalc — does it pay to buy the home or stay renting and invest?
 *
 * Compares two scenarios over `holdingYears`:
 *   BUY:  cash out down payment + closing costs, take mortgage, build
 *         equity each month, watch home value appreciate. Final net worth =
 *         appreciated home value − remaining mortgage balance.
 *   RENT: keep the down payment in the market, also invest the monthly
 *         delta (mortgage − rent) when positive. Final net worth =
 *         compound-growth of all those flows at the investment return rate.
 *
 * Built 2026-05-24 to close a gap vs FiNav's mortgage suite. Israeli-aware
 * defaults: 3% appreciation, 5% market return, 4.5% mortgage rate.
 *
 * Intentionally simple — no maintenance/tax/sale costs in the BUY side, no
 * dividend tax in the RENT side. Order-of-magnitude framing, not a contract.
 */

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";
import { pmt } from "@/lib/financial-math";
import { ToolboxNumberField } from "@/components/toolbox/ToolboxNumberField";

interface YearPoint {
  year: number;
  buyNetWorth: number;
  rentNetWorth: number;
  diff: number; // buy − rent
}

export function RentVsBuyCalc() {
  // ── Inputs ──
  const [homePrice, setHomePrice] = useState(2_500_000);
  const [downPaymentPct, setDownPaymentPct] = useState(25);
  const [mortgageRate, setMortgageRate] = useState(4.5);
  const [mortgageYears, setMortgageYears] = useState(25);
  const [closingCostsPct, setClosingCostsPct] = useState(7); // tax + lawyer + fees
  const [monthlyRent, setMonthlyRent] = useState(7_500);
  const [appreciationPct, setAppreciationPct] = useState(3);
  const [investReturnPct, setInvestReturnPct] = useState(5);
  const [holdingYears, setHoldingYears] = useState(15);
  const [rentGrowthPct, setRentGrowthPct] = useState(2);

  // ── Derived: BUY ──
  const downPayment = Math.round(homePrice * (downPaymentPct / 100));
  const closingCosts = Math.round(homePrice * (closingCostsPct / 100));
  const upfrontCash = downPayment + closingCosts;
  const loanAmount = homePrice - downPayment;
  const monthlyMortgage = pmt(loanAmount, mortgageRate / 100, mortgageYears * 12);

  // ── Year-by-year projection ──
  const projection = useMemo<YearPoint[]>(() => {
    const points: YearPoint[] = [];
    const r = mortgageRate / 100 / 12;

    // RENT-side tracker:
    //   - investmentValue starts with upfrontCash invested
    //   - each month, if mortgageMonthly > currentRent, the delta goes into
    //     the investment too (this is how the renter "wins" when renting
    //     is cheaper than owning)
    let investmentValue = upfrontCash;
    let mortgageBalance = loanAmount;
    let currentRent = monthlyRent;
    const investMonthlyRate = investReturnPct / 100 / 12;

    for (let y = 1; y <= holdingYears; y++) {
      // 12 months of compounding + monthly flow
      for (let m = 0; m < 12; m++) {
        // BUY: mortgage amortization
        if (mortgageBalance > 0) {
          const interest = mortgageBalance * r;
          const principalPaid = Math.max(0, monthlyMortgage - interest);
          mortgageBalance = Math.max(0, mortgageBalance - principalPaid);
        }
        // RENT: invest the monthly delta
        const delta = monthlyMortgage - currentRent;
        investmentValue *= 1 + investMonthlyRate;
        if (delta > 0) investmentValue += delta;
      }
      // Yearly rent escalation
      currentRent *= 1 + rentGrowthPct / 100;

      // Home value with annual appreciation compounded to year y
      const homeValueY = homePrice * Math.pow(1 + appreciationPct / 100, y);
      const buyNetWorth = homeValueY - mortgageBalance;
      const rentNetWorth = investmentValue;

      points.push({
        year: y,
        buyNetWorth: Math.round(buyNetWorth),
        rentNetWorth: Math.round(rentNetWorth),
        diff: Math.round(buyNetWorth - rentNetWorth),
      });
    }
    return points;
  }, [
    homePrice,
    downPaymentPct,
    mortgageRate,
    mortgageYears,
    closingCostsPct,
    monthlyRent,
    appreciationPct,
    investReturnPct,
    holdingYears,
    rentGrowthPct,
    upfrontCash,
    loanAmount,
    monthlyMortgage,
  ]);

  const finalPoint = projection[projection.length - 1];
  const breakEvenYear = projection.find((p) => p.diff >= 0)?.year ?? null;
  const advantage = finalPoint?.diff ?? 0;
  const verdict =
    advantage > 0
      ? { label: "עדיף לקנות", color: "#2C7A5A" }
      : { label: "עדיף לשכור ולהשקיע", color: "#D97706" };

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── Inputs ── */}
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--morning-forest, #2c7a5a)" }}
          >
            home_work
          </span>
          <h3 className="text-base font-extrabold text-verdant-ink">שכירות מול רכישה</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="מחיר הדירה (₪)" value={homePrice} onChange={setHomePrice} />
          <Field
            label="הון עצמי (%)"
            value={downPaymentPct}
            onChange={setDownPaymentPct}
            step={1}
          />
          <Field
            label="ריבית משכנתא (%)"
            value={mortgageRate}
            onChange={setMortgageRate}
            step={0.1}
          />
          <Field
            label="תקופת משכנתא (שנים)"
            value={mortgageYears}
            onChange={setMortgageYears}
            step={1}
          />
          <Field
            label="עלויות נלוות (% — מס רכישה, עו״ד, תיווך)"
            value={closingCostsPct}
            onChange={setClosingCostsPct}
            step={0.5}
          />
          <Field label="שכ״ד חודשי כיום (₪)" value={monthlyRent} onChange={setMonthlyRent} />
          <Field
            label="עליית ערך נדל״ן שנתית (%)"
            value={appreciationPct}
            onChange={setAppreciationPct}
            step={0.5}
          />
          <Field
            label="תשואת תיק השקעות (%)"
            value={investReturnPct}
            onChange={setInvestReturnPct}
            step={0.5}
          />
          <Field
            label="עליית שכ״ד שנתית (%)"
            value={rentGrowthPct}
            onChange={setRentGrowthPct}
            step={0.5}
          />
          <Field
            label="טווח תכנון (שנים)"
            value={holdingYears}
            onChange={setHoldingYears}
            step={1}
          />
        </div>
      </div>

      {/* ── Verdict ── */}
      <div className="card-pad" style={{ borderTop: `4px solid ${verdict.color}` }}>
        <div className="mb-2 text-[12px] font-bold text-verdant-muted">
          תוצאה אחרי {holdingYears} שנה
        </div>
        <div className="mb-3 text-2xl font-extrabold" style={{ color: verdict.color }}>
          {verdict.label} · פער של {fmtILS(Math.abs(advantage))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat
            label="שווי נטו במסלול רכישה"
            value={finalPoint ? fmtILS(finalPoint.buyNetWorth) : "—"}
            sub="שווי דירה פחות יתרת משכנתא"
          />
          <Stat
            label="שווי נטו במסלול שכירות"
            value={finalPoint ? fmtILS(finalPoint.rentNetWorth) : "—"}
            sub="הון עצמי + הפרשי תזרים, מושקעים"
          />
          <Stat
            label="נקודת איזון"
            value={breakEvenYear ? `שנה ${breakEvenYear}` : "אין השוואה"}
            sub={breakEvenYear ? "השנה שבה רכישה משתווה לשכירות" : "השכירות מקדימה לאורך כל הטווח"}
          />
        </div>
      </div>

      {/* ── Per-year table ── */}
      <div className="card-pad">
        <div className="mb-3 text-[13px] font-extrabold text-verdant-ink">השוואה שנה אחר שנה</div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--morning-border, #e5e9dc)" }}>
                <th className="py-2 font-bold text-verdant-muted">שנה</th>
                <th className="py-2 font-bold text-verdant-muted">שווי נטו · רכישה</th>
                <th className="py-2 font-bold text-verdant-muted">שווי נטו · שכירות</th>
                <th className="py-2 font-bold text-verdant-muted">פער</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((p) => (
                <tr
                  key={p.year}
                  className="border-b"
                  style={{ borderColor: "var(--morning-border, #e5e9dc)33" }}
                >
                  <td className="py-1.5 font-bold tabular-nums">{p.year}</td>
                  <td className="py-1.5 tabular-nums">{fmtILS(p.buyNetWorth)}</td>
                  <td className="py-1.5 tabular-nums">{fmtILS(p.rentNetWorth)}</td>
                  <td
                    className="py-1.5 font-extrabold tabular-nums"
                    style={{ color: p.diff >= 0 ? "#2C7A5A" : "#D97706" }}
                  >
                    {p.diff >= 0 ? "+" : ""}
                    {fmtILS(p.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-verdant-muted">
        החישוב מתעלם מהוצאות תחזוקה ומס שבח במכירה (מסלול רכישה) ומס רווחי הון (מסלול שכירות). השווה
        לסדר גודל, לא לאמת מוחלטת.
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 100,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <ToolboxNumberField
      label={label}
      value={value}
      onChange={onChange}
      min={0}
      steps={step < 1 ? [step, step * 5, step * 10] : [step, step * 5, step * 10]}
      labelClassName="mb-1 block text-[11px] font-bold text-verdant-muted"
      buttonClassName="flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-left text-[14px] font-bold text-verdant-ink transition-colors hover:bg-[#FAFAF7]"
      compact
    />
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--morning-leaf-tint, #f5f7f0)",
        border: "1px solid var(--morning-border, #e5e9dc)",
      }}
    >
      <div className="mb-1 text-[10px] font-bold text-verdant-muted">{label}</div>
      <div className="text-lg font-extrabold tabular-nums text-verdant-ink">{value}</div>
      <div className="mt-0.5 text-[10px] text-verdant-muted">{sub}</div>
    </div>
  );
}
