"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  New-Property Simulator Drawer
 * ═══════════════════════════════════════════════════════════
 *
 * Bottom drawer that opens when the advisor clicks "אם אקנה נכס".
 * 4 numeric inputs + 2 advanced toggles (first-home + income-for-PTI).
 * Three side-by-side cards: היום / אחרי / הפרש.
 *
 * Per CLAUDE.md: no sliders, ₪ outputs, side-by-side comparison, story
 * footer that translates the delta into a one-sentence verdict.
 */

import { useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import type { Property } from "@/lib/realestate-store";
import type { MortgageData } from "@/lib/debt-store";
import {
  snapshotPortfolio,
  simulateNewProperty,
  type NewPropertyInputs,
} from "@/lib/realestate-acquisition";

interface Props {
  properties: Property[];
  mortgage: MortgageData | undefined;
  onClose: () => void;
}

export function NewPropertyDrawer({ properties, mortgage, onClose }: Props) {
  const today = useMemo(() => snapshotPortfolio(properties, mortgage), [properties, mortgage]);

  const [price, setPrice] = useState(2_500_000);
  const [ownEquity, setOwnEquity] = useState(750_000);
  const [monthlyRent, setMonthlyRent] = useState(7_500);
  const [monthlyExpenses, setMonthlyExpenses] = useState(800);
  const [monthlyMortgage, setMonthlyMortgage] = useState(8_500);
  const [isFirstHome, setIsFirstHome] = useState(properties.length === 0);
  const [monthlyIncome, setMonthlyIncome] = useState<number | "">("");
  const [otherDebt, setOtherDebt] = useState<number | "">("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputs: NewPropertyInputs = {
    price, ownEquity, monthlyRent, monthlyExpenses, monthlyMortgage, isFirstHome,
    monthlyIncome: typeof monthlyIncome === "number" ? monthlyIncome : undefined,
    otherMonthlyDebt: typeof otherDebt === "number" ? otherDebt : undefined,
  };
  const result = useMemo(() => simulateNewProperty(today, inputs), [today, inputs]);

  return (
    <div className="fixed inset-0 z-50 flex items-end" dir="rtl">
      <div className="absolute inset-0" style={{ background: "rgba(1,45,29,0.55)" }} onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-3xl mx-auto bg-white rounded-t-3xl shadow-2xl overflow-y-auto animate-slide-up"
        style={{ maxHeight: "92vh", background: "#F9FAF2" }}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between p-5 border-b v-divider" style={{ background: "#F9FAF2" }}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-verdant-muted">סימולטור</div>
            <div className="text-base font-extrabold text-verdant-ink mt-0.5">
              אם אקנה נכס נוסף בעלות {fmtILS(price)}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(1,45,29,0.06)", color: "#012D1D" }} aria-label="סגור">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        <div className="p-5">
          {/* Three result cards: today / after / delta */}
          <section className="grid grid-cols-3 gap-3 mb-6">
            <ResultBlock label="הון נטו · היום" value={today.netEquity} tone="muted" />
            <ResultBlock label="הון נטו · אחרי" value={result.after.netEquity} tone="accent" />
            <ResultBlock label="הפרש" value={result.delta.netEquity} tone={result.delta.netEquity > 0 ? "positive" : "negative"} showSign />
          </section>

          {/* Inputs — direct numeric typing */}
          <section className="v-card p-4 mb-5">
            <h3 className="text-[12px] font-extrabold text-verdant-ink mb-3">פרטי הנכס</h3>
            <NumberRow label="מחיר רכישה"           value={price}            onChange={setPrice}            suffix="₪" />
            <NumberRow label="הון עצמי שאשים"      value={ownEquity}        onChange={setOwnEquity}        suffix="₪" />
            <NumberRow label="שכ״ד צפוי / חודש"    value={monthlyRent}      onChange={setMonthlyRent}      suffix="₪" />
            <NumberRow label="הוצאות / חודש"       value={monthlyExpenses}  onChange={setMonthlyExpenses}  suffix="₪" />
            <NumberRow label="החזר משכנתא / חודש"  value={monthlyMortgage}  onChange={setMonthlyMortgage}  suffix="₪" />
            <div className="flex items-center justify-between gap-4 py-2.5 border-b" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
              <div className="text-[13px] font-bold text-verdant-ink">דירה ראשונה?</div>
              <div className="flex gap-1">
                <ToggleBtn active={isFirstHome} onClick={() => setIsFirstHome(true)}>כן</ToggleBtn>
                <ToggleBtn active={!isFirstHome} onClick={() => setIsFirstHome(false)}>לא — מס נוסף</ToggleBtn>
              </div>
            </div>
          </section>

          {/* Closing-cost breakdown */}
          <section className="v-card p-4 mb-5">
            <h3 className="text-[12px] font-extrabold text-verdant-ink mb-3">עלויות חד-פעמיות בעת הרכישה</h3>
            <div className="grid grid-cols-2 gap-3">
              <MiniRow label="מס רכישה" value={result.closing.purchaseTax} />
              <MiniRow label="עמלת תיווך (2.34%)" value={result.closing.brokerage} />
              <MiniRow label="עו״ד + רישום (~1%)" value={result.closing.legalAndRegistration} />
              <MiniRow label="סה״כ עלויות" value={result.closing.total} bold />
            </div>
            <div className="text-[11px] text-verdant-muted mt-3 pt-3 border-t" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
              <span className="font-bold text-verdant-ink">סה״כ מזומן נדרש בעת החתימה: </span>
              <span className="font-extrabold tabular text-[13px]" style={{ color: "#012D1D" }}>{fmtILS(result.totalCashNeeded)}</span>
              <span> · משכנתא חדשה: </span>
              <span className="font-bold tabular text-verdant-ink">{fmtILS(result.newMortgageAmount)}</span>
            </div>
          </section>

          {/* Bank-approval check (PTI) */}
          <section className="v-card p-4 mb-5">
            <h3 className="text-[12px] font-extrabold text-verdant-ink mb-3">בדיקת אישור הבנק (PTI)</h3>
            <p className="text-[11px] text-verdant-muted mb-3 leading-5">
              הבנק מחייב שסך החזרי החוב יהיו עד 40% מההכנסה הנקייה. השאר את השדות ריקים אם אין צורך לבדוק.
            </p>
            <NumberRow label="הכנסה נטו / חודש"  value={monthlyIncome}  onChange={(v) => setMonthlyIncome(v === 0 ? "" : v)}  suffix="₪" allowEmpty />
            <NumberRow label="החזרי חוב אחרים / חודש" value={otherDebt} onChange={(v) => setOtherDebt(v === 0 ? "" : v)}  suffix="₪" allowEmpty />
            {result.ptiRatio !== null && (
              <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
                <span className="text-[12px] font-bold text-verdant-ink">PTI אחרי הרכישה:</span>
                <PTIBadge ratio={result.ptiRatio} verdict={result.bankVerdict} />
              </div>
            )}
          </section>

          {/* Other 4 KPIs side-by-side */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SmallStat label="תזרים / חודש"  before={today.monthlyNetCashflow}  after={result.after.monthlyNetCashflow} />
            <SmallStat label="חוב פתוח"     before={today.totalMortgageBalance} after={result.after.totalMortgageBalance} positiveLower />
            <SmallStat label="LTV"           before={today.ltv}                  after={result.after.ltv} suffix="%" decimals={0} positiveLower />
            <SmallStat label="שווי נכסים"    before={today.totalValue}            after={result.after.totalValue} />
          </section>

          {/* Story footer */}
          <section
            className="rounded-2xl p-5 mb-4"
            style={{ background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)", color: "#F9FAF2" }}
          >
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
              הסיפור
            </div>
            <Story result={result} today={today} />
          </section>

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-bold" style={{ background: "rgba(1,45,29,0.06)", color: "#012D1D" }}>
              סגור
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slideUp 220ms ease-out; }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─── */

function ResultBlock({ label, value, tone, showSign }: { label: string; value: number; tone: "muted" | "accent" | "positive" | "negative"; showSign?: boolean }) {
  const palette: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    muted:    { bg: "rgba(1,45,29,0.03)",   fg: "#012D1D", border: "rgba(1,45,29,0.06)" },
    accent:   { bg: "#FFFFFF",              fg: "#012D1D", border: "rgba(27,67,50,0.20)" },
    positive: { bg: "rgba(27,67,50,0.06)",  fg: "#1B4332", border: "rgba(27,67,50,0.30)" },
    negative: { bg: "rgba(139,46,46,0.06)", fg: "#8B2E2E", border: "rgba(139,46,46,0.30)" },
  };
  const c = palette[tone];
  const sign = showSign && value > 0 ? "+" : "";
  return (
    <div className="p-4 rounded-2xl text-center" style={{ background: c.bg, border: `1.5px solid ${c.border}` }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">{label}</div>
      <div className="text-2xl font-extrabold tabular mt-1.5" style={{ color: c.fg }}>{sign}{fmtILS(Math.round(value))}</div>
    </div>
  );
}

function NumberRow({ label, value, onChange, suffix, allowEmpty }: { label: string; value: number | ""; onChange: (v: number) => void; suffix?: string; allowEmpty?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
      <div className="text-[13px] font-bold text-verdant-ink">{label}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          value={value === "" ? "" : value}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "" && allowEmpty) { onChange(0); return; }
            const v = parseFloat(raw);
            if (!Number.isNaN(v)) onChange(v);
          }}
          placeholder={allowEmpty ? "—" : "0"}
          className="w-32 px-3 py-1.5 rounded-lg text-[14px] font-extrabold tabular text-center"
          style={{ background: "#FFFFFF", border: "1.5px solid rgba(27,67,50,0.20)", color: "#012D1D", outline: "none" }}
        />
        {suffix && <span className="text-[12px] font-bold text-verdant-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function MiniRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: bold ? "rgba(27,67,50,0.08)" : "rgba(1,45,29,0.03)" }}>
      <span className="text-[11px] font-bold text-verdant-muted">{label}</span>
      <span className={`text-[13px] tabular ${bold ? "font-extrabold" : "font-bold"} text-verdant-ink`}>{fmtILS(value)}</span>
    </div>
  );
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
      style={{
        background: active ? "#1B4332" : "rgba(1,45,29,0.06)",
        color: active ? "#FFFFFF" : "#012D1D",
      }}
    >
      {children}
    </button>
  );
}

function SmallStat({ label, before, after, suffix, decimals = 0, positiveLower }: { label: string; before: number; after: number; suffix?: string; decimals?: number; positiveLower?: boolean }) {
  const delta = after - before;
  // For "lower is better" metrics (debt, LTV), invert the color logic
  const isGoodDelta = positiveLower ? delta < 0 : delta > 0;
  const fmt = (v: number) => suffix === "%" ? `${v.toFixed(decimals)}%` : fmtILS(Math.round(v));
  return (
    <div className="p-3 rounded-xl" style={{ background: "rgba(1,45,29,0.03)", border: "1px solid rgba(1,45,29,0.06)" }}>
      <div className="text-[10px] font-bold text-verdant-muted">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-[14px] font-bold tabular text-verdant-muted line-through">{fmt(before)}</span>
        <span className="text-[15px] font-extrabold tabular text-verdant-ink">{fmt(after)}</span>
      </div>
      {Math.abs(delta) > 0.5 && (
        <div className="text-[11px] font-extrabold mt-0.5" style={{ color: isGoodDelta ? "#1B4332" : "#8B2E2E" }}>
          {delta > 0 ? "+" : ""}{fmt(Math.abs(delta) > 0 ? delta : 0)}
        </div>
      )}
    </div>
  );
}

function PTIBadge({ ratio, verdict }: { ratio: number; verdict: "approved" | "borderline" | "rejected" | "unknown" }) {
  const map = {
    approved:  { bg: "rgba(27,67,50,0.10)",  fg: "#1B4332", label: "מאושר" },
    borderline:{ bg: "rgba(180,83,9,0.10)",  fg: "#B45309", label: "גבולי" },
    rejected:  { bg: "rgba(139,46,46,0.10)", fg: "#8B2E2E", label: "צפוי לסירוב" },
    unknown:   { bg: "rgba(1,45,29,0.04)",   fg: "#5C6058", label: "—" },
  };
  const c = map[verdict];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[14px] font-extrabold tabular text-verdant-ink">{(ratio * 100).toFixed(1)}%</span>
      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.fg }}>
        {c.label}
      </span>
    </div>
  );
}

