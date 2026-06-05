"use client";

/**
 * MacroStrip — compact live-data strip with BoI/Prime/Inflation/USD.
 *
 * Built 2026-05-24 to match the "live market data" trust signal that
 * competitors (FiNav, Plangram) show on their dashboards. Quietly degrades
 * to fallback values if the upstream APIs fail — never blocks render.
 *
 * Pure presentation; data comes from useLiveMacro().
 */

import { useLiveMacro, type LiveMacro } from "@/lib/hooks/useLiveMacro";
import { fmtILS } from "@/lib/format";

/** Last-known-good fallback for when the live endpoint is unreachable
 *  (e.g. unauth'd page hit, BoI timeout). Kept aligned with
 *  lib/assumptions.ts DEFAULT_ASSUMPTIONS. */
const STATIC_FALLBACK: LiveMacro = {
  boiRate: 0.0425, // post 2026-05-27 cut
  primeRate: 0.0575, // BoI + 1.5%
  inflationRate: 0.025,
  usd: null,
  updatedAt: new Date(0).toISOString(),
  source: {
    boiRate: "fallback",
    inflation: "fallback",
    usd: "fallback",
  },
};

function fmtPct(decimal: number): string {
  return `${(decimal * 100).toFixed(2)}%`;
}

function fmtUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    // Epoch sentinel = static fallback; don't pretend it was just updated.
    if (d.getFullYear() < 2020) return "—";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return `היום ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}

export function MacroStrip() {
  const { data: live, loading } = useLiveMacro();

  // Show a slim loading skeleton on first paint only — once we have any
  // data (live OR static fallback) we render the strip so the user always
  // sees something concrete instead of a placeholder that flickers away.
  if (loading && !live) {
    return (
      <div
        dir="rtl"
        aria-hidden
        className="mb-4 flex h-10 items-center justify-center rounded-xl text-[12px] font-bold"
        style={{
          background: "var(--morning-leaf-tint, #e5e9dc)",
          color: "var(--morning-muted, #6b7b5e)",
        }}
      >
        טוען נתוני שוק...
      </div>
    );
  }

  // When the live endpoint fails (401 on unauthed page, network error, etc.)
  // fall back to static defaults so the strip never disappears mid-flight.
  // Source tags will show "ידני" so the user knows it's not fresh.
  const data: LiveMacro = live ?? STATIC_FALLBACK;

  const items: Array<{ label: string; value: string; live: boolean }> = [
    {
      label: "פריים",
      value: fmtPct(data.primeRate),
      live: data.source.boiRate === "live",
    },
    {
      label: "ריבית בנק ישראל",
      value: fmtPct(data.boiRate),
      live: data.source.boiRate === "live",
    },
    {
      label: "אינפלציה",
      value: fmtPct(data.inflationRate),
      live: data.source.inflation === "live",
    },
  ];
  if (data.usd != null) {
    items.push({
      label: "דולר",
      value: fmtILS(data.usd),
      live: data.source.usd === "live",
    });
  }

  return (
    <div
      dir="rtl"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12px]"
      style={{
        background: "var(--morning-surface, #FFFFFF)",
        border: "1px solid var(--morning-border, #e5e9dc)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1.5">
            <span
              className="font-bold"
              style={{ color: "var(--morning-muted, #6b7b5e)" }}
            >
              {it.label}
            </span>
            <span
              className="font-extrabold tabular-nums"
              style={{ color: "var(--morning-ink, #1a1a1a)" }}
            >
              {it.value}
            </span>
            {!it.live && (
              <span
                title="ערך ברירת מחדל — לא הצליח להתחבר למקור"
                className="rounded px-1 text-[9px] font-bold"
                style={{
                  background: "var(--morning-warning-soft, #FED7AA)",
                  color: "var(--morning-warning-deep, #92400E)",
                }}
              >
                ידני
              </span>
            )}
          </div>
        ))}
      </div>
      <div
        className="flex items-center gap-1.5 text-[11px]"
        style={{ color: "var(--morning-muted, #6b7b5e)" }}
      >
        <span
          className="material-symbols-outlined text-[14px]"
          style={{ color: "var(--morning-forest, #2c7a5a)" }}
          aria-hidden
        >
          sync
        </span>
        <span>עודכן: {fmtUpdatedAt(data.updatedAt)}</span>
      </div>
    </div>
  );
}
