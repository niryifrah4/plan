"use client";

/**
 * FullRefinanceSimulator — "what if I refinance the whole mortgage to a new
 * track mix?". Built 2026-05-18 per Nir.
 *
 * Selects a mortgage (when the household has more than one), shows
 * status-quo cost across all tracks, then compares 3 preset mix
 * scenarios (conservative / balanced / aggressive). Picks a recommendation
 * based on lifetime saving.
 *
 * Lives as a collapsible card on /debt under the mortgages section.
 */

import { useMemo, useState } from "react";
import type { MortgageData } from "@/lib/debt-store";
import { useAssumptions } from "@/lib/hooks/useAssumptions";
import { simulateFullRefinance, type MixScenarioKey } from "@/lib/full-refinance-sim";
import { fmtILS } from "@/lib/format";

interface Props {
  mortgages: MortgageData[];
}

export function FullRefinanceSimulator({ mortgages }: Props) {
  const assumptions = useAssumptions();
  const marketRate = assumptions.avgMortgageRate ?? 0.05;
  const primeRate = assumptions.primeRate ?? 0.06;

  // Only mortgages with at least one track and balance > 0 are simulatable.
  const usable = useMemo(
    () =>
      mortgages.filter(
        (m) => m.tracks && m.tracks.some((t) => (t.remainingBalance || 0) > 0)
      ),
    [mortgages]
  );

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(usable[0]?.id ?? "");
  const [termYears, setTermYears] = useState(20);
  const [additionalEquity, setAdditionalEquity] = useState(0);

  const selected = usable.find((m) => m.id === selectedId) ?? usable[0];

  const result = useMemo(() => {
    if (!selected) return null;
    return simulateFullRefinance({
      mortgage: selected,
      marketRate,
      primeRate,
      newTermMonths: termYears * 12,
      additionalEquity,
    });
  }, [selected, marketRate, primeRate, termYears, additionalEquity]);

  if (usable.length === 0) return null;

  return (
    <section
      className="mb-5 overflow-hidden rounded-2xl bg-[#FFFFFF]"
      style={{ border: "1px solid #FAFAF7", boxShadow: "none" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-5 text-right md:px-7"
        style={{ background: open ? "#FAFAF7" : "#FFFFFF" }}
      >
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
          style={{ background: "#FAFAF7", borderRadius: "0.75rem" }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#2C7A5A" }}>
            swap_horiz
          </span>
        </span>
        <div className="flex-1">
          <h2 className="text-base font-extrabold" style={{ color: "#1a1a1a" }}>
            סימולטור מיחזור מלא — לפי תמהיל
          </h2>
          <p className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
            מה אם תיכנס היום למשכנתא חדשה לכל היתרה? מציג 3 תרחישים: שמרני /
            מאוזן / אגרסיבי.
          </p>
        </div>
        <span
          className="material-symbols-outlined text-[20px] transition-transform"
          style={{
            color: "#6B7280",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        >
          expand_more
        </span>
      </button>

      {open && result && (
        <div className="border-t px-5 pb-6 pt-4 md:px-7" style={{ borderColor: "#FAFAF7" }}>
          {/* Mortgage picker (if >1) + term + equity */}
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {usable.length > 1 && (
              <div>
                <label className="mb-1 block text-[11px] font-bold" style={{ color: "#6B7280" }}>
                  משכנתא למיחזור
                </label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-[13px] font-bold focus:outline-none"
                  style={{ color: "#1a1a1a", borderColor: "#E5E7EB" }}
                >
                  {usable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.bank || "ללא שם בנק"}
                      {m.tracks.length > 0 && ` (${m.tracks.length} מסלולים)`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[11px] font-bold" style={{ color: "#6B7280" }}>
                  תקופה חדשה
                </label>
                <span
                  className="text-[12px] font-extrabold tabular-nums"
                  style={{ color: "#1a1a1a", fontFamily: "inherit" }}
                >
                  {termYears} שנים
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={30}
                step={1}
                value={termYears}
                onChange={(e) => setTermYears(parseInt(e.target.value))}
                className="h-1.5 w-full accent-[#2C7A5A]"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[11px] font-bold" style={{ color: "#6B7280" }}>
                  תוספת הון עצמי
                </label>
                <span
                  className="text-[12px] font-extrabold tabular-nums"
                  style={{ color: "#1a1a1a", fontFamily: "inherit" }}
                >
                  {fmtILS(additionalEquity)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(50000, result.statusQuo.totalBalance * 0.3)}
                step={10000}
                value={additionalEquity}
                onChange={(e) => setAdditionalEquity(parseInt(e.target.value))}
                className="h-1.5 w-full accent-[#2C7A5A]"
              />
            </div>
          </div>

          {/* Status-quo summary */}
          <div
            className="mb-5 rounded-xl p-4"
            style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
          >
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: "#6B7280" }}>
              מצב נוכחי
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="יתרה כוללת"
                value={fmtILS(result.statusQuo.totalBalance)}
                color="#1a1a1a"
              />
              <Stat
                label="החזר חודשי"
                value={fmtILS(result.statusQuo.totalMonthly)}
                color="#1a1a1a"
              />
              <Stat
                label="ריבית משוקללת"
                value={`${(result.statusQuo.weightedRate * 100).toFixed(2)}%`}
                color="#1a1a1a"
              />
              <Stat
                label="עמלת היוון משוערת"
                value={fmtILS(result.statusQuo.totalEarlyFee)}
                color="#B45309"
                tooltip="עמלת פירעון מוקדם אם תמחזר עכשיו את כל המסלולים"
              />
            </div>
          </div>

          {/* 3 scenario cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {result.scenarios.map((sc) => {
              const isRecommended = sc.key === result.recommendation;
              const positive = sc.lifetimeSaving > 0;
              return (
                <div
                  key={sc.key}
                  className="relative rounded-xl p-4"
                  style={{
                    background: isRecommended
                      ? "linear-gradient(135deg, rgba(44,122,90,0.18) 0%, #FFFFFF 100%)"
                      : "#FFFFFF",
                    border: isRecommended ? "2px solid #2C7A5A" : "1px solid #E5E7EB",
                  }}
                >
                  {isRecommended && (
                    <div
                      className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
                      style={{ background: "#2C7A5A", color: "#FFFFFF" }}
                    >
                      מומלץ
                    </div>
                  )}
                  <div
                    className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: "#6B7280" }}
                  >
                    {sc.label}
                  </div>
                  <div
                    className="mb-1 text-[11px]"
                    style={{ color: "#6B7280" }}
                  >
                    {sc.description}
                  </div>

                  {/* Allocation bar */}
                  <div
                    className="my-3 flex h-2 w-full overflow-hidden rounded-full"
                    style={{ background: "#FAFAF7" }}
                  >
                    <div
                      style={{
                        width: `${sc.alloc.fixedUnlinked * 100}%`,
                        background: "#2C7A5A",
                      }}
                      title={`קל"צ ${(sc.alloc.fixedUnlinked * 100).toFixed(0)}%`}
                    />
                    <div
                      style={{
                        width: `${sc.alloc.fixedLinked * 100}%`,
                        background: "#059669",
                      }}
                      title={`ק"צ ${(sc.alloc.fixedLinked * 100).toFixed(0)}%`}
                    />
                    <div
                      style={{
                        width: `${sc.alloc.prime * 100}%`,
                        background: "#B45309",
                      }}
                      title={`פריים ${(sc.alloc.prime * 100).toFixed(0)}%`}
                    />
                  </div>
                  <div
                    className="mb-3 flex justify-between text-[9px] font-bold"
                    style={{ color: "#6B7280" }}
                  >
                    <span style={{ color: "#2C7A5A" }}>
                      קל״צ {(sc.alloc.fixedUnlinked * 100).toFixed(0)}%
                    </span>
                    <span style={{ color: "#059669" }}>
                      ק״צ {(sc.alloc.fixedLinked * 100).toFixed(0)}%
                    </span>
                    <span style={{ color: "#B45309" }}>
                      פריים {(sc.alloc.prime * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Numbers */}
                  <div
                    className="mb-1 text-[11px]"
                    style={{ color: "#6B7280" }}
                  >
                    חיסכון לאורך המסלול
                  </div>
                  <div
                    className="mb-2 text-2xl font-extrabold tabular-nums leading-none"
                    style={{
                      color: positive ? "#2C7A5A" : "#DC2626",
                      fontFamily: "inherit",
                    }}
                  >
                    {fmtILS(sc.lifetimeSaving, { signed: true })}
                  </div>
                  <div className="space-y-1 text-[11px]" style={{ color: "#6B7280" }}>
                    <div className="flex justify-between">
                      <span>החזר חודשי חדש</span>
                      <span className="tabular-nums" style={{ color: "#1a1a1a" }}>
                        {fmtILS(sc.newMonthly)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>שינוי חודשי</span>
                      <span
                        className="tabular-nums"
                        style={{ color: sc.monthlySaving >= 0 ? "#2C7A5A" : "#DC2626" }}
                      >
                        {fmtILS(sc.monthlySaving, { signed: true })}
                      </span>
                    </div>
                    {sc.breakEvenMonths !== null && (
                      <div className="flex justify-between">
                        <span>נקודת איזון</span>
                        <span className="tabular-nums" style={{ color: "#1a1a1a" }}>
                          {sc.breakEvenMonths} חודשים
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer disclaimer */}
          <div className="mt-4 text-[11px] leading-relaxed" style={{ color: "#6B7280" }}>
            הסימולציה מבוססת על הריבית הממוצעת בשוק (
            <strong style={{ color: "#2C7A5A" }}>
              {(marketRate * 100).toFixed(2)}%
            </strong>
            ) והפריים (
            <strong style={{ color: "#2C7A5A" }}>{(primeRate * 100).toFixed(2)}%</strong>
            ) מהנתונים הגלובליים. ריביות בפועל ניתן לקבל רק מהבנק עם הצעה
            ספציפית. עמלת ההיוון מחושבת אוטומטית לכל מסלול לפי החוק הישראלי.
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  color,
  tooltip,
}: {
  label: string;
  value: string;
  color?: string;
  tooltip?: string;
}) {
  return (
    <div title={tooltip}>
      <div className="text-[10px] font-bold" style={{ color: "#6B7280" }}>
        {label}
      </div>
      <div
        className="mt-0.5 tabular-nums text-[14px] font-extrabold"
        style={{ color: color ?? "#1a1a1a", fontFamily: "inherit" }}
      >
        {value}
      </div>
    </div>
  );
}
