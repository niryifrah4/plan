"use client";

/**
 * SolidKpi — Morning-style KPI tile.
 *
 * White card on cream background. Number carries the meaning (dark ink),
 * tone is communicated by a thin right-edge accent stripe.
 */

import type { ReactNode } from "react";
import { MoneyText } from "./MoneyText";

export type KpiTone = "forest" | "emerald" | "mint" | "sage" | "red" | "amber" | "ink";

const ACCENT_COLOR: Record<KpiTone, string> = {
  forest: "#2C7A5A",
  emerald: "#059669",
  mint: "#4A9B7A",
  sage: "#6B7280",
  red: "#DC2626",
  amber: "#D97706",
  ink: "#1A1A1A",
};

const VALUE_COLOR: Record<KpiTone, string> = {
  forest: "#1A1A1A",
  emerald: "#059669",
  mint: "#1A1A1A",
  sage: "#1A1A1A",
  red: "#DC2626",
  amber: "#D97706",
  ink: "#1A1A1A",
};

export interface SolidKpiProps {
  label: string;
  value: string;
  icon?: string;
  sub?: string | null;
  tone?: KpiTone;
  /** Legacy override — used by /insurance for the dynamic coverage tile. */
  bg?: string;
  /** Native browser tooltip — used to explain jargon-y KPIs (DTI, LTV, etc.)
   *  to a non-technical couple without crowding the tile with copy. */
  title?: string;
}

export function SolidKpi({ label, value, icon, sub, tone = "forest", bg, title }: SolidKpiProps) {
  // Legacy colored-bg branch (kept for /insurance coverage tile).
  if (bg) {
    return (
      <div
        className="relative overflow-hidden p-4 transition-all duration-200"
        title={title}
        style={{
          background: bg,
          color: "#fff",
          borderRadius: "0.75rem",
          boxShadow: "var(--morning-shadow-card)",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div
            className="text-[10px] font-semibold tracking-[0.15em]"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {label}
          </div>
          {icon && (
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              {icon}
            </span>
          )}
        </div>
        <div
          className="text-2xl font-bold tabular-nums leading-tight"
          style={{
            color: "#fff",
            fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
          }}
        >
          <MoneyText className="text-2xl font-bold leading-tight">{value}</MoneyText>
        </div>
        {sub && (
          <div className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.85)" }}>
            {sub}
          </div>
        )}
      </div>
    );
  }

  // Morning default: white card with thin tone accent on the right edge (RTL).
  return (
    <div
      className="relative overflow-hidden px-5 py-4 duration-200"
      title={title}
      style={{
        borderRadius: "0.75rem",
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        boxShadow: "var(--morning-shadow-card)",
      }}
    >
      {/* Right-edge accent stripe (RTL) */}
      <span
        aria-hidden
        className="absolute bottom-3 right-0 top-3 rounded-l"
        style={{
          width: 3,
          background: ACCENT_COLOR[tone],
          opacity: 0.85,
        }}
      />

      <div className="mb-2 flex items-center justify-between">
        <div
          className="text-[11px] font-medium tracking-[0.04em]"
          style={{ color: "var(--morning-muted)" }}
        >
          {label}
        </div>
        {icon && (
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: ACCENT_COLOR[tone], opacity: 0.85 }}
          >
            {icon}
          </span>
        )}
      </div>

      <div
        className="text-2xl font-bold tabular-nums leading-tight"
        style={{
          color: VALUE_COLOR[tone],
          fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
          letterSpacing: "-0.01em",
        }}
      >
        <MoneyText className="text-2xl font-bold leading-tight">{value}</MoneyText>
      </div>

      {sub && (
        <div
          className="mt-1 text-[11px] font-medium"
          style={{ color: "var(--morning-muted)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export function SolidKpiRow({ children }: { children: ReactNode }) {
  return <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">{children}</section>;
}
