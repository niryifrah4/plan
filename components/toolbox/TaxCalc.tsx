"use client";

import { useState, useMemo } from "react";
import { fmtILS, fmtPct } from "@/lib/format";
import { israeliIncomeTax, bituachLeumiEstimate } from "@/lib/assumptions";
import { capitalGainsTax } from "@/lib/financial-math";
import { ToolboxNumberField } from "@/components/toolbox/ToolboxNumberField";

type IncomeType = "employment" | "passive";

/**
 * Passive (non-personal-effort) income tax — section 121(b) of the Israeli Income Tax Ordinance:
 * for taxpayers under age 60, the minimum marginal rate on non-earned income is 31%.
 * In practice we replace the 10%/14%/20% brackets with a flat 31% floor up to the 31% bracket ceiling.
 */
function passiveIncomeTaxUnder60(annualIncome: number) {
  // 35% ceiling 560,280 — synced with TAX_BRACKETS_2026 in lib/assumptions.ts.
  // Was 565,920 (legacy draft); the official 2026 indexation uses 560,280.
  const brackets = [
    { limit: 301_200, rate: 0.31 },
    { limit: 560_280, rate: 0.35 },
    { limit: 721_560, rate: 0.47 },
    { limit: Infinity, rate: 0.5 },
  ];
  let remaining = annualIncome;
  let totalTax = 0;
  let marginalBracket = 0.31;
  let prev = 0;
  for (const b of brackets) {
    const taxable = Math.min(remaining, b.limit - prev);
    if (taxable <= 0) break;
    totalTax += taxable * b.rate;
    marginalBracket = b.rate;
    remaining -= taxable;
    prev = b.limit;
  }
  return {
    tax: totalTax,
    effectiveRate: annualIncome > 0 ? totalTax / annualIncome : 0,
    marginalBracket,
  };
}

