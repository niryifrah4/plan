"use client";

/**
 * SolidKpi — summary KPI tile with solid Botanical-colored background.
 * Used for the 2×4 summary row at the top of every page
 * (סך נכסים, התחייבויות, הון עצמי, יחס חוב/נכס וכו׳).
 *
 * Design: full-bleed solid color, white text, white/15 icon chip,
 * soft shadow, subtle hover lift. Consistent across the whole app.
 */

export type KpiTone =
  | "forest"    // hero: net worth, total assets
  | "emerald"   // secondary positive: savings, returns
  | "mint"      // positive/opportunity — light mint, deep text
  | "sage"      // neutral: ratios, counts
  | "red"       // negative: liabilities, debt
  | "amber"     // caution: warnings
  | "ink";      // header/totals (deepest)

interface ToneStyle {
  bg: string;
  textMain: string;
  textLabel: string;
  textSub: string;
  iconBg: string;
  iconColor: string;
}

const TONE_STYLES: Record<KpiTone, ToneStyle> = {
  forest:  { bg: "#012D1D", textMain: "#FFFFFF", textLabel: "rgba(255,255,255,0.60)", textSub: "rgba(255,255,255,0.65)", iconBg: "rgba(193,236,212,0.18)", iconColor: "#C1ECD4" },
  emerald: { bg: "#1B4332", textMain: "#FFFFFF", textLabel: "rgba(255,255,255,0.60)", textSub: "rgba(255,255,255,0.65)", iconBg: "rgba(193,236,212,0.18)", iconColor: "#C1ECD4" },
  mint:    { bg: "#D6EFDC", textMain: "#012D1D", textLabel: "rgba(1,45,29,0.55)",     textSub: "rgba(1,45,29,0.65)",     iconBg: "rgba(27,67,50,0.12)",     iconColor: "#1B4332" },
  sage:    { bg: "#5C6058", textMain: "#FFFFFF", textLabel: "rgba(255,255,255,0.60)", textSub: "rgba(255,255,255,0.65)", iconBg: "rgba(255,255,255,0.15)",  iconColor: "#FFFFFF" },
  red:     { bg: "#8B2E2E", textMain: "#FFFFFF", textLabel: "rgba(255,255,255,0.60)", textSub: "rgba(255,255,255,0.70)", iconBg: "rgba(255,255,255,0.15)",  iconColor: "#FFFFFF" },
  amber:   { bg: "#B45309", textMain: "#FFFFFF", textLabel: "rgba(255,255,255,0.60)", textSub: "rgba(255,255,255,0.70)", iconBg: "rgba(255,255,255,0.15)",  iconColor: "#FFFFFF" },
  ink:     { bg: "#1B4332", textMain: "#FFFFFF", textLabel: "rgba(255,255,255,0.60)", textSub: "rgba(255,255,255,0.65)", iconBg: "rgba(193,236,212,0.18)", iconColor: "#C1ECD4" },
};

export interface SolidKpiProps {
  label: string;
  value: string;
  icon?: string;
  sub?: string | null;
  tone?: KpiTone;
  /** Override tone with a raw hex. */
  bg?: string;
}

export function SolidKpi({ label, value, icon, sub, tone = "forest", bg }: SolidKpiProps) {
  const style = TONE_STYLES[tone];
  const bgColor = bg ?? style.bg;
  return (
    <div
      className="p-4 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: bgColor,
        color: style.textMain,
        borderRadius: "1rem",
        boxShadow: "0 1px 2px rgba(27, 67, 50, 0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: style.textLabel }}>
          {label}
        </div>
        {icon && (
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: style.iconBg, color: style.iconColor }}>
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
          </div>
        )}
      </div>
      <div className="text-xl md:text-2xl font-extrabold tabular leading-tight" style={{ color: style.textMain }}>
        {value}
      </div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: style.textSub }}>{sub}</div>}
    </div>
  );
}

export function SolidKpiRow({ children }: { children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {children}
    </section>
  );
}
