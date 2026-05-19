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
import {
  pmt,
  calcEarlyRepaymentFee,
  inferRepaymentFeeIndexation,
} from "@shared/financial-math";
import type { MortgageTrack } from "@/lib/debt-store";
import { effectiveTrackRate } from "@/lib/debt-store";
import { useAssumptions } from "@/lib/hooks/useAssumptions";

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
  const assumptions = useAssumptions();
  // BoI's published "ריבית ממוצעת" — drives the discount-component of the
  // early repayment fee. Fraction (e.g. 0.05 = 5%).
  const marketRate = assumptions.avgMortgageRate ?? 0.05;
  // Baseline numbers from the track. Prime tracks store interestRate=0 +
  // margin; use effectiveTrackRate so prime+margin resolves correctly. Fall
  // back to 5% only when the track has no rate data at all.
  const baseRate = effectiveTrackRate(track, assumptions.primeRate) || 0.05;
  const baseRatePct = baseRate * 100;
  const baseBalance = track.remainingBalance || 0;
  const baseMonthly = track.monthlyPayment || 0;
  const baseMonths = remainingMonths(baseBalance, baseMonthly, baseRate);
  const baseTotal = totalCost(baseMonthly, baseMonths);

  // Scenario inputs
  const [newRate, setNewRate] = useState(Math.max(2, baseRatePct - 1));
  const [prepay, setPrepay] = useState(0);
  // 2026-05-05 per finance-agent: most refinances also reset the term
  // (typically extending it). User can keep current term or stretch up to
  // 30 years; default = baseMonths so existing behavior is unchanged.
  const [newMonths, setNewMonths] = useState(baseMonths);

  // 2026-05-18: replaced the flat ₪1,500 refi-fee placeholder with the real
  // Israeli formula. Computed live from track type + market rate.
  const indexation = useMemo(
    () => inferRepaymentFeeIndexation(track.indexation, track.name),
    [track.indexation, track.name]
  );
  const repaymentFee = useMemo(
    () =>
      calcEarlyRepaymentFee({
        remainingBalance: baseBalance,
        monthlyPayment: baseMonthly,
        trackRate: baseRate,
        marketRate,
        indexation,
        gaveNotice: true,
      }),
    [baseBalance, baseMonthly, baseRate, marketRate, indexation]
  );
  // Allow the user to override the auto-computed fee (e.g. they got a
  // different quote from the bank). Default = auto.
  const [feeOverride, setFeeOverride] = useState<number | null>(null);
  const refiFee = feeOverride ?? repaymentFee.total;

  const result = useMemo(() => {
    // Refinance only — uses new rate and (possibly) new term
    const refiRate = newRate / 100;
    const refiMonthly = pmt(baseBalance, refiRate, newMonths);
    const refiTotal = Math.round(refiMonthly * newMonths) + refiFee;
    const refiSaving = baseTotal - refiTotal;
    const monthlyDelta = baseMonthly - refiMonthly;
    const breakEvenMonth = monthlyDelta > 0 ? Math.ceil(refiFee / monthlyDelta) : null;
    const termDeltaMonths = newMonths - baseMonths;

    // Prepay only — reduce balance, keep monthly + rate, fewer months.
    // 2026-05-18 per finance-agent: prepayment also incurs an early-repayment
    // fee proportional to the prepaid amount. We scale the discount-component
    // by the prepay ratio (a reasonable approximation for partial prepay).
    const prepayBalance = Math.max(0, baseBalance - prepay);
    const prepayMonths = remainingMonths(prepayBalance, baseMonthly, baseRate);
    const prepayFeeRatio = baseBalance > 0 ? prepay / baseBalance : 0;
    const prepayFee = Math.round(
      repaymentFee.discountFee * prepayFeeRatio +
        repaymentFee.operationalFee * (prepay > 0 ? 1 : 0)
    );
    const prepayTotal = Math.round(baseMonthly * prepayMonths) + prepay + prepayFee;
    const prepaySaving = baseTotal - prepayTotal;
    const monthsSaved = baseMonths - prepayMonths;

    // Combined — refinance + prepay (uses new term too). Pays the FULL refi
    // fee since the track is being fully refinanced.
    const combinedBalance = Math.max(0, baseBalance - prepay);
    const combinedMonthly = pmt(combinedBalance, refiRate, newMonths);
    const combinedTotal = Math.round(combinedMonthly * newMonths) + prepay + refiFee;
    const combinedSaving = baseTotal - combinedTotal;

    return {
      refi: {
        monthly: refiMonthly,
        total: refiTotal,
        saving: refiSaving,
        breakEvenMonth,
        termDeltaMonths,
        fee: refiFee,
      },
      prepay: {
        monthly: baseMonthly,
        total: prepayTotal,
        saving: prepaySaving,
        monthsSaved,
        fee: prepayFee,
      },
      combined: { monthly: combinedMonthly, total: combinedTotal, saving: combinedSaving },
    };
  }, [
    newRate,
    prepay,
    newMonths,
    refiFee,
    baseBalance,
    baseMonths,
    baseMonthly,
    baseRate,
    baseTotal,
    repaymentFee.discountFee,
    repaymentFee.operationalFee,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[#FFFFFF] shadow-soft"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="v-divider sticky top-0 z-10 flex items-center justify-between border-b bg-[#FFFFFF] px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
              סימולטור מיחזור / פירעון מואץ
            </div>
            <h2 className="text-lg font-extrabold text-verdant-ink">{track.name}</h2>
            <div className="mt-0.5 text-[11px] text-verdant-muted">
              יתרה {fmtILS(baseBalance)} · החזר {fmtILS(baseMonthly)}/חודש · ריבית{" "}
              {baseRatePct.toFixed(2)}% · נותרו {baseMonths} חודשים
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-verdant-bg">
            <span className="material-symbols-outlined text-[20px] text-verdant-muted">close</span>
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Inputs */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[12px] font-bold text-verdant-ink">
                  ריבית חדשה (מיחזור)
                </label>
                <span className="text-[13px] font-extrabold tabular-nums text-verdant-ink">
                  {newRate.toFixed(2)}%
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(8, baseRatePct + 0.5)}
                step={0.1}
                value={newRate}
                onChange={(e) => setNewRate(parseFloat(e.target.value))}
                className="h-1.5 w-full accent-[#2C7A5A]"
              />
              <div className="mt-0.5 text-[10px] text-verdant-muted">
                ריבית נוכחית: {baseRatePct.toFixed(2)}% ·{" "}
                {newRate < baseRatePct ? "ירידה של" : "עלייה של"}{" "}
                {Math.abs(newRate - baseRatePct).toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[12px] font-bold text-verdant-ink">פירעון חד-פעמי</label>
                <span className="text-[13px] font-extrabold tabular-nums text-verdant-ink">
                  {fmtILS(prepay)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(50000, baseBalance * 0.5)}
                step={5000}
                value={prepay}
                onChange={(e) => setPrepay(parseInt(e.target.value))}
                className="h-1.5 w-full accent-[#2C7A5A]"
              />
              <div className="mt-0.5 text-[10px] text-verdant-muted">
                סכום שאתה משלם היום מתוך כסף נזיל
              </div>
            </div>

            {/* New term (months) */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[12px] font-bold text-verdant-ink">תקופה חדשה</label>
                <span className="text-[13px] font-extrabold tabular-nums text-verdant-ink">
                  {Math.round(newMonths / 12)} שנים ({newMonths} חודשים)
                </span>
              </div>
              <input
                type="range"
                min={Math.max(12, baseMonths - 60)}
                max={360}
                step={12}
                value={newMonths}
                onChange={(e) => setNewMonths(parseInt(e.target.value))}
                className="h-1.5 w-full accent-[#2C7A5A]"
              />
              <div className="mt-0.5 text-[10px] text-verdant-muted">
                תקופה נוכחית: {Math.round(baseMonths / 12)} שנים. הארכת התקופה תוריד את ההחזר
                החודשי אבל עלולה להגדיל את הריבית הכוללת.
              </div>
            </div>

            {/* Refi fee — auto-calculated per Israeli formula */}
            <div className="md:col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[12px] font-bold text-verdant-ink">
                  עמלת פירעון מוקדם
                  {feeOverride === null ? (
                    <span
                      className="ml-2 inline-block rounded-full px-2 py-0.5 text-[9px]"
                      style={{ background: "#FAFAF7", color: "#2C7A5A" }}
                    >
                      חישוב אוטומטי
                    </span>
                  ) : (
                    <button
                      onClick={() => setFeeOverride(null)}
                      className="mr-2 text-[10px] font-bold underline"
                      style={{ color: "#2C7A5A" }}
                    >
                      חזור לחישוב אוטומטי
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  value={refiFee}
                  onChange={(e) => setFeeOverride(parseInt(e.target.value) || 0)}
                  className="w-28 rounded-md border bg-transparent px-2 py-1 text-left text-[13px] font-extrabold tabular-nums focus:outline-none"
                  style={{
                    color: "#1A1A1A",
                    borderColor: "#E5E7EB",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              {feeOverride === null && (
                <div
                  className="rounded-lg px-3 py-2 text-[11px]"
                  style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span style={{ color: "#6B7280" }}>
                      סוג מסלול לחישוב:{" "}
                      <strong style={{ color: "#2C7A5A" }}>
                        {indexation === "prime"
                          ? "פריים (ללא עמלת היוון)"
                          : indexation === "variable-period"
                            ? "ריבית משתנה"
                            : indexation === "fixed-unlinked"
                              ? "קל״צ (קבועה לא צמודה)"
                              : indexation === "fixed-linked"
                                ? "ק״צ (קבועה צמודה)"
                                : "אחר"}
                      </strong>
                    </span>
                    <span style={{ color: "#6B7280" }}>
                      ריבית ממוצעת בשוק:{" "}
                      <strong style={{ color: "#2C7A5A", fontFamily: "inherit" }}>
                        {(marketRate * 100).toFixed(2)}%
                      </strong>
                    </span>
                  </div>
                  <div className="space-y-0.5" style={{ color: "#6B7280" }}>
                    {repaymentFee.discountFee > 0 && (
                      <div className="flex justify-between">
                        <span>עמלת היוון (הפרשי ריבית)</span>
                        <span className="tabular-nums" style={{ color: "#1A1A1A", fontFamily: "inherit" }}>
                          {fmtILS(repaymentFee.discountFee)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>עמלה תפעולית</span>
                      <span className="tabular-nums" style={{ color: "#1A1A1A", fontFamily: "inherit" }}>
                        {fmtILS(repaymentFee.operationalFee)}
                      </span>
                    </div>
                    {repaymentFee.discountFee === 0 && indexation === "prime" && (
                      <div className="text-[10px] italic" style={{ color: "#2C7A5A" }}>
                        אין עמלת היוון על מסלול פריים — ניתן למחזר בכל עת.
                      </div>
                    )}
                    {repaymentFee.discountFee === 0 &&
                      indexation !== "prime" &&
                      baseRate <= marketRate && (
                        <div className="text-[10px] italic" style={{ color: "#2C7A5A" }}>
                          הריבית שלך נמוכה מהריבית הממוצעת בשוק — אין עמלת היוון.
                        </div>
                      )}
                  </div>
                </div>
              )}
              <div className="mt-1 text-[10px] text-verdant-muted">
                מבוסס על חוק הבנקאות + ריבית ממוצעת מבנק ישראל (
                {(marketRate * 100).toFixed(2)}%). ניתן לערוך ידנית אם קיבלת
                ציטוט שונה מהבנק.
              </div>
            </div>
          </div>

          {/* Break-even insight */}
          {result.refi.breakEvenMonth !== null && (
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: result.refi.termDeltaMonths > 0 ? "rgba(217,119,6,0.12)" : "#F0F9F4",
                border: `1px solid ${result.refi.termDeltaMonths > 0 ? "#D97706" : "#86efac"}`,
              }}
            >
              <div className="text-[12px] font-bold text-verdant-ink">
                נקודת איזון: {result.refi.breakEvenMonth} חודשים
              </div>
              <div className="mt-0.5 text-[11px] text-verdant-muted">
                {result.refi.termDeltaMonths > 0
                  ? `שים לב — הארכת על ${Math.round(result.refi.termDeltaMonths / 12)} שנים. החיסכון הכולל קטן יותר ממה שנראה — הריבית מצטברת על תקופה ארוכה יותר.`
                  : `אם תישאר בנכס מעבר ל-${result.refi.breakEvenMonth} חודשים, המיחזור משתלם. אם תעזוב לפני — תפסיד.`}
              </div>
            </div>
          )}
          {result.refi.breakEvenMonth === null && refiFee > 0 && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: "rgba(220,38,38,0.12)", border: "1px solid #B91C1C" }}
            >
              <div className="text-[12px] font-bold" style={{ color: "#B91C1C" }}>
                אין נקודת איזון — ההחזר החודשי לא יורד
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: "#DC2626" }}>
                המיחזור הזה לא מקטין את ההחזר החודשי, רק מאריך את התקופה. עמלת המיחזור לא תכוסה.
              </div>
            </div>
          )}

          {/* 3 scenarios side-by-side */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

          <div className="text-[11px] leading-relaxed text-verdant-muted">
            הערכה אינדיקטיבית. עמלת הפירעון המוקדם ({fmtILS(refiFee)}) מחושבת
            לפי הריבית הממוצעת בשוק ({(marketRate * 100).toFixed(2)}%) ונכללת
            בחישוב החיסכון. הפרשי מדד למסלולים צמודים לא מחושבים — קבל ציטוט
            מדויק מהבנק לפני קבלת החלטה.
          </div>
        </div>

        <div className="v-divider flex justify-end border-t px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-bold"
            style={{ background: "#2C7A5A", color: "#FFFFFF" }}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({
  title,
  monthly,
  total,
  saving,
  extra,
  highlight,
  dim,
}: {
  title: string;
  monthly: number;
  total: number;
  saving: number;
  extra?: string;
  highlight?: boolean;
  dim?: boolean;
}) {
  const positive = saving > 0;
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: highlight ? "#2C7A5A" : "#FFFFFF",
        color: highlight ? "#FFFFFF" : "#1a1a1a",
        border: highlight ? "none" : "1px solid #E5E7EB",
        opacity: dim ? 0.5 : 1,
      }}
    >
      <div
        className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em]"
        style={{ color: highlight ? "rgba(255,255,255,0.7)" : "#6B7280" }}
      >
        {title}
      </div>
      <div
        className="mb-1 text-[11px] font-medium"
        style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#6B7280" }}
      >
        חיסכון כולל
      </div>
      <div
        className="mb-2 text-2xl font-extrabold tabular-nums leading-none"
        style={{
          color: highlight ? "#FFFFFF" : positive ? "#2C7A5A" : "#8B2E2E",
          fontFamily: "inherit",
        }}
      >
        {positive ? fmtILS(saving) : `−${fmtILS(Math.abs(saving))}`}
      </div>
      <div
        className="space-y-0.5 text-[11px]"
        style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#6B7280" }}
      >
        <div>
          החזר חודשי: <strong>{fmtILS(Math.round(monthly))}</strong>
        </div>
        <div>
          סך תשלומים: <strong>{fmtILS(total)}</strong>
        </div>
      </div>
      {extra && (
        <div
          className="mt-2 border-t pt-2 text-[10px] font-medium"
          style={{
            color: highlight ? "rgba(255,255,255,0.7)" : "#6B7280",
            borderColor: highlight ? "rgba(255,255,255,0.15)" : "#E5E7EB",
          }}
        >
          {extra}
        </div>
      )}
    </div>
  );
}
