"use client";

/**
 * PayoffSimulator — "if I throw ₪X at one of my open obligations, which one
 * gives me the biggest cashflow win and how fast?"
 *
 * The Excel template Nir uses has a manual "סימולציה לסגירת הלוואות" cell —
 * plug in a target amount, eyeball the result. This component formalizes it:
 *
 *   1. The user enters available capital (a windfall, a bonus, or money
 *      currently parked in a low-yield account).
 *   2. The simulator lists every active loan + installment series, with:
 *        • Cost-to-close   (~ monthlyAmount × payments remaining)
 *        • Monthly relief  (= the row's monthlyAmount today)
 *        • Months left
 *        • Annualized ROI  (= monthly relief × 12 / cost to close)
 *      Ranked by ROI within the capital budget, then larger-than-budget below.
 *   3. Picking one shows a clean before/after cashflow story.
 *
 * Installment series often carry no interest (Israeli stores absorb it), so
 * the cost-to-close approximation is exact. For interest-bearing loans the
 * true payoff balance is slightly less than monthly × remaining (because
 * future interest is forgiven), so this is a conservative estimate of ROI.
 * Good enough for a CFP-level conversation; precise numbers come from the
 * lender. (2026-05-14 per Nir.)
 */

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import type { DebtData, Loan, Installment } from "@/lib/debt-store";

interface PayoffOption {
  kind: "loan" | "installment";
  id: string;
  name: string;
  subtitle: string;
  monthlyRelief: number;
  monthsRemaining: number;
  costToClose: number;
  annualizedRoi: number; // monthly × 12 / cost — assumes relief is redeployed
  withinBudget: boolean;
}

function loanMonthsLeft(loan: Loan): number {
  if (!loan.startDate || !loan.totalPayments) return 0;
  const [y, m] = loan.startDate.split("-").map(Number);
  const now = new Date();
  const elapsed = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.max(0, loan.totalPayments - elapsed);
}

