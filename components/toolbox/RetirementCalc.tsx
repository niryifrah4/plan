"use client";

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";
import { israeliIncomeTax } from "@/lib/assumptions";
import { ToolboxNumberField } from "@/components/toolbox/ToolboxNumberField";

function computeTax(annualIncome: number): number {
  return israeliIncomeTax(annualIncome).tax;
}

function estimateTaxRate(annualIncome: number): number {
  return israeliIncomeTax(annualIncome).effectiveRate;
}

/* ── Row helper ── */

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
    <div className="flex justify-between text-[11px]">
      <span className={`text-verdant-muted ${bold ? "font-extrabold" : "font-bold"}`}>{label}</span>
      <span
        className={`${bold ? "text-sm font-extrabold" : "font-extrabold"} tabular`}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/*              RetirementCalc — מחשבון פרישה                  */
/* ══════════════════════════════════════════════════════════ */

export function RetirementCalc() {
  const [yearsOfService, setYearsOfService] = useState(25);
  const [salary, setSalary] = useState(20_000);
  const [totalGrant, setTotalGrant] = useState(300_000);
  const [monthlyPension, setMonthlyPension] = useState(8_000);
  const [retireAge, setRetireAge] = useState(67);
  const [retireYear, setRetireYear] = useState(2026);

  /* ── Section A: Grant Exemption ── */
  const grantCalc = useMemo(() => {
    // תקרת פטור למענק פרישה לפי שנת עבודה (2026): ₪13,750/חודש
    const EXEMPTION_CEILING_MONTHLY = 13_750;
    const exemptionPerYear = Math.min(salary, EXEMPTION_CEILING_MONTHLY);
    const totalExemption = exemptionPerYear * yearsOfService;
    const taxableGrant = Math.max(0, totalGrant - totalExemption);
    return { exemptionPerYear, totalExemption, taxableGrant };
  }, [salary, yearsOfService, totalGrant]);

  /* ── Section B: Tax Spread ── */
  const spreadCalc = useMemo(() => {
    // פריסה אפשרית רק מ-4 שנות ותק ומעלה (שנה אחת לכל 4 שנים, עד 6 שנים)
    const spreadYears = Math.min(6, Math.floor(yearsOfService / 4));
    const taxNoSpread = computeTax(grantCalc.taxableGrant);

    if (spreadYears === 0) {
      // אין זכאות לפריסה — אין חיסכון
      return {
        spreadYears: 0,
        annualSpread: grantCalc.taxableGrant,
        taxNoSpread,
        taxWithSpread: Math.round(taxNoSpread),
        taxSaving: 0,
      };
    }

    const annualSpread = grantCalc.taxableGrant / spreadYears;
    const avgTaxRate = estimateTaxRate(annualSpread);
    const taxWithSpread = annualSpread * avgTaxRate * spreadYears;
    const taxSaving = taxNoSpread - taxWithSpread;

    return {
      spreadYears,
      annualSpread,
      taxNoSpread,
      taxWithSpread: Math.round(taxWithSpread),
      taxSaving: Math.round(taxSaving),
    };
  }, [grantCalc, yearsOfService]);

  /* ── Inputs ── */
  const labelCls = "text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1";

  return (
    <div className="space-y-6">
      {/* ── Inputs Card ── */}
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-verdant-emerald">elderly</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">נתוני פרישה</h3>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <ToolboxNumberField
              label="שנות ותק"
              value={yearsOfService}
              onChange={setYearsOfService}
              min={0}
              steps={[1, 5, 10]}
              labelClassName={labelCls}
              compact
            />
          </div>
          <div>
            <ToolboxNumberField
              label="שכר אחרון (חודשי)"
              value={salary}
              onChange={setSalary}
              suffix="₪"
              min={0}
              labelClassName={labelCls}
              compact
            />
          </div>
          <div>
            <ToolboxNumberField
              label="מענק פרישה כולל"
              value={totalGrant}
              onChange={setTotalGrant}
              suffix="₪"
              min={0}
              labelClassName={labelCls}
              compact
            />
          </div>
          <div>
            <ToolboxNumberField
              label="קצבה צפויה (חודשית)"
              value={monthlyPension}
              onChange={setMonthlyPension}
              suffix="₪"
              min={0}
              labelClassName={labelCls}
              compact
            />
          </div>
          <div>
            <ToolboxNumberField
              label="גיל בפרישה"
              value={retireAge}
              onChange={setRetireAge}
              min={0}
              steps={[1, 5, 10]}
              labelClassName={labelCls}
              compact
            />
          </div>
          <div>
            <ToolboxNumberField
              label="שנת פרישה"
              value={retireYear}
              onChange={setRetireYear}
              min={0}
              steps={[1, 5, 10]}
              labelClassName={labelCls}
              compact
            />
          </div>
        </div>
      </div>

      {/* ── Section A: Grant Exemption ── */}
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-verdant-emerald">shield</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">פטור על מענק פרישה</h3>
        </div>

        <div className="space-y-3 rounded-xl p-4" style={{ background: "#FAFAF7" }}>
          <Row label="תקרת פטור לשנת ותק" value={fmtILS(grantCalc.exemptionPerYear)} />
          <Row
            label={`פטור כולל (${yearsOfService} שנות ותק)`}
            value={fmtILS(grantCalc.totalExemption)}
            color="#2C7A5A"
          />
          <Row label="מענק פרישה" value={fmtILS(totalGrant)} />
          <div className="border-t pt-2" style={{ borderColor: "#E5E7EB" }}>
            <Row
              label="מענק חייב במס"
              value={fmtILS(grantCalc.taxableGrant)}
              color={grantCalc.taxableGrant > 0 ? "#DC2626" : "#2C7A5A"}
              bold
            />
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-verdant-muted">
          * תקרת פטור 2026: &#8362;13,750 לשנת ותק, או השכר — הנמוך מביניהם.
        </p>
      </div>

      {/* ── Section B: Tax Spread ── */}
      <div
        className="rounded-2xl p-5 md:p-6"
        style={{
          background: "linear-gradient(135deg,#2C7A5A 0%,#1F5A42 100%)",
          color: "#FFFFFF",
          boxShadow: "0 8px 24px rgba(44, 122, 90, 0.18)",
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#059669" }}>
            calculate
          </span>
          <h3 className="text-sm font-extrabold text-white">פריסת מס (קדימה)</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-[11px]">
            <span className="font-bold opacity-80">שנות פריסה</span>
            <span className="tabular font-extrabold">{spreadCalc.spreadYears}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="font-bold opacity-80">הכנסה שנתית לפריסה</span>
            <span className="tabular font-extrabold">{fmtILS(spreadCalc.annualSpread)}</span>
          </div>

          <div
            className="mt-3 space-y-2 border-t pt-3"
            style={{ borderColor: "rgba(255,255,255,0.15)" }}
          >
            <div className="flex justify-between text-[11px]">
              <span className="font-bold opacity-80">מס ללא פריסה</span>
              <span className="tabular font-extrabold" style={{ color: "#b91c1c" }}>
                {fmtILS(spreadCalc.taxNoSpread)}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="font-bold opacity-80">מס עם פריסה</span>
              <span className="tabular font-extrabold" style={{ color: "#059669" }}>
                {fmtILS(spreadCalc.taxWithSpread)}
              </span>
            </div>
          </div>

          <div className="mt-3 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
            <div className="flex justify-between text-sm">
              <span className="font-extrabold">חיסכון מפריסה</span>
              <span className="tabular text-lg font-extrabold" style={{ color: "#059669" }}>
                {fmtILS(spreadCalc.taxSaving)}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed opacity-60">
          * פריסה קדימה: עד 6 שנים, בכפוף ל-1 שנת פריסה לכל 4 שנות ותק. שיעורי מס לפי מדרגות 2026.
        </p>
      </div>

      {/* ── Section C: Retsef Comparison ── */}
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-verdant-emerald">compare_arrows</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">רצף קצבה מול רצף פיצויים</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="v-divider border-b text-[10px] font-bold text-verdant-muted">
                <th className="py-2 text-right"></th>
                <th className="px-3 py-2 text-center">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] text-verdant-emerald">
                      check_circle
                    </span>
                    רצף קצבה
                  </span>
                </th>
                <th className="px-3 py-2 text-center">רצף פיצויים</th>
              </tr>
            </thead>
            <tbody className="text-verdant-ink">
              <tr className="v-divider border-b">
                <td className="py-2.5 font-bold text-verdant-muted">תקרה</td>
                <td className="py-2.5 text-center">אין</td>
                <td className="py-2.5 text-center">4 &times; שמ&quot;מ &times; ותק</td>
              </tr>
              <tr className="v-divider border-b">
                <td className="py-2.5 font-bold text-verdant-muted">דד-ליין למעסיק חדש</td>
                <td className="py-2.5 text-center">אין</td>
                <td className="py-2.5 text-center">שנה</td>
              </tr>
              <tr className="v-divider border-b">
                <td className="py-2.5 font-bold text-verdant-muted">צבירת ותק לפטור</td>
                <td className="py-2.5 text-center">לא</td>
                <td className="py-2.5 text-center">כן</td>
              </tr>
              <tr className="v-divider border-b">
                <td className="py-2.5 font-bold text-verdant-muted">פקטור 1.35</td>
                <td className="py-2.5 text-center font-bold" style={{ color: "#2C7A5A" }}>
                  לא (יתרון!)
                </td>
                <td className="py-2.5 text-center">כן</td>
              </tr>
              <tr className="v-divider border-b">
                <td className="py-2.5 font-bold text-verdant-muted">חרטה</td>
                <td className="py-2.5 text-center">בכל עת</td>
                <td className="py-2.5 text-center">תוך שנתיים</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-verdant-muted">מומלץ ב:</td>
                <td className="py-2.5 text-center font-bold" style={{ color: "#2C7A5A" }}>
                  רוב המקרים
                </td>
                <td className="py-2.5 text-center text-verdant-muted">ותק קצר + שכר נמוך</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-verdant-muted">
          * רצף קצבה מומלץ ברוב המקרים. רצף פיצויים משתלם רק בוותק קצר ושכר נמוך. מומלץ להתייעץ עם
          רו&quot;ח.
        </p>
      </div>
    </div>
  );
}
