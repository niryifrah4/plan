"use client";

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";

/* ── Tax Brackets (Israel 2025) ── */

function estimateTaxRate(annualIncome: number): number {
  const brackets = [
    { limit: 84_120, rate: 0.10 },
    { limit: 120_720, rate: 0.14 },
    { limit: 193_800, rate: 0.20 },
    { limit: 269_280, rate: 0.31 },
    { limit: 560_280, rate: 0.35 },
    { limit: 721_560, rate: 0.47 },
    { limit: Infinity, rate: 0.50 },
  ];
  let tax = 0, prev = 0;
  for (const b of brackets) {
    if (annualIncome <= prev) break;
    const slice = Math.min(annualIncome, b.limit) - prev;
    tax += slice * b.rate;
    prev = b.limit;
  }
  return annualIncome > 0 ? tax / annualIncome : 0;
}

function computeTax(annualIncome: number): number {
  const brackets = [
    { limit: 84_120, rate: 0.10 },
    { limit: 120_720, rate: 0.14 },
    { limit: 193_800, rate: 0.20 },
    { limit: 269_280, rate: 0.31 },
    { limit: 560_280, rate: 0.35 },
    { limit: 721_560, rate: 0.47 },
    { limit: Infinity, rate: 0.50 },
  ];
  let tax = 0, prev = 0;
  for (const b of brackets) {
    if (annualIncome <= prev) break;
    const slice = Math.min(annualIncome, b.limit) - prev;
    tax += slice * b.rate;
    prev = b.limit;
  }
  return tax;
}

