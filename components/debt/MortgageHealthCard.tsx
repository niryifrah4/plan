"use client";

/**
 * MortgageHealthCard — single section that turns the diagnostics + score
 * engine into a CFP-style "this is what I'd tell you in a meeting" panel.
 *
 * Phase 6 (2026-05-21). Surfaces:
 *   - Score header: large 0..100 number + band copy ("מצוין" / "בסדר" / "צריך לטפל")
 *   - Sub-score breakdown: 5 rows showing where points were lost
 *   - Diagnostic list: actionable insights from the diagnostics engine,
 *     grouped by severity (critical → opportunity → info)
 *
 * Hidden when there are no mortgages — there's nothing to diagnose.
 */

import { useMemo } from "react";
import { fmtILS } from "@/lib/format";
import {
  computeMortgageHealthScore,
  type MortgageHealthScore,
  type HealthSubScore,
} from "@/lib/mortgage-health-score";
import {
  generateMortgageDiagnostics,
  type MortgageDiagnostic,
  type DiagnosticSeverity,
} from "@/lib/mortgage-diagnostics";
import type { DebtData } from "@/lib/debt-store";
import type { Assumptions } from "@/lib/assumptions";
import type { Property } from "@/lib/realestate-store";

interface Props {
  debt: DebtData;
  assumptions: Assumptions;
  properties: Property[];
  monthlyNetIncome: number;
  /** Optional handler — fires when user clicks the "open simulator" CTA on
   *  a diagnostic. Caller receives `{ mortgageId, trackId }`. */
  onOpenRefi?: (args: { mortgageId?: string; trackId?: string }) => void;
}

const SEVERITY_COLOR: Record<DiagnosticSeverity, string> = {
  critical: "#DC2626",
  warning: "#D97706",
  opportunity: "#2C7A5A",
  info: "#6B7280",
};

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
  critical: "קריטי",
  warning: "אזהרה",
  opportunity: "הזדמנות",
  info: "מידע",
};

const STATUS_COLOR: Record<HealthSubScore["status"], string> = {
  good: "#2C7A5A",
  ok: "#D97706",
  bad: "#DC2626",
};

const BAND_COPY: Record<MortgageHealthScore["band"], { headline: string; sub: string }> = {
  good: {
    headline: "המשכנתא בריאה",
    sub: "התמהיל סביר, התקופה מתאימה לגיל, והעלויות מתחת לתקרות מקובלות.",
  },
  ok: {
    headline: "המשכנתא תקינה — יש מה לשפר",
    sub: "יש 1-2 דברים שכדאי לטפל בהם. ראו את ההמלצות למטה.",
  },
  bad: {
    headline: "המשכנתא דורשת תשומת לב",
    sub: "מצב לא טוב במספר ממדים. כדאי לעבור על ההמלצות יחד.",
  },
};

