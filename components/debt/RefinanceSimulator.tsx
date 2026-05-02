"use client";

/**
 * RefinanceSimulator — "what if I refinance / prepay?" for any mortgage track.
 *
 * Built 2026-05-02 per Nir: most families don't realize when they should
 * refinance. This shows the savings in concrete ₪ over the remaining life
 * of the loan.
 *
 * Two scenarios on the same track:
 *  1. Refinance — change interest rate, keep balance + remaining months
 *  2. Prepay — pay X₪ today as a lump, balance shrinks
 *
 * Both compare to "do nothing" baseline.
 */

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { pmt } from "@/lib/_shared/financial-math";
import type { MortgageTrack } from "@/lib/debt-store";

interface Props {
  track: MortgageTrack;
  onClose: () => void;
}

function totalCost(monthlyPayment: number, months: number): number {
  return Math.round(monthlyPayment * months);
}

function remainingMonths(balance: number, monthly: number, annualRate: number): number {
  if (!balance || !monthly) return 0;
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(balance / monthly);
  const ratio = (balance * r) / monthly;
  if (ratio >= 1 || ratio <= 0) return 360;
  return Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
}

export function RefinanceSimulator({ track, onClose }: Props) {
  // Baseline numbers from the track
  const baseRate = track.interestRate || 0.05;
  const baseRatePct = baseRate * 100;
  const baseBalance = track.remainingBalance || 0;
  const baseMonthly = track.monthlyPayment || 0;
  const baseMonths = remainingMonths(baseBalance, baseMonthly, baseRate);
  const baseTotal = totalCost(baseMonthly, baseMonths);

  // Scenario inputs
  const [newRate, setNewRate] = useState(Math.max(2, baseRatePct - 1));
  const [prepay, setPrepay] = useState(0);

  const result = useMemo(() => {
    // Refinance only — same months, lower rate
    const refiRate = newRate / 100;
    const refiMonthly = pmt(baseBalance, refiRate, baseMonths);
    const refiTotal = Math.round(refiMonthly * baseMonths);
    const refiSaving = baseTotal - refiTotal;

    // Prepay only — reduce balance, keep monthly + rate, fewer months
    const prepayBalance = Math.max(0, baseBalance - prepay);
    const prepayMonths = remainingMonths(prepayBalance, baseMonthly, baseRate);
    const prepayTotal = Math.round(baseMonthly * prepayMonths) + prepay;
    const prepaySaving = baseTotal - prepayTotal;
    const monthsSaved = baseMonths - prepayMonths;

    // Combined — refinance + prepay
    const combinedBalance = Math.max(0, baseBalance - prepay);
    const combinedMonthly = pmt(combinedBalance, refiRate, baseMonths);
    const combinedTotal = Math.round(combinedMonthly * baseMonths) + prepay;
    const combinedSaving = baseTotal - combinedTotal;

    return {
      refi: { monthly: refiMonthly, total: refiTotal, saving: refiSaving },
      prepay: { monthly: baseMonthly, total: prepayTotal, saving: prepaySaving, monthsSaved },
      combined: { monthly: combinedMonthly, total: combinedTotal, saving: combinedSaving },
    };
  }, [newRate, prepay, baseBalance, baseMonths, baseMonthly, baseRate, baseTotal]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-soft w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-6 py-4 border-b v-divider flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.15em]">
              סימולטור מיחזור / פירעון מואץ
            </div>
            <h2 className="text-lg font-extrabold text-verdant-ink">{track.name}</h2>
            <div className="text-[11px] text-verdant-muted mt-0.5">
              יתרה {fmtILS(baseBalance)} · החזר {fmtILS(baseMonthly)}/חודש · ריבית {baseRatePct.toFixed(2)}% · נותרו {baseMonths} חודשים
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-verdant-bg">
            <span className="material-symbols-outlined text-[20px] text-verdant-muted">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-bold text-verdant-ink">ריבית חדשה (מיחזור)</label>
                <span className="text-[13px] font-extrabold tabular-nums text-verdant-ink">{newRate.toFixed(2)}%</span>
              </div>
              <input type="range" min={1} max={Math.max(8, baseRatePct + 0.5)} step={0.1}
                value={newRate} onChange={(e) => setNewRate(parseFloat(e.target.value))}
                className="w-full h-1.5 accent-[#1B4332]" />
              <div className="text-[10px] text-verdant-muted mt-0.5">
                ריבית נוכחית: {baseRatePct.toFixed(2)}% · {newRate < baseRatePct ? "ירידה של" : "עלייה של"} {Math.abs(newRate - baseRatePct).toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-bold text-verdant-ink">פירעון חד-פעמי</label>
                <span className="text-[13px] font-extrabold tabular-nums text-verdant-ink">{fmtILS(prepay)}</span>
              </div>
              <input type="range" min={0} max={Math.max(50000, baseBalance * 0.5)} step={5000}
                value={prepay} onChange={(e) => setPrepay(parseInt(e.target.value))}
                className="w-full h-1.5 accent-[#1B4332]" />
              <div className="text-[10px] text-verdant-muted mt-0.5">
                סכום שאתה משלם היום מתוך כסף נזיל
              </div>
            </div>
          </div>

          {/* 3 scenarios side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ScenarioCard
              title="מיחזור בלבד"
              monthly={result.refi.monthly}
              total={result.refi.total}
              saving={result.refi.saving}
              extra={`ריבית ${newRate.toFixed(2)}% במקום ${baseRatePct.toFixed(2)}%`}
            />
            <ScenarioCard
              title="פירעון מואץ בלבד"
              monthly={result.prepay.monthly}
              total={result.prepay.total}
              saving={result.prepay.saving}
              extra={`חיסכון של ${result.prepay.monthsSaved} חודשים`}
              dim={prepay === 0}
            />
            <ScenarioCard
              title="שניהם יחד"
              monthly={result.combined.monthly}
              total={result.combined.total}
              saving={result.combined.saving}
              extra="האפקט המשולב"
              highlight
            />
          </div>

          <div className="text-[11px] text-verdant-muted leading-relaxed">
            הערכה אינדיקטיבית. עמלות מיחזור (פתיחת תיק חדש, פרעון מוקדם) לא נלקחו בחשבון —
            בנקים גובים בד״כ ₪500-2,500. החיסכון בפועל מעט נמוך יותר.
          </div>
        </div>

        <div className="px-6 py-3 border-t v-divider flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-bold" style={{ background: "#1B4332", color: "#fff" }}>
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ title, monthly, total, saving, extra, highlight, dim }: {
  title: string; monthly: number; total: number; saving: number;
  extra?: string; highlight?: boolean; dim?: boolean;
}) {
  const positive = saving > 0;
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: highlight ? "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)" : "#fff",
        color: highlight ? "#F9FAF2" : "#012D1D",
        border: highlight ? "none" : "1px solid #eef2e8",
        opacity: dim ? 0.5 : 1,
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2"
           style={{ color: highlight ? "rgba(255,255,255,0.7)" : "#5a7a6a" }}>
        {title}
      </div>
      <div className="text-[11px] font-medium mb-1" style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#5a7a6a" }}>
        חיסכון כולל
      </div>
      <div className="text-2xl font-extrabold tabular-nums leading-none mb-2"
           style={{
             color: highlight ? "#C1ECD4" : positive ? "#1B4332" : "#8B2E2E",
             fontFamily: "Manrope, Assistant, sans-serif",
           }}>
        {positive ? fmtILS(saving) : `−${fmtILS(Math.abs(saving))}`}
      </div>
      <div className="text-[11px] space-y-0.5" style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#5a7a6a" }}>
        <div>החזר חודשי: <strong>{fmtILS(Math.round(monthly))}</strong></div>
        <div>סך תשלומים: <strong>{fmtILS(total)}</strong></div>
      </div>
      {extra && (
        <div className="text-[10px] mt-2 pt-2 border-t font-medium"
             style={{ color: highlight ? "rgba(255,255,255,0.7)" : "#5a7a6a", borderColor: highlight ? "rgba(255,255,255,0.15)" : "#eef2e8" }}>
          {extra}
        </div>
      )}
    </div>
  );
}
