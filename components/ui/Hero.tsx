"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  Hero — the canonical "one number per screen" block
 * ═══════════════════════════════════════════════════════════
 *
 * The single component every page Hero should pass through.
 * Pre-2026-04 the same pattern lived inline in 4-5 places, each with
 * slightly different rounded-2xl vs 3xl, flat vs gradient, padding,
 * font-size — so /pension and /realestate looked like two different
 * apps. This file is the SoT.
 *
 * Usage:
 *   <Hero
 *     eyebrow="הון נדל״ן נטו"
 *     value={fmtILS(equity)}
 *     sub={`${properties.length} נכסים · שווי כולל ${fmtILS(totalValue)}`}
 *   />
 *
 * Tones:
 *   • forest (default)   — main positive Hero (equity, savings, retirement)
 *   • emerald            — success/celebratory
 *   • danger             — debt-focused screen
 *   • muted              — informational (no strong tone)
 */

import type { ReactNode } from "react";

export type HeroTone = "forest" | "emerald" | "danger" | "muted";

export interface HeroProps {
  /** Small caption above the value, uppercase tracked. */
  eyebrow: string;
  /** The big number / headline (string — pre-formatted by caller). */
  value: ReactNode;
  /** Optional secondary line below the value. */
  sub?: ReactNode;
  /** Optional inline CTA (button) on the side. */
  action?: ReactNode;
  /** Color treatment — defaults to "forest". */
  tone?: HeroTone;
  /** Center the headline (default true). Set false for left-aligned heroes. */
  centered?: boolean;
}

const TONE_BG: Record<HeroTone, string> = {
  forest:  "linear-gradient(135deg, #012D1D 0%, #1B4332 100%)",
  emerald: "linear-gradient(135deg, #1B4332 0%, #2B694D 100%)",
  danger:  "linear-gradient(135deg, #4A0E0E 0%, #7A1818 100%)",
  muted:   "linear-gradient(135deg, #1B4332 0%, #5C6058 100%)",
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
      className={`rounded-3xl px-6 py-7 md:px-10 md:py-9 mb-4 ${centered ? "text-center" : "text-right"}`}
      style={{ background: TONE_BG[tone], color: "#F9FAF2" }}
      dir="rtl"
    >
      <div className={action ? "flex items-center gap-6 flex-wrap" : ""}>
        <div className="flex-1 min-w-0">
          <div
            className="text-[12px] md:text-[13px] font-bold uppercase tracking-[0.16em] mb-3"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            {eyebrow}
          </div>
          <div
            className="font-extrabold tabular leading-none"
            style={{
              fontSize: "clamp(2.5rem, 7vw, 4rem)",
              letterSpacing: "-0.02em",
              color: "#FFFFFF",
            }}
          >
            {value}
          </div>
          {sub && (
            <div
              className="text-[13px] md:text-[14px] mt-3 font-medium"
              style={{ color: "rgba(255,255,255,0.75)" }}
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