function Story({ result, today }: { result: ReturnType<typeof simulateNewProperty>; today: ReturnType<typeof snapshotPortfolio> }) {
  const equityDelta = result.delta.netEquity;
  const cfDelta = result.delta.monthlyNetCashflow;
  if (Math.abs(equityDelta) < 1 && Math.abs(cfDelta) < 1) {
    return (
      <div className="text-[13px] leading-7" style={{ color: "rgba(255,255,255,0.85)" }}>
        מלא את השדות מעל כדי לראות את ההשפעה של הרכישה על התיק שלך.
      </div>
    );
  }
  void today;
  return (
    <div className="text-[14px] leading-8" style={{ color: "#F9FAF2" }}>
      הרכישה תדרוש <strong className="text-[17px] tabular" style={{ color: "#C1ECD4" }}>{fmtILS(result.totalCashNeeded)}</strong> מזומן בחתימה.
      <br />
      ההון נטו <strong>{equityDelta >= 0 ? "יגדל" : "יקטן"}</strong> ב-
      <strong className="text-[17px] tabular" style={{ color: equityDelta >= 0 ? "#C1ECD4" : "#FCA5A5" }}>
        {fmtILS(Math.abs(Math.round(equityDelta)))}
      </strong>
      , התזרים החודשי {cfDelta >= 0 ? "יגדל" : "יקטן"} ב-
      <strong className="text-[17px] tabular" style={{ color: cfDelta >= 0 ? "#C1ECD4" : "#FCA5A5" }}>
        {fmtILS(Math.abs(Math.round(cfDelta)))}
      </strong>.
      {result.bankVerdict === "rejected" && (
        <><br /><strong style={{ color: "#FCA5A5" }}>שים לב:</strong> ה-PTI הצפוי גבוה מ-45% — הבנק צפוי לסרב.</>
      )}
      {result.bankVerdict === "borderline" && (
        <><br /><strong style={{ color: "#FCD34D" }}>שים לב:</strong> ה-PTI גבולי — תידרש בדיקה מעמיקה של הבנק.</>
      )}
    </div>
  );
}
