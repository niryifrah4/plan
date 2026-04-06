import { PageHeader } from "@/components/ui/PageHeader";
import { AlternativesCompare } from "@/components/AlternativesCompare";
import { MaslekaUpload } from "@/components/MaslekaUpload";
import { AssetDonut } from "@/components/charts/AssetDonut";
import { fmtILS } from "@/lib/format";
import { capitalGainsTax } from "@/lib/financial-math";
import { demoAssets, demoLiabilities, demoNetWorth, demoSecurities } from "@/lib/stub-data";

const ASSET_GROUPS: Record<string, { label: string; color: string }> = {
  liquid:      { label: "נזילים · עו״ש וחסכון",   color: "#10b981" },
  investments: { label: "השקעות ותיקי נייע",      color: "#0a7a4a" },
  pension:     { label: "פנסיוני ארוך טווח",      color: "#1a6b42" },
  realestate:  { label: "נדל״ן",                  color: "#125c38" },
  other:       { label: "רכב ונכסים נוספים",      color: "#58e1b0" },
};
const LIAB_GROUPS: Record<string, { label: string; color: string }> = {
  mortgage: { label: "משכנתא",         color: "#7f1d1d" },
  loans:    { label: "הלוואות",        color: "#b91c1c" },
  cc:       { label: "אשראי ותשלומים", color: "#ef4444" },
};
const KIND_LABELS: Record<string, string> = {
  stock: "מניה", etf: "קרן סל", crypto: "קריפטו", rsu: "RSU", option: "אופציה", bond: "אג״ח", fund: "קרן",
};

