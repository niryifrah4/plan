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
import type { DebtData, Loan } from "@/lib/debt-store";

interface PayoffOption {
  kind: "loan" | "installment";
  id: string;
  name: string;
  subtitle: string;
  monthlyRelief: number;
  monthsRemaining: number;
  /** True cost to settle today — PV of remaining payments at the loan's rate
   *  when known, else nominal sum. */
  costToClose: number;
  /** Annualized return implied by avoiding the future interest. */
  annualizedRoi: number;
  /** Future interest saved by closing now (nominal − PV). 0 for no-interest installments. */
  interestSaved: number;
  /** True when the loan has no stored rate and the cost is an approximation. */
  rateUnknown: boolean;
  withinBudget: boolean;
}

function loanMonthsLeft(loan: Loan): number {
  if (!loan.startDate || !loan.totalPayments) return 0;
  const [y, m] = loan.startDate.split("-").map(Number);
  const now = new Date();
  const elapsed = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.max(0, loan.totalPayments - elapsed);
}

/** PV of `months` equal monthly payments at annual `rate` (decimal fraction). */
function pvOfPayments(monthly: number, months: number, annualRate: number): number {
  if (monthly <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return monthly * months;
  return (monthly * (1 - Math.pow(1 + r, -months))) / r;
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
      // 2026-05-21 Phase 5: NPV-aware cost-to-close. When the loan stores its
      // rate, cost-to-close = present value of remaining payments at that
      // rate. Otherwise fall back to the nominal sum (and tag the option as
      // an approximation). Annualized ROI now reflects the interest you avoid
      // by closing now: (nominal − PV) / PV / years. A 9% loan with 5 years
      // left now ranks ABOVE a 12-month 0% installment plan — Phase 1 finance-
      // agent's biggest open finding.
      const nominal = Math.round(loan.monthlyPayment * remaining);
      const rate = loan.interestRate;
      const rateUnknown = typeof rate !== "number";
      const costToClose = rateUnknown
        ? nominal
        : Math.round(pvOfPayments(loan.monthlyPayment, remaining, rate));
      const interestSaved = Math.max(0, nominal - costToClose);
      const years = remaining / 12;
      const annualizedRoi =
        costToClose > 0 && years > 0
          ? interestSaved / costToClose / years
          : 0;
      opts.push({
        kind: "loan",
        id: loan.id,
        name: loan.lender || "הלוואה",
        subtitle: `${remaining} תשלומים נותרו${rateUnknown ? " · ריבית לא ידועה" : ""}`,
        monthlyRelief: Math.round(loan.monthlyPayment),
        monthsRemaining: remaining,
        costToClose,
        annualizedRoi,
        interestSaved,
        rateUnknown,
        withinBudget: capital >= costToClose,
      });
    }

    for (const inst of data.installments || []) {
      const remaining = Math.max(0, (inst.totalPayments || 0) - (inst.currentPayment || 0) + 1);
      if (remaining <= 0 || !inst.monthlyAmount) continue;
      // Installments in Israel are typically 0% interest (the merchant absorbs
      // it via a higher base price). cost-to-close = nominal sum, interestSaved
      // = 0, ROI = 0. This ranks them BELOW interest-bearing loans.
      const costToClose = Math.round(inst.monthlyAmount * remaining);
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
        annualizedRoi: 0,
        interestSaved: 0,
        rateUnknown: false,
        withinBudget: capital >= costToClose,
      });
    }

    // Rank within-budget first (highest ROI = highest interest saved per
    // shekel deployed), then over-budget by closest cost-to-close.
    opts.sort((a, b) => {
      if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;
      if (a.withinBudget) {
        if (a.annualizedRoi !== b.annualizedRoi) return b.annualizedRoi - a.annualizedRoi;
        // Tiebreaker: smaller cost-to-close wins (faster relief).
        return a.costToClose - b.costToClose;
      }
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
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
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

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#FAFAF7] px-4 py-3">
        <label className="flex items-center gap-2 text-[12px] font-bold text-verdant-ink">
          סכום פנוי
          <input
            type="number"
            min={0}
            value={capitalStr}
            onChange={(e) => setCapitalStr(e.target.value)}
            placeholder="לדוגמה 5,000"
            className="w-32 rounded-md border bg-[#FFFFFF] px-2 py-1 text-center text-[13px] font-extrabold tabular-nums"
            style={{ borderColor: "#E5E7EB" }}
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
          style={{ background: "#FAFAF7", border: "1px dashed #E5E7EB", color: "#6B7280" }}
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
                    ? "#FAFAF7"
                    : disabled
                      ? "#FFFFFF"
                      : "#FFFFFF",
                  border: `1px solid ${
                    isSelected
                      ? "#2C7A5A"
                      : disabled
                        ? "#E5E7EB"
                        : "#E5E7EB"
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
                          background: opt.kind === "loan" ? "rgba(220,38,38,0.08)" : "#FAFAF7",
                          color: opt.kind === "loan" ? "#B91C1C" : "#1d4ed8",
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
                      style={{ color: "#2C7A5A" }}
                    >
                      {fmtILS(opt.monthlyRelief, { signed: true })}/ח׳
                    </div>
                    <div className="text-[11px] font-bold text-verdant-muted">
                      בעלות {fmtILS(opt.costToClose)}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div
                    className="mt-3 grid grid-cols-2 gap-3 rounded-lg p-3 text-[12px] md:grid-cols-4"
                    style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
                  >
                    <ScenarioStat
                      label="עלות סגירה (היום)"
                      value={fmtILS(opt.costToClose)}
                      color="#1A1A1A"
                      sub={
                        opt.rateUnknown
                          ? "מוערך — אין ריבית רשומה"
                          : opt.interestSaved > 0
                            ? `חוסך ${fmtILS(opt.interestSaved)} ריבית עתידית`
                            : "ללא ריבית — סכום נומינלי"
                      }
                    />
                    <ScenarioStat
                      label="הקלה חודשית"
                      value={`+${fmtILS(opt.monthlyRelief)}`}
                      color="#2C7A5A"
                    />
                    <ScenarioStat
                      label="חודשים נותרים"
                      value={`${opt.monthsRemaining}`}
                      color="#2C7A5A"
                      sub="מספר התשלומים שמתפנים"
                    />
                    <ScenarioStat
                      label="תשואה שנתית"
                      value={
                        opt.rateUnknown
                          ? "—"
                          : opt.annualizedRoi > 0
                            ? `${(opt.annualizedRoi * 100).toFixed(1)}%`
                            : "0%"
                      }
                      color="#2C7A5A"
                      sub={
                        opt.rateUnknown
                          ? "נדרשת ריבית להלוואה"
                          : opt.annualizedRoi > 0
                            ? "ריבית שנחסכת ÷ עלות סגירה"
                            : "ללא ריבית — אין חיסכון בריבית"
                      }
                    />
                    <div
                      className="col-span-2 md:col-span-4 mt-1 border-t pt-2 text-[12px] leading-relaxed text-verdant-ink"
                      style={{ borderColor: "#E5E7EB" }}
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
