"use client";

/**
 * Hero — the canonical "one number per screen" block.
 * Morning treatment: light cream-to-leaf gradient with dark ink text.
 */

import type { ReactNode } from "react";

export type HeroTone = "forest" | "emerald" | "danger" | "muted";

export interface HeroProps {
  eyebrow: string;
  value: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  tone?: HeroTone;
  centered?: boolean;
}

const TONE_BG: Record<HeroTone, string> = {
  forest: "linear-gradient(135deg, #FFFFFF 0%, #E8F4D1 100%)",
  emerald: "linear-gradient(135deg, #FFFFFF 0%, #D1FAE5 100%)",
  danger: "linear-gradient(135deg, #FFFFFF 0%, #FEE2E2 100%)",
  muted: "linear-gradient(135deg, #FFFFFF 0%, #F0F1EB 100%)",
};

const TONE_EYEBROW: Record<HeroTone, string> = {
  forest: "var(--morning-forest-deep)",
  emerald: "var(--morning-success)",
  danger: "var(--morning-danger)",
  muted: "var(--morning-muted)",
};

const TONE_SUB: Record<HeroTone, string> = {
  forest: "var(--morning-muted)",
  emerald: "var(--morning-muted)",
  danger: "var(--morning-muted)",
  muted: "var(--morning-muted)",
};

export function Hero({
  eyebrow,
  value,
  sub,
  action,
  tone = "forest",
  centered = true,
}: HeroProps) {
  return (
    <section
      className={`mb-4 rounded-2xl px-6 py-7 md:px-10 md:py-9 ${centered ? "text-center" : "text-right"}`}
      style={{
        background: TONE_BG[tone],
        color: "var(--morning-ink)",
        border: "1px solid var(--morning-border)",
        boxShadow: "var(--morning-shadow-card)",
      }}
      dir="rtl"
    >
      <div className={action ? "flex flex-wrap items-center gap-6" : ""}>
        <div className="min-w-0 flex-1">
          <div
            className="mb-3 text-[12px] font-semibold tracking-[0.10em] md:text-[13px]"
            style={{ color: TONE_EYEBROW[tone] }}
          >
            {eyebrow}
          </div>
          <div
            className="tabular font-bold leading-none"
            style={{
              fontSize: "clamp(2.5rem, 7vw, 4rem)",
              letterSpacing: "-0.02em",
              color: "var(--morning-ink)",
              fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
            }}
          >
            {value}
          </div>
          {sub && (
            <div
              className="mt-3 text-[13px] font-medium md:text-[14px]"
              style={{ color: TONE_SUB[tone] }}
            >
              {sub}
            </div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}