export function PayoffSimulator({ data }: { data: DebtData }) {
  const [capitalStr, setCapitalStr] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const capital = Math.max(0, parseFloat(capitalStr) || 0);

  const options = useMemo<PayoffOption[]>(() => {
    const opts: PayoffOption[] = [];

    for (const loan of data.loans || []) {
      const remaining = loanMonthsLeft(loan);
      if (remaining <= 0 || !loan.monthlyPayment) continue;
      const costToClose = Math.round(loan.monthlyPayment * remaining);
      const annualizedRoi = costToClose > 0 ? (loan.monthlyPayment * 12) / costToClose : 0;
      opts.push({
        kind: "loan",
        id: loan.id,
        name: loan.lender || "הלוואה",
        subtitle: `${remaining} תשלומים נותרו`,
        monthlyRelief: Math.round(loan.monthlyPayment),
        monthsRemaining: remaining,
        costToClose,
        annualizedRoi,
        withinBudget: capital >= costToClose,
      });
    }

    for (const inst of data.installments || []) {
      const remaining = Math.max(0, (inst.totalPayments || 0) - (inst.currentPayment || 0) + 1);
      if (remaining <= 0 || !inst.monthlyAmount) continue;
      const costToClose = Math.round(inst.monthlyAmount * remaining);
      const annualizedRoi = costToClose > 0 ? (inst.monthlyAmount * 12) / costToClose : 0;
      opts.push({
        kind: "installment",
        id: inst.id,
        name: inst.merchant || "עסקת תשלומים",
        subtitle:
          inst.totalPayments > 0
            ? `תשלום ${inst.currentPayment}/${inst.totalPayments}`
            : `${remaining} תשלומים נותרו`,
        monthlyRelief: Math.round(inst.monthlyAmount),
        monthsRemaining: remaining,
        costToClose,
        annualizedRoi,
        withinBudget: capital >= costToClose,
      });
    }

    // Rank: within-budget first (highest ROI), then over-budget (closest first).
    opts.sort((a, b) => {
      if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;
      if (a.withinBudget) return b.annualizedRoi - a.annualizedRoi;
      return a.costToClose - b.costToClose;
    });
    return opts;
  }, [data, capital]);

  const selected = options.find((o) => o.id === selectedId) || null;

  // Totals — current monthly debt service we'll show in the before/after.
  const currentMonthlyService = useMemo(() => {
    const loans = (data.loans || []).reduce((s, l) => s + (l.monthlyPayment || 0), 0);
    const insts = (data.installments || []).reduce((s, i) => s + (i.monthlyAmount || 0), 0);
    return Math.round(loans + insts);
  }, [data]);

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "#fff", border: "1px solid #e8e9e1" }}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
        סימולטור
      </div>
      <h3 className="mb-1 text-base font-extrabold text-verdant-ink">
        סגירה מוקדמת של הלוואה / עסקה
      </h3>
      <p className="mb-4 text-[12px] leading-relaxed text-verdant-muted">
        יש לכם סכום פנוי שאתם שוקלים להפנות לסגירת חוב? תזינו כאן את הסכום, ונדרג
        איזו עסקה תשחרר הכי הרבה תזרים חודשי בכל שקל מושקע.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#F4F7ED] px-4 py-3">
        <label className="flex items-center gap-2 text-[12px] font-bold text-verdant-ink">
          סכום פנוי
          <input
            type="number"
            min={0}
            value={capitalStr}
            onChange={(e) => setCapitalStr(e.target.value)}
            placeholder="לדוגמה 5,000"
            className="w-32 rounded-md border bg-white px-2 py-1 text-center text-[13px] font-extrabold tabular-nums"
            style={{ borderColor: "#d8e0d0" }}
            dir="ltr"
          />
          <span className="text-verdant-muted">₪</span>
        </label>
        {capital > 0 && (
          <span className="text-[11px] font-bold text-verdant-muted">
            סה״כ החזר חודשי כיום: {fmtILS(currentMonthlyService)}
          </span>
        )}
      </div>

      {options.length === 0 ? (
        <div
          className="rounded-xl px-4 py-6 text-center text-[12px]"
          style={{ background: "#F4F7ED", border: "1px dashed #d8e0d0", color: "#5a7a6a" }}
        >
          אין עסקאות פתוחות שאפשר לסגור — הזינו הלוואות ועסקאות תשלומים למעלה.
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = opt.id === selectedId;
            const disabled = !opt.withinBudget && capital > 0;
            return (
              <button
                key={opt.id}
                onClick={() => !disabled && setSelectedId(isSelected ? null : opt.id)}
                disabled={disabled}
                className="block w-full rounded-xl px-4 py-3 text-right transition-all"
                style={{
                  background: isSelected
                    ? "#eef7f1"
                    : disabled
                      ? "#f9faf2"
                      : "#fff",
                  border: `1px solid ${
                    isSelected
                      ? "#1B4332"
                      : disabled
                        ? "#eef2e8"
                        : "#d8e0d0"
                  }`,
                  opacity: disabled ? 0.55 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                        style={{
                          background: opt.kind === "loan" ? "#fef2f2" : "#eff6ff",
                          color: opt.kind === "loan" ? "#991B1B" : "#1d4ed8",
                        }}
                      >
                        {opt.kind === "loan" ? "הלוואה" : "תשלומים"}
                      </span>
                      <span className="truncate text-[14px] font-extrabold text-verdant-ink">
                        {opt.name}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-bold text-verdant-muted">
                      {opt.subtitle}
                      {disabled && ` · מעבר לתקציב הפנוי`}
                    </div>
                  </div>
                  <div className="text-left">
                    <div
                      className="text-[16px] font-extrabold tabular-nums"
                      style={{ color: "#1B4332" }}
                    >
                      +{fmtILS(opt.monthlyRelief)}/ח׳
                    </div>
                    <div className="text-[11px] font-bold text-verdant-muted">
                      בעלות {fmtILS(opt.costToClose)}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div
                    className="mt-3 grid grid-cols-2 gap-3 rounded-lg p-3 text-[12px] md:grid-cols-4"
                    style={{ background: "#fff", border: "1px solid #c9e3d4" }}
                  >
                    <ScenarioStat
                      label="עלות סגירה"
                      value={fmtILS(opt.costToClose)}
                      color="#012D1D"
                    />
                    <ScenarioStat
                      label="הקלה חודשית"
                      value={`+${fmtILS(opt.monthlyRelief)}`}
                      color="#1B4332"
                    />
                    <ScenarioStat
                      label="זמן עד שמחזירים"
                      value={`${Math.ceil(opt.costToClose / Math.max(1, opt.monthlyRelief))} חודשים`}
                      color="#1B4332"
                      sub="אם מפנים את ההקלה לחזרה לחיסכון"
                    />
                    <ScenarioStat
                      label="תשואה שנתית מוערכת"
                      value={`${(opt.annualizedRoi * 100).toFixed(1)}%`}
                      color="#1B4332"
                      sub="הקלה × 12 ÷ עלות סגירה"
                    />
                    <div
                      className="col-span-2 md:col-span-4 mt-1 border-t pt-2 text-[12px] leading-relaxed text-verdant-ink"
                      style={{ borderColor: "#c9e3d4" }}
                    >
                      <span className="font-extrabold">לפני: </span>
                      החזר חודשי כולל {fmtILS(currentMonthlyService)} · <br />
                      <span className="font-extrabold">אחרי: </span>
                      {fmtILS(currentMonthlyService - opt.monthlyRelief)} ל-
                      {opt.monthsRemaining} חודשים, ואז עוד פחות כשעסקאות נוספות
                      מסתיימות.
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ScenarioStat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-bold text-verdant-muted">{label}</div>
      <div className="text-[14px] font-extrabold tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] font-semibold text-verdant-muted">{sub}</div>}
    </div>
  );
}