export function TaxCalc() {
  const [monthlyGross, setMonthlyGross] = useState(28500);
  const [incomeType, setIncomeType] = useState<IncomeType>("employment");
  const [age, setAge] = useState(42);
  const [capitalGains, setCapitalGains] = useState(0);
  const [costBasis, setCostBasis] = useState(0);
  const [creditPoints, setCreditPoints] = useState(2.25);

  const annualIncome = monthlyGross * 12;
  const passiveFloorApplies = incomeType === "passive" && age < 60;

  const incomeTax = useMemo(
    () =>
      passiveFloorApplies ? passiveIncomeTaxUnder60(annualIncome) : israeliIncomeTax(annualIncome),
    [annualIncome, passiveFloorApplies]
  );
  // Bituach Leumi applies to earned income only — passive income has separate (lower) rates
  // not modeled here, so we surface 0 for passive to avoid double-counting.
  const bituachLeumi = useMemo(
    () =>
      incomeType === "employment" ? bituachLeumiEstimate(monthlyGross) : { monthly: 0, annual: 0 },
    [monthlyGross, incomeType]
  );
  const cgt = useMemo(
    () => capitalGainsTax(costBasis, costBasis + capitalGains),
    [capitalGains, costBasis]
  );

  // נקודות זיכוי: 1 נקודה = ₪2,904/שנה (2026) = ₪242/חודש.
  // נקודות זיכוי תקפות רק להכנסה מיגיעה אישית (סעיף 36 לפקודה).
  const creditPerPointMonthly = 242;
  const effectiveCreditPoints = incomeType === "employment" ? creditPoints : 0;
  const monthlyCredit = effectiveCreditPoints * creditPerPointMonthly;
  const monthlyIncomeTax = Math.max(0, incomeTax.tax / 12 - monthlyCredit);

  const totalMonthlyDeductions = monthlyIncomeTax + bituachLeumi.monthly;
  const netMonthly = monthlyGross - totalMonthlyDeductions;

  return (
    <div className="space-y-6">
      {/* Income Tax Section */}
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-verdant-emerald">receipt_long</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">מס הכנסה שולי</h3>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <TaxNumberField
              label={incomeType === "employment" ? "משכורת ברוטו חודשית" : "הכנסה חודשית ברוטו"}
              value={monthlyGross}
              onChange={setMonthlyGross}
              suffix="₪"
            />
          </div>
          <div>
            <TaxNumberField
              label="נקודות זיכוי"
              value={creditPoints}
              onChange={setCreditPoints}
              disabled={incomeType === "passive"}
              steps={[0.25, 0.5, 1]}
            />
          </div>
          <div>
            <TaxNumberField label="גיל" value={age} onChange={setAge} steps={[1, 5, 10]} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              סוג הכנסה
            </label>
            <select
              value={incomeType}
              onChange={(e) => setIncomeType(e.target.value as IncomeType)}
              className="w-full rounded-lg border px-3 py-2 text-sm font-bold outline-none"
              style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            >
              <option value="employment">יגיעה אישית (שכיר/עצמאי)</option>
              <option value="passive">שלא מיגיעה (השקעות, שכ&quot;ד)</option>
            </select>
          </div>
        </div>

        {passiveFloorApplies && (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg p-3 text-[11px] leading-relaxed"
            style={{ background: "rgba(139,92,246,0.08)", color: "#5b21b6" }}
          >
            <span className="material-symbols-outlined text-[16px]">info</span>
            <span>
              סעיף 121(ב): מתחת לגיל 60, הכנסה שלא מיגיעה אישית חייבת במס במדרגה מינימלית של 31%.
              נקודות זיכוי וביטוח לאומי לא חלים.
            </span>
          </div>
        )}

        {/* Tax breakdown */}
        <div className="space-y-3 rounded-xl p-4" style={{ background: "#FAFAF7" }}>
          <Row label="הכנסה שנתית" value={fmtILS(annualIncome)} />
          <Row label="מס הכנסה לפני זיכוי" value={fmtILS(incomeTax.tax / 12)} color="#DC2626" />
          <Row
            label={`זיכוי נקודות (${creditPoints})`}
            value={`-${fmtILS(monthlyCredit)}`}
            color="#2C7A5A"
          />
          <Row label="מס הכנסה חודשי" value={fmtILS(monthlyIncomeTax)} color="#DC2626" />
          <Row
            label="שיעור מס אפקטיבי"
            value={fmtPct(annualIncome > 0 ? ((monthlyIncomeTax * 12) / annualIncome) * 100 : 0)}
          />
          <Row
            label="מדרגת מס שולי"
            value={fmtPct(incomeTax.marginalBracket * 100)}
            color="#DC2626"
          />
          <div className="border-t pt-2" style={{ borderColor: "#E5E7EB" }}>
            <Row label="ביטוח לאומי חודשי" value={fmtILS(bituachLeumi.monthly)} color="#DC2626" />
          </div>
          <div className="border-t pt-2" style={{ borderColor: "#E5E7EB" }}>
            <Row label="נטו חודשי (אומדן)" value={fmtILS(netMonthly)} bold color="#2C7A5A" />
          </div>
        </div>
      </div>

      {/* Capital Gains Section */}
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-verdant-emerald">trending_up</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">מס רווח הון</h3>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4">
          <div>
            <TaxNumberField
              label="עלות מקורית"
              value={costBasis}
              onChange={setCostBasis}
              suffix="₪"
            />
          </div>
          <div>
            <TaxNumberField
              label="רווח הון"
              value={capitalGains}
              onChange={setCapitalGains}
              suffix="₪"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl p-4" style={{ background: "#FAFAF7" }}>
          <Row label="רווח הון נומינלי" value={fmtILS(cgt.gain)} />
          <Row label="מס רווח הון (25%)" value={fmtILS(cgt.tax)} color="#DC2626" />
          <Row label="נטו לאחר מס" value={fmtILS(cgt.netAfterTax)} bold color="#2C7A5A" />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-verdant-muted">{label}</span>
      <span
        className={`tabular text-xs ${bold ? "font-extrabold" : "font-bold"}`}
        style={{ color: color || "#1A1A1A" }}
      >
        {value}
      </span>
    </div>
  );
}

function TaxNumberField({
  label,
  value,
  onChange,
  suffix,
  steps,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  steps?: number[];
  disabled?: boolean;
}) {
  return (
    <ToolboxNumberField
      label={label}
      value={value}
      onChange={onChange}
      suffix={suffix}
      steps={steps}
      min={0}
      disabled={disabled}
      compact
    />
  );
}
