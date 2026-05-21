"use client";

/**
 * RefinanceAlerts — visual card that lists actionable refi signals for
 * a household's mortgages. Built 2026-05-18 per Nir.
 *
 * Reads:
 *   - debt-store (mortgages)
 *   - realestate-store (properties — for naming alerts)
 *   - assumptions (BoI avg mortgage rate, prime rate)
 *
 * Each alert has a "פתח סימולטור" CTA that opens the existing
 * RefinanceSimulator pre-filled for the relevant track. The opening
 * is parent-owned (the parent passes onOpenSimulator).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadDebtData, type DebtData } from "@/lib/debt-store";
import { loadProperties, type Property, EVENT_NAME as RE_EVENT } from "@/lib/realestate-store";
import { useAssumptions } from "@/lib/hooks/useAssumptions";
import { generateRefinanceAlerts, type RefiAlert } from "@/lib/refinance-alerts";
import { fmtILS } from "@/lib/format";

interface Props {
  /** Limit shown alerts. Use `undefined` for "all". */
  maxItems?: number;
  /** Show CTA to open the refinance simulator. */
  onOpenSimulator?: (trackId: string) => void;
  /** When true, hide the card entirely if there are no alerts. Default true. */
  hideWhenEmpty?: boolean;
  /** Optional: filter alerts to a specific property (for /realestate page). */
  propertyIdFilter?: string;
}

const SEVERITY_STYLE: Record<
  RefiAlert["severity"],
  { bg: string; border: string; iconColor: string; iconName: string }
> = {
  warning: {
    bg: "rgba(180, 83, 9, 0.10)",
    border: "rgba(180, 83, 9, 0.4)",
    iconColor: "#B45309",
    iconName: "schedule",
  },
  opportunity: {
    bg: "rgba(44, 122, 90, 0.08)",
    border: "rgba(44, 122, 90, 0.4)",
    iconColor: "#2C7A5A",
    iconName: "savings",
  },
  info: {
    bg: "#FFFFFF",
    border: "#E5E7EB",
    iconColor: "#6B7280",
    iconName: "info",
  },
};

export function RefinanceAlerts({
  maxItems,
  onOpenSimulator,
  hideWhenEmpty = true,
  propertyIdFilter,
}: Props) {
  const assumptions = useAssumptions();
  const [debt, setDebt] = useState<DebtData>({
    loans: [],
    installments: [],
    mortgages: [],
  });
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    const refresh = () => {
      setDebt(loadDebtData());
      setProperties(loadProperties());
    };
    refresh();
    window.addEventListener("verdant:debt:updated", refresh);
    window.addEventListener(RE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("verdant:debt:updated", refresh);
      window.removeEventListener(RE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const allAlerts = useMemo(
    () =>
      generateRefinanceAlerts(debt, properties, {
        marketRate: assumptions.avgMortgageRate ?? 0.05,
        primeRate: assumptions.primeRate ?? 0.06,
      }),
    [debt, properties, assumptions.avgMortgageRate, assumptions.primeRate]
  );

  const filtered = propertyIdFilter
    ? allAlerts.filter((a) => a.propertyId === propertyIdFilter)
    : allAlerts;
  const shown = maxItems ? filtered.slice(0, maxItems) : filtered;

  if (shown.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <section
        className="mb-5 rounded-2xl bg-[#FFFFFF] px-5 py-5 md:px-7"
        style={{ border: "1px solid #FAFAF7" }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#2C7A5A" }}>
            check_circle
          </span>
          <h3 className="text-sm font-extrabold" style={{ color: "#1a1a1a" }}>
            אין נקודות מיחזור פעילות
          </h3>
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "#6B7280" }}>
          המסלולים שלך נראים תקינים לעומת השוק הנוכחי. נמשיך לנטר.
        </p>
      </section>
    );
  }

  return (
    <section
      className="mb-5 overflow-hidden rounded-2xl bg-[#FFFFFF]"
      style={{ border: "1px solid #FAFAF7" }}
    >
      <div
        className="flex items-center gap-3 px-5 py-4 md:px-7"
        style={{ background: "#FAFAF7", borderBottom: "1px solid #E5E7EB" }}
      >
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
          style={{ background: "#FFFFFF", borderRadius: "0.75rem" }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: "#2C7A5A" }}
          >
            notifications_active
          </span>
        </span>
        <div className="flex-1">
          <h2 className="text-base font-extrabold" style={{ color: "#1a1a1a" }}>
            נקודות מיחזור בקרוב
          </h2>
          <p className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
            {shown.length} {shown.length === 1 ? "תזכורת פעילה" : "תזכורות פעילות"}
            {filtered.length > shown.length && ` · מציג ${shown.length} מתוך ${filtered.length}`}
          </p>
        </div>
      </div>

      <div className="px-5 py-4 md:px-7">
        <div className="space-y-2">
          {shown.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity];
            return (
              <div
                key={alert.id}
                className="rounded-xl px-4 py-3"
                style={{ background: style.bg, border: `1px solid ${style.border}` }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="material-symbols-outlined mt-0.5 text-[18px]"
                    style={{ color: style.iconColor }}
                  >
                    {style.iconName}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-[12px] font-extrabold"
                        style={{ color: "#1a1a1a" }}
                      >
                        {alert.title}
                      </span>
                      {alert.impactILS && alert.impactILS > 0 && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                          style={{
                            background: style.border,
                            color: "#1a1a1a",
                            fontFamily: "inherit",
                          }}
                        >
                          ~{fmtILS(alert.impactILS)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: "#6B7280" }}>
                      {alert.detail}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px]">
                      {alert.propertyName && (
                        <span style={{ color: "#6B7280" }}>
                          נכס:{" "}
                          <strong style={{ color: "#2C7A5A" }}>{alert.propertyName}</strong>
                        </span>
                      )}
                      {alert.bankName && (
                        <span style={{ color: "#6B7280" }}>
                          בנק: <strong style={{ color: "#1a1a1a" }}>{alert.bankName}</strong>
                        </span>
                      )}
                      {onOpenSimulator ? (
                        <button
                          onClick={() => onOpenSimulator(alert.trackId)}
                          className="text-[11px] font-extrabold hover:underline"
                          style={{ color: "#2C7A5A" }}
                        >
                          פתח סימולטור ←
                        </button>
                      ) : (
                        <Link
                          href="/debt"
                          className="text-[11px] font-extrabold hover:underline"
                          style={{ color: "#2C7A5A" }}
                        >
                          עבור לדף החובות ←
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
