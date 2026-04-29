"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  Swap-Property Simulator Drawer — מכר A קנה B
 * ═══════════════════════════════════════════════════════════
 *
 * Picks one existing property to sell, then runs the new-property
 * simulator with the remaining portfolio + the cash released from sale.
 * Same shape as NewPropertyDrawer; differences confined to the seller
 * inputs and the released-cash summary.
 */

import { useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import type { Property } from "@/lib/realestate-store";
import {
  loadDebtData,
  getMortgageForProperty,
  type MortgageData,
} from "@/lib/debt-store";
import {
  snapshotPortfolio,
  simulateSwapProperty,
  type SwapPropertyInputs,
} from "@/lib/realestate-acquisition";

interface Props {
  properties: Property[];
  mortgage: MortgageData | undefined;
  onClose: () => void;
}

export function SwapPropertyDrawer({ properties, mortgage, onClose }: Props) {
  const today = useMemo(() => snapshotPortfolio(properties, mortgage), [properties, mortgage]);

  // Default: pick the first property to sell
  const [sellPropertyId, setSellPropertyId] = useState(properties[0]?.id || "");
  const sold = properties.find(p => p.id === sellPropertyId);

  const [salePrice, setSalePrice] = useState(sold?.currentValue || 2_000_000);
  const [mortgageToPayoff, setMortgageToPayoff] = useState(0);
  const [prepaymentPenalty, setPrepaymentPenalty] = useState(0);

  // Buy-side
  const [price, setPrice] = useState(2_500_000);
  const [ownEquity, setOwnEquity] = useState(750_000);
  const [monthlyRent, setMonthlyRent] = useState(7_500);
  const [monthlyExpenses, setMonthlyExpenses] = useState(800);
  const [monthlyMortgage, setMonthlyMortgage] = useState(8_500);
  const [isFirstHome, setIsFirstHome] = useState(false);

  // Auto-populate mortgage payoff + penalty when sold property changes
  useEffect(() => {
    if (!sold) return;
    setSalePrice(sold.currentValue || 0);
    const linked = getMortgageForProperty(sold.id, properties.length);
    setMortgageToPayoff(linked ? linked.totalBalance : (sold.mortgageBalance || 0));
    // ~3 months of interest as a rough penalty estimate
    if (linked && linked.totalBalance > 0) {
      const avgRate = linked.mortgage.tracks.reduce((s, t) => s + (t.interestRate || 0) * (t.remainingBalance || 0), 0)
        / linked.totalBalance;
      const annualRate = avgRate > 1 ? avgRate / 100 : avgRate; // accept both decimal and percent
      setPrepaymentPenalty(Math.round(linked.totalBalance * annualRate * 0.25));
    } else {
      setPrepaymentPenalty(0);
    }
  }, [sellPropertyId, sold, properties.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputs: SwapPropertyInputs = {
    sellPropertyId,
    salePrice,
    mortgageToPayoff,
    prepaymentPenalty,
    price,
    ownEquity,
    monthlyRent,
    monthlyExpenses,
    monthlyMortgage,
    isFirstHome,
  };
  const result = useMemo(
    () => simulateSwapProperty(today, sold, inputs),
    [today, sold, inputs],
  );
  void loadDebtData; // imported for the type, helper retained for future use

  if (properties.length === 0) {
    return (
      <DrawerShell onClose={onClose} title="אין נכס למכור">
        <p className="text-sm text-verdant-muted text-center py-12">
          הוסף נכס תחילה כדי שתוכל לסמלץ החלפה.
        </p>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell onClose={onClose} title={sold ? `אם אמכור את ${sold.name} ואקנה נכס חדש` : "סימולטור החלפת נכס"}>
      {/* Three result cards */}
      <section className="grid grid-cols-3 gap-3 mb-6">
        <ResultBlock label="הון נטו · היום"  value={today.netEquity}        tone="muted" />
        <ResultBlock label="הון נטו · אחרי" value={result.after.netEquity} tone="accent" />
        <ResultBlock label="הפרש" value={result.delta.netEquity} tone={result.delta.netEquity > 0 ? "positive" : "negative"} showSign />
      </section>

      {/* Sell side */}
      <section className="v-card p-4 mb-5">
        <h3 className="text-[12px] font-extrabold text-verdant-ink mb-3">איזה נכס אני מוכר</h3>
        <div className="flex items-center justify-between gap-4 py-2.5 border-b" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
          <div className="text-[13px] font-bold text-verdant-ink">נכס למכירה</div>
          <select
            value={sellPropertyId}
            onChange={(e) => setSellPropertyId(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[13px] font-bold cursor-pointer"
            style={{ background: "#FFFFFF", border: "1.5px solid rgba(27,67,50,0.20)", color: "#012D1D", outline: "none" }}
          >
            {properties.map(p => <option key={p.id} value={p.id}>{p.name || "נכס"}</option>)}
          </select>
        </div>
        <NumberRow label="מחיר מכירה צפוי"        value={salePrice}        onChange={setSalePrice}        suffix="₪" />
        <NumberRow label="יתרת משכנתא לפירעון" value={mortgageToPayoff} onChange={setMortgageToPayoff} suffix="₪" />
        <NumberRow label="עמלת פירעון מוקדם"     value={prepaymentPenalty} onChange={setPrepaymentPenalty} suffix="₪" />

        <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
          <span className="text-[12px] font-bold text-verdant-muted">מזומן שמשתחרר מהמכירה (אחרי תיווך + פירעון)</span>
          <span className="text-[15px] font-extrabold tabular" style={{ color: "#1B4332" }}>{fmtILS(result.cashReleasedFromSale)}</span>
        </div>
        <div className="text-[10px] text-verdant-muted mt-1 text-end">
          תיווך מכירה: {fmtILS(result.sellBrokerage)}
        </div>
      </section>

      {/* Buy side */}
      <section className="v-card p-4 mb-5">
        <h3 className="text-[12px] font-extrabold text-verdant-ink mb-3">איזה נכס אני קונה</h3>
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

      {/* Closing costs */}
      <section className="v-card p-4 mb-5">
        <h3 className="text-[12px] font-extrabold text-verdant-ink mb-3">עלויות חד-פעמיות</h3>
        <div className="grid grid-cols-2 gap-3">
          <MiniRow label="מס רכישה" value={result.closing.purchaseTax} />
          <MiniRow label="עמלת תיווך קנייה" value={result.closing.brokerage} />
          <MiniRow label="עו״ד + רישום"     value={result.closing.legalAndRegistration} />
          <MiniRow label="סה״כ עלויות"      value={result.closing.total} bold />
        </div>
      </section>

      {/* Other 4 metrics */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SmallStat label="תזרים / חודש"  before={today.monthlyNetCashflow}  after={result.after.monthlyNetCashflow} />
        <SmallStat label="חוב פתוח"     before={today.totalMortgageBalance} after={result.after.totalMortgageBalance} positiveLower />
        <SmallStat label="LTV"           before={today.ltv} after={result.after.ltv} suffix="%" decimals={0} positiveLower />
        <SmallStat label="שווי נכסים"    before={today.totalValue} after={result.after.totalValue} />
      </section>

      {/* Story */}
      <section className="rounded-2xl p-5 mb-4" style={{ background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)", color: "#F9FAF2" }}>
        <div className="text-[11px] uppercase tracking-[0.18em] font-bold mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
          הסיפור
        </div>
        <SwapStory result={result} sold={sold} />
      </section>

      <div className="flex justify-end pt-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-bold" style={{ background: "rgba(1,45,29,0.06)", color: "#012D1D" }}>
          סגור
        </button>
      </div>
    </DrawerShell>
  );
}

/* ─── Shared shell ─── */

function DrawerShell({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" dir="rtl">
      <div className="absolute inset-0" style={{ background: "rgba(1,45,29,0.55)" }} onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-3xl mx-auto bg-white rounded-t-3xl shadow-2xl overflow-y-auto animate-slide-up" style={{ maxHeight: "92vh", background: "#F9FAF2" }}>
        <header className="sticky top-0 z-10 flex items-center justify-between p-5 border-b v-divider" style={{ background: "#F9FAF2" }}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-verdant-muted">סימולטור</div>
            <div className="text-base font-extrabold text-verdant-ink mt-0.5">{title}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(1,45,29,0.06)", color: "#012D1D" }} aria-label="סגור">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
      <style jsx>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slideUp 220ms ease-out; }
      `}</style>
    </div>
  );
}

/* ─── Sub-components (mirrored from NewPropertyDrawer for self-contained file) ─── */

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

function NumberRow({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
      <div className="text-[13px] font-bold text-verdant-ink">{label}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          value={value || ""}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
            else if (e.target.value === "") onChange(0);
          }}
          placeholder="0"
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
      style={{ background: active ? "#1B4332" : "rgba(1,45,29,0.06)", color: active ? "#FFFFFF" : "#012D1D" }}
    >
      {children}
    </button>
  );
}

function SmallStat({ label, before, after, suffix, decimals = 0, positiveLower }: { label: string; before: number; after: number; suffix?: string; decimals?: number; positiveLower?: boolean }) {
  const delta = after - before;
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
          {delta > 0 ? "+" : ""}{fmt(delta)}
        </div>
      )}
    </div>
  );
}

function SwapStory({ result, sold }: { result: ReturnType<typeof simulateSwapProperty>; sold: Property | undefined }) {
  if (!sold) return null;
  const equityDelta = result.delta.netEquity;
  const cfDelta = result.delta.monthlyNetCashflow;
  return (
    <div className="text-[14px] leading-8" style={{ color: "#F9FAF2" }}>
      מכירת {sold.name} משחררת{" "}
      <strong className="text-[17px] tabular" style={{ color: "#C1ECD4" }}>{fmtILS(result.cashReleasedFromSale)}</strong>{" "}
      מזומן.
      <br />
      ההון נטו <strong>{equityDelta >= 0 ? "יגדל" : "יקטן"}</strong> ב-
      <strong className="text-[17px] tabular" style={{ color: equityDelta >= 0 ? "#C1ECD4" : "#FCA5A5" }}>
        {fmtILS(Math.abs(Math.round(equityDelta)))}
      </strong>
      , התזרים החודשי {cfDelta >= 0 ? "יגדל" : "יקטן"} ב-
      <strong className="text-[17px] tabular" style={{ color: cfDelta >= 0 ? "#C1ECD4" : "#FCA5A5" }}>
        {fmtILS(Math.abs(Math.round(cfDelta)))}
      </strong>.
    </div>
  );
}