export default function WealthPage() {
  const totalAssets = demoNetWorth.total_assets;
  const totalLiab  = demoNetWorth.total_liabilities;
  const ratio = totalAssets > 0 ? Math.round((totalLiab / totalAssets) * 100) : 0;

  // Donut slices
  const assetSlices = Object.entries(ASSET_GROUPS)
    .map(([key, meta]) => ({
      label: meta.label.split("·")[0].trim(),
      pct: Math.round((demoAssets.filter(a => a.asset_group === key).reduce((s, a) => s + a.balance, 0) / totalAssets) * 100),
      color: meta.color,
    }))
    .filter(s => s.pct > 0);
  const liabSlices = Object.entries(LIAB_GROUPS)
    .map(([key, meta]) => ({
      label: meta.label,
      pct: Math.round((demoLiabilities.filter(l => l.liability_group === key).reduce((s, l) => s + l.balance, 0) / totalLiab) * 100),
      color: meta.color,
    }))
    .filter(s => s.pct > 0);

  const totalMarket = demoSecurities.reduce((a, s) => a + s.market_value_ils, 0);
  const totalPnl    = demoSecurities.reduce((a, s) => a + s.unrealized_pnl_ils, 0);
  const totalTax    = demoSecurities.reduce((a, s) => a + capitalGainsTax(s.cost_basis_ils, s.market_value_ils).tax, 0);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Wealth Map · הון עצמי מתגלגל"
        title="מפת עושר"
        description="נכסים, התחייבויות והון עצמי · מסונכרן אוטומטית מתחנות הליווי"
      />

      {/* ===== KPI Bento ===== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">סך נכסים</div>
          <div className="text-xl md:text-2xl font-extrabold text-verdant-emerald tabular">{fmtILS(totalAssets)}</div>
        </div>
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">סך התחייבויות</div>
          <div className="text-xl md:text-2xl font-extrabold tabular" style={{ color: "#b91c1c" }}>{fmtILS(totalLiab)}</div>
        </div>
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">הון עצמי (Net Worth)</div>
          <div className="text-xl md:text-2xl font-extrabold text-verdant-ink tabular">{fmtILS(demoNetWorth.net_worth)}</div>
        </div>
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">יחס חוב/נכס</div>
          <div className="text-xl md:text-2xl font-extrabold tabular" style={{ color: ratio > 40 ? "#b91c1c" : "#0a7a4a" }}>{ratio}%</div>
          <div className="text-[10px] text-verdant-muted mt-0.5">בריא: מתחת ל-40%</div>
        </div>
      </section>

      {/* ===== Distribution donuts ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-3">פיזור נכסים</div>
          <AssetDonut slices={assetSlices} />
        </div>
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-3">פיזור התחייבויות</div>
          <AssetDonut slices={liabSlices} />
        </div>
      </section>

      {/* ===== Wealth Table ===== */}
      <section className="v-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b v-divider flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-verdant-ink">מבנה ההון העצמי</h2>
            <p className="text-[11px] text-verdant-muted mt-1">נכסים ירוקים · התחייבויות אדומות</p>
          </div>
        </div>

        {/* Assets */}
        <div className="px-5 py-3 bg-[#f4f7ed] text-[10px] uppercase tracking-[0.12em] text-verdant-muted font-extrabold flex justify-between">
          <span>נכסים</span><span>יתרה</span>
        </div>
        {demoAssets.map((a) => (
          <div key={a.id} className="px-5 py-3 border-b v-divider flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-verdant-ink">{a.name}</div>
              <div className="text-[11px] text-verdant-muted">{ASSET_GROUPS[a.asset_group]?.label ?? a.asset_group}</div>
            </div>
            <span className="text-sm font-extrabold text-verdant-emerald tabular">{fmtILS(a.balance)}</span>
          </div>
        ))}

        {/* Liabilities */}
        <div className="px-5 py-3 bg-[#f4f7ed] text-[10px] uppercase tracking-[0.12em] text-verdant-muted font-extrabold flex justify-between mt-2">
          <span>התחייבויות</span><span>יתרה</span>
        </div>
        {demoLiabilities.map((l) => (
          <div key={l.id} className="px-5 py-3 border-b v-divider flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-verdant-ink">{l.name}</div>
              <div className="text-[11px] text-verdant-muted">{LIAB_GROUPS[l.liability_group]?.label ?? l.liability_group} · {l.rate_pct.toFixed(1)}%</div>
            </div>
            <span className="text-sm font-extrabold tabular" style={{ color: "#b91c1c" }}>{fmtILS(l.balance)}</span>
          </div>
        ))}
      </section>

      {/* ===== Loan Scanner ===== */}
      <section className="v-card p-5 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">סורק לוח סילוקין</div>
            <h2 className="text-base md:text-lg font-extrabold text-verdant-ink">זיהוי הלוואות · עדכון אוטומטי להתחייבויות</h2>
            <p className="text-[11px] text-verdant-muted mt-1">העלה לוח סילוקין בנקאי (PDF/CSV) או הזן ידנית — כל שורה תיטען אוטומטית לסעיף &quot;הלוואות&quot;.</p>
          </div>
          <button className="text-[11px] font-bold px-3 py-2 rounded-lg text-white" style={{ background: "var(--verdant-accent)" }}>
            טען להתחייבויות
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-verdant-muted font-bold" style={{ background: "#f4f7ed" }}>
                <th className="text-right px-2 py-2">שם</th>
                <th className="text-left px-2 py-2" style={{ width: 110 }}>יתרה (₪)</th>
                <th className="text-left px-2 py-2" style={{ width: 80 }}>ריבית %</th>
                <th className="text-left px-2 py-2" style={{ width: 100 }}>החזר חודשי</th>
                <th className="text-left px-2 py-2" style={{ width: 100 }}>עמלת פירעון</th>
              </tr>
            </thead>
            <tbody>
              {demoLiabilities.filter(l => l.liability_group !== "mortgage").map((l) => (
                <tr key={l.id} className="border-b v-divider">
                  <td className="px-2 py-2 font-bold text-verdant-ink">{l.name}</td>
                  <td className="px-2 py-2 tabular text-left" dir="ltr">{fmtILS(l.balance)}</td>
                  <td className="px-2 py-2 tabular text-left" dir="ltr">{l.rate_pct.toFixed(1)}%</td>
                  <td className="px-2 py-2 tabular text-left" dir="ltr">{fmtILS(l.monthly_payment)}</td>
                  <td className="px-2 py-2 tabular text-left" dir="ltr">{fmtILS(l.prepay_fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== Securities ===== */}
      <section className="v-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b v-divider flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-sm font-extrabold text-verdant-ink">שוק הון, קריפטו ו-RSU</h2>
          <div className="flex gap-4 text-xs font-bold">
            <span className="text-verdant-muted tabular">שווי: {fmtILS(totalMarket)}</span>
            <span className="tabular" style={{ color: totalPnl >= 0 ? "#0a7a4a" : "#b91c1c" }}>P&amp;L: {fmtILS(totalPnl, { signed: true })}</span>
            <span className="tabular" style={{ color: "#b91c1c" }}>מס צפוי: {fmtILS(totalTax)}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-verdant-muted font-bold" style={{ background: "#f4f7ed" }}>
                <th className="text-right px-3 py-2">סוג</th>
                <th className="text-right px-3 py-2">סימול</th>
                <th className="text-right px-3 py-2">ברוקר</th>
                <th className="text-left px-3 py-2 tabular">שווי (₪)</th>
                <th className="text-left px-3 py-2 tabular">רווח/הפסד</th>
                <th className="text-left px-3 py-2 tabular">%</th>
                <th className="text-right px-3 py-2">Vest / Strike</th>
              </tr>
            </thead>
            <tbody>
              {demoSecurities.map((s) => {
                const color = s.unrealized_pnl_ils >= 0 ? "#0a7a4a" : "#b91c1c";
                return (
                  <tr key={s.id} className="border-b v-divider hover:bg-[#f9faf2] transition-colors">
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#0a7a4a15", color: "#0a7a4a" }}>
                        {KIND_LABELS[s.kind] ?? s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-extrabold text-verdant-ink">{s.symbol}</td>
                    <td className="px-3 py-2 text-verdant-muted font-bold">{s.broker}</td>
                    <td className="px-3 py-2 tabular font-bold text-left" dir="ltr">{fmtILS(s.market_value_ils)}</td>
                    <td className="px-3 py-2 tabular font-bold text-left" dir="ltr" style={{ color }}>{fmtILS(s.unrealized_pnl_ils, { signed: true })}</td>
                    <td className="px-3 py-2 tabular font-bold text-left" dir="ltr" style={{ color }}>{s.unrealized_pnl_pct >= 0 ? "+" : ""}{s.unrealized_pnl_pct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-[11px] text-verdant-muted font-bold">
                      {s.vest_date ? `Vest: ${new Date(s.vest_date).toLocaleDateString("he-IL")}` : ""}
                      {s.strike_price ? ` · Strike: $${s.strike_price}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== Masleka + Alternatives ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <MaslekaUpload />
        <AlternativesCompare
          title="השוואת דמי ניהול פנסיה"
          horizonYears={20}
          current={{  label: "מצב נוכחי",  lumpToday: 380000, monthly: 3200, annualRate: 0.047 }}
          proposed={{ label: "מצב מוצע",   lumpToday: 380000, monthly: 3200, annualRate: 0.053 }}
          note="הפער נובע מהפחתת דמי ניהול מ-1.0% ל-0.4%, שמשפרת את התשואה נטו ב-0.6% לשנה."
        />
      </div>

      {/* ===== Insight ===== */}
      <div className="rounded-2xl p-5 md:p-6" style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)", color: "#fff" }}>
        <div className="flex items-start gap-3 md:gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(88,225,176,0.2)" }}>
            <span className="material-symbols-outlined" style={{ color: "#58e1b0" }}>insights</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2" style={{ color: "#58e1b0" }}>תובנת עושר</div>
            <h3 className="text-base md:text-lg font-extrabold mb-2">יחס חוב/נכס {ratio}% — {ratio <= 40 ? "טווח בריא" : "גבוה מהמומלץ"}</h3>
            <p className="text-xs md:text-sm opacity-90 leading-relaxed">
              {ratio <= 40
                ? "המבנה הפיננסי שלכם נמצא בטווח בריא. שמרו על יחס מינוף נמוך להתקדמות יציבה."
                : "יחס החוב גבוה מ-40%. שקלו לצמצם התחייבויות — בדקו מיחזור/איחוד בארגז הכלים."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