export function MortgageHealthCard({
  debt,
  assumptions,
  properties,
  monthlyNetIncome,
  onOpenRefi,
}: Props) {
  const score = useMemo(
    () =>
      computeMortgageHealthScore({
        debt,
        assumptions,
        properties,
        monthlyNetIncome,
      }),
    [debt, assumptions, properties, monthlyNetIncome]
  );

  const diagnostics = useMemo(
    () =>
      generateMortgageDiagnostics({
        debt,
        assumptions,
        properties,
        monthlyNetIncome,
      }),
    [debt, assumptions, properties, monthlyNetIncome]
  );

  // Don't render when there's nothing to assess.
  if ((debt.mortgages || []).length === 0) return null;
  if (score.subScores.length === 0 && diagnostics.length === 0) return null;

  const bandCopy = BAND_COPY[score.band];

  return (
    <section
      className="mb-5 overflow-hidden rounded-2xl bg-[#FFFFFF]"
      style={{ border: "1px solid #E5E7EB", boxShadow: "var(--morning-shadow-card)" }}
    >
      {/* Header — big score + band copy */}
      <div className="flex items-start gap-4 px-5 py-5 md:px-7">
        <div className="flex-shrink-0">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-2xl"
            style={{
              background:
                score.band === "good"
                  ? "rgba(44,122,90,0.10)"
                  : score.band === "ok"
                    ? "rgba(217,119,6,0.10)"
                    : "rgba(220,38,38,0.10)",
            }}
          >
            <div
              className="text-[28px] font-extrabold tabular-nums leading-none"
              style={{
                color:
                  score.band === "good"
                    ? "#2C7A5A"
                    : score.band === "ok"
                      ? "#D97706"
                      : "#DC2626",
              }}
              title="ציון בריאות משכנתא — מורכב מ-5 ממדים: תמהיל, תקופה מול פרישה, ריבית מול שוק, LTV, החזר מההכנסה"
            >
              {score.total}
            </div>
          </div>
          <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-verdant-muted">
            מתוך 100
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            ציון בריאות משכנתא
          </div>
          <h3 className="text-lg font-extrabold text-verdant-ink">{bandCopy.headline}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-verdant-muted">{bandCopy.sub}</p>
          {score.missing.length > 0 && (
            <div
              className="mt-2 rounded-md px-2.5 py-1.5 text-[11px]"
              style={{ background: "#FAFAF7", color: "#6B7280" }}
            >
              לציון מלא יותר — {score.missing.join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Sub-scores breakdown — what makes up the score */}
      <div
        className="border-t px-5 pb-5 pt-4 md:px-7"
        style={{ borderColor: "#FAFAF7" }}
      >
        <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-verdant-muted">
          איפה הניקוד מתפזר
        </div>
        <div className="space-y-2">
          {score.subScores.map((ss) => {
            const pct = ss.weight === 0 ? 0 : ss.score / ss.weight;
            return (
              <div key={ss.key} className="flex items-center gap-3">
                <div className="w-44 flex-shrink-0 text-[12px] font-bold text-verdant-ink">
                  {ss.label}
                </div>
                <div
                  className="relative h-2 flex-1 overflow-hidden rounded-full"
                  style={{ background: "#FAFAF7" }}
                >
                  <div
                    className="absolute right-0 top-0 h-full rounded-full"
                    style={{
                      width: `${Math.max(2, pct * 100)}%`,
                      background: STATUS_COLOR[ss.status],
                      opacity: 0.85,
                    }}
                  />
                </div>
                <div
                  className="w-12 text-left text-[11px] font-bold tabular-nums"
                  style={{ color: STATUS_COLOR[ss.status] }}
                >
                  {ss.score}/{ss.weight}
                </div>
              </div>
            );
          })}
          <div className="mt-2 space-y-1 text-[11px] text-verdant-muted">
            {score.subScores.map((ss) => (
              <div key={`note:${ss.key}`}>
                <span
                  className="ml-1 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: STATUS_COLOR[ss.status] }}
                />
                <span className="font-bold text-verdant-ink">{ss.label}:</span> {ss.note}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diagnostics — actionable items */}
      {diagnostics.length > 0 && (
        <div
          className="border-t px-5 pb-5 pt-4 md:px-7"
          style={{ borderColor: "#FAFAF7" }}
        >
          <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-verdant-muted">
            המלצות לטיפול ({diagnostics.length})
          </div>
          <ul className="space-y-2">
            {diagnostics.map((d) => (
              <DiagnosticRow key={d.id} d={d} onOpenRefi={onOpenRefi} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DiagnosticRow({
  d,
  onOpenRefi,
}: {
  d: MortgageDiagnostic;
  onOpenRefi?: (args: { mortgageId?: string; trackId?: string }) => void;
}) {
  const color = SEVERITY_COLOR[d.severity];
  const showCta = d.cta && onOpenRefi && (d.mortgageId || d.trackId);
  return (
    <li
      className="rounded-lg px-3 py-2"
      style={{
        background: "#FAFAF7",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em]"
              style={{
                background: `${color}1A`,
                color,
              }}
            >
              {SEVERITY_LABEL[d.severity]}
            </span>
            <span className="text-[13px] font-extrabold text-verdant-ink">{d.title}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-verdant-muted">{d.detail}</p>
          {(d.monthlyImpact || d.annualImpact) && (
            <div className="mt-1 text-[11px] font-bold" style={{ color }}>
              {d.monthlyImpact ? `כ-${fmtILS(d.monthlyImpact)}/חודש · ` : ""}
              {d.annualImpact ? `${fmtILS(d.annualImpact)} סך לחיי המסלול` : ""}
            </div>
          )}
        </div>
        {showCta && (
          <button
            onClick={() =>
              onOpenRefi?.({ mortgageId: d.mortgageId, trackId: d.trackId })
            }
            className="flex-shrink-0 rounded-md px-3 py-1 text-[11px] font-bold"
            style={{ background: color, color: "#FFFFFF" }}
          >
            {d.cta}
          </button>
        )}
      </div>
    </li>
  );
}
