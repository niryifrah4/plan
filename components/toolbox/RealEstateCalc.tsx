"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { fmtILS } from "@/lib/format";
import { analyzeRealEstate, type RealEstateInputs } from "@/lib/financial-math";

const DEFAULTS: RealEstateInputs = {
  purchasePrice: 1_600_000,
  downPayment: 400_000,
  closingCosts: 130_000,
  mortgageRate: 0.045,
  mortgageYears: 25,
  monthlyRent: 5_500,
  vacancyPct: 0.05,
  monthlyExpenses: 800,
  annualAppreciation: 0.03,
  annualRentGrowth: 0.02,
  annualExpenseGrowth: 0.02,
  holdYears: 10,
  exitCostPct: 0.07,
  taxOnSalePct: 0.25,
};

export function RealEstateCalc() {
  const [inputs, setInputs] = useState<RealEstateInputs>(DEFAULTS);
  const result = analyzeRealEstate(inputs);

  function set<K extends keyof RealEstateInputs>(key: K, raw: string) {
    const v = Number(raw);
    if (!Number.isNaN(v)) setInputs((p) => ({ ...p, [key]: v }));
  }

  return (
    <div className="space-y-4">
      {/* Input form */}
      <Card>
        <h3 className="mb-4 text-right text-lg font-extrabold text-verdant-ink">פרמטרים</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field
            label="מחיר נכס"
            value={inputs.purchasePrice}
            onChange={(v) => set("purchasePrice", v)}
          />
          <Field
            label="הון עצמי"
            value={inputs.downPayment}
            onChange={(v) => set("downPayment", v)}
          />
          <Field
            label="עלויות סגירה (מס רכישה + עו״ד)"
            value={inputs.closingCosts}
            onChange={(v) => set("closingCosts", v)}
          />
          <Field
            label="ריבית משכנתא (%)"
            value={inputs.mortgageRate * 100}
            onChange={(v) => set("mortgageRate", String(Number(v) / 100))}
            step="0.1"
          />
          <Field
            label="שנות משכנתא"
            value={inputs.mortgageYears}
            onChange={(v) => set("mortgageYears", v)}
          />
          <Field
            label="שכירות חודשית"
            value={inputs.monthlyRent}
            onChange={(v) => set("monthlyRent", v)}
          />
          <Field
            label="Vacancy (%)"
            value={inputs.vacancyPct * 100}
            onChange={(v) => set("vacancyPct", String(Number(v) / 100))}
            step="0.5"
          />
          <Field
            label="הוצאות חודשיות"
            value={inputs.monthlyExpenses}
            onChange={(v) => set("monthlyExpenses", v)}
          />
          <Field
            label="עליית ערך שנתית (%)"
            value={inputs.annualAppreciation * 100}
            onChange={(v) => set("annualAppreciation", String(Number(v) / 100))}
            step="0.5"
          />
          <Field
            label="עליית שכ״ד שנתית (%)"
            value={inputs.annualRentGrowth * 100}
            onChange={(v) => set("annualRentGrowth", String(Number(v) / 100))}
            step="0.5"
          />
          <Field
            label="שנות החזקה"
            value={inputs.holdYears}
            onChange={(v) => set("holdYears", v)}
          />
          <Field
            label="מס שבח (%)"
            value={inputs.taxOnSalePct * 100}
            onChange={(v) => set("taxOnSalePct", String(Number(v) / 100))}
            step="1"
          />
        </div>
      </Card>

      {/* Results */}
      <Card>
        <h3 className="mb-4 text-right text-lg font-extrabold text-verdant-ink">תוצאות</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="הון עצמי מושקע" value={fmtILS(result.equityInvested)} />
          <Metric label="החזר חודשי (PMT)" value={fmtILS(result.monthlyPMT)} />
          <Metric label="NOI שנתי" value={fmtILS(result.annualNOI)} />
          <Metric
            label="תזרים חודשי נטו"
            value={fmtILS(result.monthlyCashflow)}
            color={result.monthlyCashflow >= 0 ? "#1B4332" : "#b91c1c"}
          />
        </div>

        <div className="my-4 h-px bg-verdant-line" />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Cap Rate" value={`${(result.capRate * 100).toFixed(2)}%`} />
          <Metric
            label="Cash-on-Cash"
            value={`${(result.cashOnCash * 100).toFixed(2)}%`}
            color={result.cashOnCash >= 0 ? "#1B4332" : "#b91c1c"}
          />
          <Metric label="תשואה ברוטו" value={`${(result.grossYield * 100).toFixed(2)}%`} />
          <Metric label="תשואה נטו" value={`${(result.netYield * 100).toFixed(2)}%`} />
        </div>

        <div className="my-4 h-px bg-verdant-line" />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="שווי ביציאה" value={fmtILS(result.exitValue)} />
          <Metric label="תמורה נטו ביציאה" value={fmtILS(result.netProceedsOnExit)} />
          <Metric
            label="רווח כולל"
            value={fmtILS(result.totalProfit)}
            color={result.totalProfit >= 0 ? "#1B4332" : "#b91c1c"}
          />
          <Metric label="מכפיל הון (EM)" value={`×${result.equityMultiple.toFixed(2)}`} />
        </div>

        <div className="my-4 h-px bg-verdant-line" />

        <div
          className="flex items-center justify-between rounded-lg p-4"
          style={{ background: "#1B433211" }}
        >
          <span
            className="tabular text-3xl font-extrabold"
            style={{ color: result.irr >= 0 ? "#1B4332" : "#b91c1c" }}
          >
            {Number.isNaN(result.irr) ? "N/A" : `${(result.irr * 100).toFixed(2)}%`}
          </span>
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
              IRR שנתי
            </div>
            <div className="mt-0.5 text-xs font-bold text-verdant-muted">
              Internal Rate of Return — תשואה פנימית על ההון
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- tiny helpers ---------- */
function Field({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-verdant-muted">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="v-divider tabular mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-bold text-verdant-ink focus:outline-none focus:ring-2 focus:ring-verdant-accent/40"
        dir="ltr"
      />
    </label>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="v-divider rounded-lg border p-3 text-right">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
        {label}
      </div>
      <div className="tabular text-lg font-extrabold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
