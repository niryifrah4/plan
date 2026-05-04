"use client";

/**
 * SolidKpi — bank-style KPI tile.
 *
 * 2026-04-28 redesign per Nir: "עצב את כל ה-KPIס בכל דפי המערכת בסגנון
 * נקי של אפליקציית בנק. ללא צבעים מיותרים, פונטים ברורים (Manrope Bold),
 * ו-Whitespace רחב."
 *
 * Visual rules:
 *  - White card on every tile (no colored backgrounds)
 *  - Numbers are dark ink — they carry the meaning, not the background
 *  - Tone is communicated by a thin colored accent line on the right edge
 *    (forest = brand, red = bad, amber = warn, emerald = good)
 *  - Manrope tabular numerals for currency
 *  - Generous padding (px-5 py-4) for the whitespace bank apps use
 *
 * The `tone` prop is preserved for callers but no longer drives bg.
 */

export type KpiTone = "forest" | "emerald" | "mint" | "sage" | "red" | "amber" | "ink";

const ACCENT_COLOR: Record<KpiTone, string> = {
  forest: "#1B4332",
  emerald: "#2B694D",
  mint: "#7FA68D",
  sage: "#94a3b8",
  red: "#8B2E2E",
  amber: "#B45309",
  ink: "#012D1D",
};

const VALUE_COLOR: Record<KpiTone, string> = {
  forest: "#012D1D",
  emerald: "#012D1D",
  mint: "#012D1D",
  sage: "#1F2937",
  red: "#8B2E2E",
  amber: "#B45309",
  ink: "#012D1D",
};

export interface SolidKpiProps {
  label: string;
  value: string;
  icon?: string;
  sub?: string | null;
  tone?: KpiTone;
  /** Legacy override — used by /insurance for the dynamic coverage tile.
   *  When set, falls back to the old colored-bg style for that tile only. */
  bg?: string;
}

export function SolidKpi({ label, value, icon, sub, tone = "forest", bg }: SolidKpiProps) {
  // Legacy colored-bg branch (kept for /insurance coverage tile).
  if (bg) {
    return (
      <div
        className="relative overflow-hidden p-4 transition-all duration-200 hover:shadow-md"
        style={{
          background: bg,
          color: "#FFFFFF",
          borderRadius: "0.75rem",
          boxShadow: "0 1px 2px rgba(27, 67, 50, 0.06)",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div
            className="text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            {label}
          </div>
          {icon && (
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              {icon}
            </span>
          )}
        </div>
        <div
          className="text-2xl font-extrabold tabular-nums leading-tight"
          style={{ color: "#FFFFFF", fontFamily: "Manrope, Assistant, system-ui, sans-serif" }}
        >
          {value}
        </div>
        {sub && (
          <div className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.85)" }}>
            {sub}
          </div>
        )}
      </div>
    );
  }

  // Bank-style default: white card with thin tone accent on the right edge.
  return (
    <div
      className="relative overflow-hidden bg-white px-5 py-4 transition-shadow duration-200 hover:shadow-sm"
      style={{
        borderRadius: "0.75rem",
        border: "1px solid #eef2e8",
      }}
    >
      {/* Right-edge accent — single thin stripe carrying the tone (RTL). */}
      <span
        aria-hidden
        className="absolute bottom-3 right-0 top-3 rounded-l"
        style={{
          width: 3,
          background: ACCENT_COLOR[tone],
          opacity: 0.8,
        }}
      />

      <div className="mb-2 flex items-center justify-between">
        <div
          className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: "#5a7a6a" }}
        >
          {label}
        </div>
        {icon && (
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: ACCENT_COLOR[tone], opacity: 0.7 }}
          >
            {icon}
          </span>
        )}
      </div>

      <div
        className="text-2xl font-extrabold tabular-nums leading-tight"
        style={{
          color: VALUE_COLOR[tone],
          fontFamily: "Manrope, Assistant, system-ui, sans-serif",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>

      {sub && (
        <div className="mt-1 text-[11px] font-medium" style={{ color: "#5a7a6a" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function SolidKpiRow({ children }: { children: React.ReactNode }) {
  return <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">{children}</section>;
}