/* ── Row helper ── */

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className={`text-verdant-muted ${bold ? "font-extrabold" : "font-bold"}`}>{label}</span>
      <span className={`${bold ? "font-extrabold text-sm" : "font-extrabold"} tabular`} style={{ color }}>{value}</span>
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
    const EXEMPTION_CEILING_2025 = 13_750;
    const exemptionPerYear = Math.min(salary, EXEMPTION_CEILING_2025);
    const totalExemption = exemptionPerYear * yearsOfService;
    const taxableGrant = Math.max(0, totalGrant - totalExemption);
    return { exemptionPerYear, totalExemption, taxableGrant };
  }, [salary, yearsOfService, totalGrant]);

  /* ── Section B: Tax Spread ── */
  const spreadCalc = useMemo(() => {
    const spreadYears = Math.min(6, Math.floor(yearsOfService / 4));
    const annualSpread = spreadYears > 0 ? grantCalc.taxableGrant / spreadYears : grantCalc.taxableGrant;

    const taxNoSpread = computeTax(grantCalc.taxableGrant);
    const avgTaxRate = estimateTaxRate(annualSpread);
    const taxWithSpread = annualSpread * avgTaxRate * spreadYears;
    const taxSaving = taxNoSpread - taxWithSpread;

    return { spreadYears, annualSpread, taxNoSpread, taxWithSpread: Math.round(taxWithSpread), taxSaving: Math.round(taxSaving) };
  }, [grantCalc, yearsOfService]);

  /* ── Inputs ── */
  const inputCls =
    "flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular";
  const wrapCls =
    "flex items-center border rounded-lg px-3 py-2";
  const labelCls =
    "text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1";

  return (
    <div className="space-y-6">
      {/* ── Inputs Card ── */}
      <div className="card-pad">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">elderly</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">נתוני פרישה</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>שנות ותק</label>
            <div className={wrapCls} style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={yearsOfService} onChange={e => setYearsOfService(Number(e.target.value))}
                className={inputCls} dir="ltr" />
            </div>
          </div>
          <div>
            <label className={labelCls}>שכר אחרון (חודשי)</label>
            <div className={wrapCls} style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={salary} onChange={e => setSalary(Number(e.target.value))}
                className={inputCls} dir="ltr" />
              <span className="text-xs text-verdant-muted font-bold">&#8362;</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>מענק פרישה כולל</label>
            <div className={wrapCls} style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={totalGrant} onChange={e => setTotalGrant(Number(e.target.value))}
                className={inputCls} dir="ltr" />
              <span className="text-xs text-verdant-muted font-bold">&#8362;</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>קצבה צפויה (חודשית)</label>
            <div className={wrapCls} style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={monthlyPension} onChange={e => setMonthlyPension(Number(e.target.value))}
                className={inputCls} dir="ltr" />
              <span className="text-xs text-verdant-muted font-bold">&#8362;</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>גיל בפרישה</label>
            <div className={wrapCls} style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={retireAge} onChange={e => setRetireAge(Number(e.target.value))}
                className={inputCls} dir="ltr" />
            </div>
          </div>
          <div>
            <label className={labelCls}>שנת פרישה</label>
            <div className={wrapCls} style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={retireYear} onChange={e => setRetireYear(Number(e.target.value))}
                className={inputCls} dir="ltr" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section A: Grant Exemption ── */}
      <div className="card-pad">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">shield</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">פטור על מענק פרישה</h3>
        </div>

        <div className="rounded-xl p-4 space-y-3" style={{ background: "#f4f7ed" }}>
          <Row label="תקרת פטור לשנת ותק" value={fmtILS(grantCalc.exemptionPerYear)} />
          <Row label={`פטור כולל (${yearsOfService} שנות ותק)`} value={fmtILS(grantCalc.totalExemption)} color="#1B4332" />
          <Row label="מענק פרישה" value={fmtILS(totalGrant)} />
          <div className="border-t pt-2" style={{ borderColor: "#d8e0d0" }}>
            <Row label="מענק חייב במס" value={fmtILS(grantCalc.taxableGrant)} color={grantCalc.taxableGrant > 0 ? "#b91c1c" : "#1B4332"} bold />
          </div>
        </div>

        <p className="text-[10px] text-verdant-muted mt-3 leading-relaxed">
          * תקרת פטור 2025: &#8362;13,750 לשנת ותק, או השכר — הנמוך מביניהם.
        </p>
      </div>

      {/* ── Section B: Tax Spread ── */}
      <div className="rounded-2xl p-5 md:p-6" style={{ background: "linear-gradient(135deg,#012d1d 0%,#064e32 50%,#1B4332 100%)", color: "#fff" }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#2B694D" }}>calculate</span>
          <h3 className="text-sm font-extrabold text-white">פריסת מס (קדימה)</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-[11px]">
            <span className="opacity-80 font-bold">שנות פריסה</span>
            <span className="font-extrabold tabular">{spreadCalc.spreadYears}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="opacity-80 font-bold">הכנסה שנתית לפריסה</span>
            <span className="font-extrabold tabular">{fmtILS(spreadCalc.annualSpread)}</span>
          </div>

          <div className="border-t pt-3 mt-3 space-y-2" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
            <div className="flex justify-between text-[11px]">
              <span className="opacity-80 font-bold">מס ללא פריסה</span>
              <span className="font-extrabold tabular" style={{ color: "#fca5a5" }}>{fmtILS(spreadCalc.taxNoSpread)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="opacity-80 font-bold">מס עם פריסה</span>
              <span className="font-extrabold tabular" style={{ color: "#2B694D" }}>{fmtILS(spreadCalc.taxWithSpread)}</span>
            </div>
          </div>

          <div className="border-t pt-3 mt-3" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
            <div className="flex justify-between text-sm">
              <span className="font-extrabold">חיסכון מפריסה</span>
              <span className="font-extrabold text-lg tabular" style={{ color: "#2B694D" }}>{fmtILS(spreadCalc.taxSaving)}</span>
            </div>
          </div>
        </div>

        <p className="text-[10px] opacity-60 mt-3 leading-relaxed">
          * פריסה קדימה: עד 6 שנים, בכפוף ל-1 שנת פריסה לכל 4 שנות ותק. שיעורי מס לפי מדרגות 2025.
        </p>
      </div>

      {/* ── Section C: Retsef Comparison ── */}
      <div className="card-pad">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">compare_arrows</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">רצף קצבה מול רצף פיצויים</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-verdant-muted font-bold border-b v-divider">
                <th className="py-2 text-right"></th>
                <th className="py-2 text-center px-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] text-verdant-emerald">check_circle</span>
                    רצף קצבה
                  </span>
                </th>
                <th className="py-2 text-center px-3">רצף פיצויים</th>
              </tr>
            </thead>
            <tbody className="text-verdant-ink">
              <tr className="border-b v-divider">
                <td className="py-2.5 font-bold text-verdant-muted">תקרה</td>
                <td className="py-2.5 text-center">אין</td>
                <td className="py-2.5 text-center">4 &times; שמ&quot;מ &times; ותק</td>
              </tr>
              <tr className="border-b v-divider">
                <td className="py-2.5 font-bold text-verdant-muted">דד-ליין למעסיק חדש</td>
                <td className="py-2.5 text-center">אין</td>
                <td className="py-2.5 text-center">שנה</td>
              </tr>
              <tr className="border-b v-divider">
                <td className="py-2.5 font-bold text-verdant-muted">צבירת ותק לפטור</td>
                <td className="py-2.5 text-center">לא</td>
                <td className="py-2.5 text-center">כן</td>
              </tr>
              <tr className="border-b v-divider">
                <td className="py-2.5 font-bold text-verdant-muted">פקטור 1.35</td>
                <td className="py-2.5 text-center font-bold" style={{ color: "#1B4332" }}>לא (יתרון!)</td>
                <td className="py-2.5 text-center">כן</td>
              </tr>
              <tr className="border-b v-divider">
                <td className="py-2.5 font-bold text-verdant-muted">חרטה</td>
                <td className="py-2.5 text-center">בכל עת</td>
                <td className="py-2.5 text-center">תוך שנתיים</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold text-verdant-muted">מומלץ ב:</td>
                <td className="py-2.5 text-center font-bold" style={{ color: "#1B4332" }}>רוב המקרים</td>
                <td className="py-2.5 text-center text-verdant-muted">ותק קצר + שכר נמוך</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-verdant-muted mt-3 leading-relaxed">
          * רצף קצבה מומלץ ברוב המקרים. רצף פיצויים משתלם רק בוותק קצר ושכר נמוך. מומלץ להתייעץ עם רו&quot;ח.
        </p>
      </div>
    </div>
  );
}
