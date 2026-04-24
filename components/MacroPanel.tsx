"use client";

/**
 * MacroPanel — display-only snapshot of Bank-of-Israel rate, Prime rate,
 * and expected inflation. These are PUBLIC, OBJECTIVE figures — not
 * user-editable. Values are read from assumptions (localStorage / defaults)
 * and updated whenever another part of the system patches them.
 *
 * To update the rates: edit DEFAULT_ASSUMPTIONS in lib/assumptions.ts
 * (or wire up a real BoI API feed in the future).
 */

import { useCallback, useEffect, useState } from "react";
import {
  loadAssumptions,
  DEFAULT_ASSUMPTIONS,
  PRIME_OVER_BOI,
} from "@/lib/assumptions";

function fmtPct2(x: number): string {
  return (x * 100).toFixed(2) + "%";
}

function fmtHebrewDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "—";
  }
}

interface MacroValues {
  boiRate: number;
  primeRate: number;
  inflationRate: number;
  macroUpdatedAt?: string;
}

export function MacroPanel() {
  const [values, setValues] = useState<MacroValues>({
    boiRate: DEFAULT_ASSUMPTIONS.boiRate,
    primeRate: DEFAULT_ASSUMPTIONS.primeRate,
    inflationRate: DEFAULT_ASSUMPTIONS.inflationRate,
    macroUpdatedAt: DEFAULT_ASSUMPTIONS.macroUpdatedAt,
  });
  const [showSource, setShowSource] = useState(false);

  const hydrate = useCallback(() => {
    const a = loadAssumptions();
    setValues({
      boiRate: a.boiRate,
      primeRate: a.primeRate,
      inflationRate: a.inflationRate,
      macroUpdatedAt: a.macroUpdatedAt,
    });
  }, []);

  useEffect(() => {
    hydrate();
    window.addEventListener("verdant:assumptions", hydrate);
    return () => window.removeEventListener("verdant:assumptions", hydrate);
  }, [hydrate]);

  return (
    <div
      className="rounded-organic shadow-soft bg-white p-5 md:p-6 mb-6"
      style={{ border: "1px solid #eef2e8" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#1B4332" }}>
            trending_up
          </span>
          <h3 className="text-base font-extrabold" style={{ color: "#012d1d" }}>
            נתוני מאקרו — ישראל
          </h3>
          {/* Info icon with hover tooltip */}
          <div className="relative flex items-center">
            <button
              onMouseEnter={() => setShowSource(true)}
              onMouseLeave={() => setShowSource(false)}
              onFocus={() => setShowSource(true)}
              onBlur={() => setShowSource(false)}
              className="text-[14px] leading-none cursor-default select-none"
              aria-label="מקור הנתונים"
              style={{ color: "#5a7a6a" }}
            >
              ℹ️
            </button>
            {showSource && (
              <div
                className="absolute right-0 top-6 z-10 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-semibold shadow-md"
                style={{
                  background: "#012d1d",
                  color: "#e8f5ee",
                  minWidth: "140px",
                }}
              >
                מקור: בנק ישראל
              </div>
            )}
          </div>
        </div>

        {values.macroUpdatedAt && (
          <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
            עודכן: {fmtHebrewDate(values.macroUpdatedAt)}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <StatField
          label="ריבית בנק ישראל"
          value={fmtPct2(values.boiRate)}
          hint="הריבית הרשמית של בנק ישראל"
        />
        <StatField
          label="ריבית פריים"
          value={fmtPct2(values.primeRate)}
          hint={`בנק ישראל + ${(PRIME_OVER_BOI * 100).toFixed(1)}%`}
        />
        <StatField
          label="אינפלציה חזויה"
          value={fmtPct2(values.inflationRate)}
          hint="לחישוב תשואה ריאלית ויעדים עתידיים"
        />
      </div>

      {/* Footer note */}
      <div
        className="text-[10px] font-semibold text-right leading-relaxed"
        style={{ color: "#8aaa9a" }}
      >
        מעודכן ידנית · יוחלף ב-API אוטומטי
      </div>
    </div>
  );
}

function StatField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-right"
      style={{ background: "#f4f9f4", border: "1px solid #e4ede6" }}
    >
      <div className="text-[11px] font-extrabold mb-1" style={{ color: "#012d1d" }}>
        {label}
      </div>
      <div className="text-[22px] font-black tabular-nums" style={{ color: "#1B4332" }}>
        {value}
      </div>
      <div className="text-[10px] font-semibold mt-1" style={{ color: "#5a7a6a" }}>
        {hint}
      </div>
    </div>
  );
}
