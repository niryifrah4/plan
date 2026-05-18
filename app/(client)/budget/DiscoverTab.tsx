"use client";

/**
 * DiscoverTab — שלב "מה קרה ב-3/6/12 חודשים אחרונים", בסגנון Spending
 * Snapshot ש-CFP-יועץ עובד איתו. הצורה: טבלה (לא גרף) כי לקוח חוזר
 * למספר ספציפי שהוא יכול לחלוק עליו, ולא לצורה ויזואלית שקל להחמיץ.
 *
 * הפיצ'רים שזה עוזר להבין:
 *   1. ממוצע הוצאות חודשי × 12 — הסיגנל "בשנה אתה מוציא ₪X" שעוצר זוגות
 *      בשיחה (לפי finance-agent 2026-05-16).
 *   2. Spending Snapshot לפי קטגוריה — חודש מול חודש, ממוצע, delta אחרון.
 *   3. חודשים חריגים (>25% מהממוצע) עם 3 העסקאות שהכי תרמו לחריגה.
 *   4. עסקאות תשלומים מסומנות בכל קטגוריה.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtILS } from "@/lib/format";
import {
  buildDiscoverSummary,
  type DiscoverSummary,
} from "@/lib/discover-aggregator";
import { loadParsedTransactions } from "@/lib/budget-import";
import { detectRecurring, type RecurringGroup } from "@/lib/doc-parser/recurring";
import { getOverrides } from "@/lib/doc-parser/categorizer";
import { scopedKey } from "@/lib/client-scope";
import { CATEGORY_TO_BUDGET } from "@/lib/category-to-budget-map";
import {
  applyDiscoverToCurrentMonth,
  choiceToAmount,
  type DiscoverChoice,
  type DiscoverChoiceMap,
} from "@/lib/discover-to-budget";
import type { CategoryRow } from "@/lib/discover-aggregator";

const SUBS_FLAGGED_KEY = "verdant:subs_flagged_for_review";

type WindowSize = 3 | 6 | 12;

export function DiscoverTab() {
  const [windowSize, setWindowSize] = useState<WindowSize>(6);
  const [summary, setSummary] = useState<DiscoverSummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<RecurringGroup[]>([]);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  /** Stats for the "learning" banner: how many user corrections the
   *  classifier has remembered, and how many txs in the current window
   *  still fell through to "other" / low-confidence. */
  const [learning, setLearning] = useState<{
    overrideCount: number;
    unmappedTxCount: number;
  }>({ overrideCount: 0, unmappedTxCount: 0 });

  useEffect(() => {
    const refresh = () => {
      setSummary(buildDiscoverSummary(windowSize));
      // Detect recurring against ALL parsed txs (not just the window) so a
      // monthly subscription that appears in 4 months of history clusters
      // even if the user picked 3-month view.
      const allTxs = loadParsedTransactions();
      const subs = detectRecurring(allTxs).filter((g) => g.frequency === "monthly");
      subs.sort((a, b) => b.amount - a.amount);
      setSubscriptions(subs);
      // Learning stats — surface that the system IS getting smarter and that
      // unmapped txs are still pending triage. Window-scoped count keeps the
      // banner relevant to the current view.
      const now = new Date();
      const windowStart = new Date(now.getFullYear(), now.getMonth() - windowSize, 1);
      const windowTxs = allTxs.filter((t) => {
        if (!t.date) return false;
        const d = new Date(t.date);
        return !isNaN(d.getTime()) && d >= windowStart;
      });
      const unmapped = windowTxs.filter(
        (t) =>
          t.category === "other" ||
          (typeof t.confidence === "number" && t.confidence < 0.7)
      );
      setLearning({
        overrideCount: getOverrides().length,
        unmappedTxCount: unmapped.length,
      });
      // Load flagged list from localStorage
      try {
        const raw = localStorage.getItem(scopedKey(SUBS_FLAGGED_KEY));
        if (raw) setFlagged(new Set(JSON.parse(raw)));
      } catch {}
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:parsed_transactions:updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:parsed_transactions:updated", refresh);
    };
  }, [windowSize]);

  const [showBuildModal, setShowBuildModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toggleFlag = (key: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(scopedKey(SUBS_FLAGGED_KEY), JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Empty-state guard
  if (!summary) {
    return <div className="card-pad text-center text-[12px] text-verdant-muted">טוען…</div>;
  }
  if (summary.txCount === 0) {
    return (
      <div className="space-y-4" dir="rtl">
        <PeriodSelector value={windowSize} onChange={setWindowSize} />
        <section
          className="rounded-2xl p-6 text-center"
          style={{ background: "#1A2438", border: "1px dashed #1F2A3F" }}
        >
          <div className="text-base font-extrabold text-verdant-ink">
            אין עדיין נתוני תנועות לניתוח
          </div>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-verdant-muted">
            כדי לראות תמונת תזרים של החודשים האחרונים, יש להעלות קבצי בנק / אשראי
            במסך{" "}
            <Link href="/files" className="underline hover:text-verdant-emerald">
              קבצים במיפוי
            </Link>
            . אחרי שהקבצים נטענים — הניתוח כאן יתעדכן אוטומטית.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PeriodSelector
        value={windowSize}
        onChange={setWindowSize}
        onBuildBudget={() => setShowBuildModal(true)}
        canBuild={summary.categories.length > 0}
      />

      <KpiStrip summary={summary} />

      {summary.txCount < 30 && (
        <div
          className="rounded-xl px-4 py-2.5 text-[12px]"
          style={{ background: "#fffbea", border: "1px solid #fde68a", color: "#92400E" }}
        >
          <span className="font-extrabold">⚠ דאטה דק:</span> רק {summary.txCount} תנועות
          ב-{summary.monthsCovered} חודשים. הממוצע עלול להיות לא מייצג. שווה להעלות
          קבצים נוספים לפני שיחה עם הלקוח.
        </div>
      )}

      <SpendingSnapshot summary={summary} />

      <LearningBanner
        overrideCount={learning.overrideCount}
        unmappedTxCount={learning.unmappedTxCount}
      />

      {subscriptions.length > 0 && (
        <SubscriptionsRadar
          subscriptions={subscriptions}
          flagged={flagged}
          onToggleFlag={toggleFlag}
        />
      )}

      {summary.anomalies.length > 0 && <AnomalySection anomalies={summary.anomalies} />}

      {showBuildModal && (
        <BuildBudgetModal
          summary={summary}
          windowSize={windowSize}
          onClose={() => setShowBuildModal(false)}
          onApplied={(result) => {
            setShowBuildModal(false);
            setToast(
              `תקציב עודכן · ${result.updated} שורות הוחלפו, ${result.created} נוספו`
            );
            setTimeout(() => setToast(null), 3500);
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-[12px] font-bold shadow-lg"
          style={{ background: "#F8FAFC", color: "#131C2E" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* Sub-components                                                      */
/* ═══════════════════════════════════════════════════════════════════ */

function PeriodSelector({
  value,
  onChange,
  onBuildBudget,
  canBuild = false,
}: {
  value: WindowSize;
  onChange: (v: WindowSize) => void;
  onBuildBudget?: () => void;
  canBuild?: boolean;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          ניתוח תזרים — חודשים אחרונים
        </div>
        <h3 className="text-base font-extrabold text-verdant-ink">
          מה קרה ב-{value} החודשים האחרונים
        </h3>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="inline-flex rounded-full p-0.5"
          style={{ background: "#1A2438", border: "1px solid #1F2A3F" }}
        >
          {([3, 6, 12] as const).map((n) => {
            const active = value === n;
            return (
              <button
                key={n}
                onClick={() => onChange(n)}
                className="rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors"
                style={{
                  background: active ? "#A8E040" : "transparent",
                  color: active ? "#fff" : "#94A3B8",
                }}
              >
                {n} חודשים
              </button>
            );
          })}
        </div>
        {canBuild && onBuildBudget && (
          <button
            onClick={onBuildBudget}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-extrabold transition-all hover:opacity-90"
            style={{
              background: "#A8E040",
              color: "#F8FAFC",
              border: "1px solid #F8FAFC",
            }}
            title="הפוך את הממוצעים לתקציב בסיס לחודש הנוכחי"
          >
            <span className="material-symbols-outlined text-[16px]">post_add</span>
            צור תקציב מהנתונים
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* BuildBudgetModal — Discover → Plan bridge per finance-agent           */
/* "average → starting point with choice", not "average → budget".       */
/* ───────────────────────────────────────────────────────────────────── */

function BuildBudgetModal({
  summary,
  windowSize,
  onClose,
  onApplied,
}: {
  summary: DiscoverSummary;
  windowSize: WindowSize;
  onClose: () => void;
  onApplied: (r: { updated: number; created: number; skipped: number }) => void;
}) {
  // Only categories with a known budget-row mapping AND a non-trivial average
  // qualify. Everything else (anomaly noise, unmapped tail) gets a "skip"
  // default the user can override by editing the row in /budget directly.
  const candidates = useMemo<CategoryRow[]>(
    () =>
      summary.categories.filter(
        (c) => CATEGORY_TO_BUDGET[c.key] && c.average >= 50
      ),
    [summary]
  );

  const [choices, setChoices] = useState<DiscoverChoiceMap>(() => {
    const init: DiscoverChoiceMap = {};
    for (const c of candidates) init[c.key] = { choice: "keep" };
    return init;
  });

  const setChoice = (key: string, choice: DiscoverChoice, customAmount?: number) => {
    setChoices((prev) => ({ ...prev, [key]: { choice, customAmount } }));
  };

  // Live total of the new budget (excluding salary/income) — gives the user
  // an immediate sense of "what's my proposed monthly spending"
  const proposedTotal = useMemo(() => {
    let s = 0;
    for (const cat of candidates) {
      const map = CATEGORY_TO_BUDGET[cat.key];
      if (!map || map.section === "income") continue;
      const ch = choices[cat.key];
      if (!ch) continue;
      s += choiceToAmount(cat.average, ch.choice, ch.customAmount);
    }
    return s;
  }, [candidates, choices]);

  // Original baseline (avg) for comparison
  const baselineTotal = useMemo(
    () =>
      candidates.reduce((s, c) => {
        const map = CATEGORY_TO_BUDGET[c.key];
        if (!map || map.section === "income") return s;
        return s + c.average;
      }, 0),
    [candidates]
  );

  const savedDelta = baselineTotal - proposedTotal;

  const apply = () => {
    const result = applyDiscoverToCurrentMonth(candidates, choices);
    onApplied(result);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,25,41,0.45)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-[#131C2E]"
        style={{ border: "1px solid #1F2A3F" }}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="border-b px-5 py-4" style={{ borderColor: "#1F2A3F" }}>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            Discover → Plan
          </div>
          <h2 className="text-lg font-extrabold text-verdant-ink">
            צור תקציב בסיס מהנתונים
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-verdant-muted">
            על בסיס ממוצע {windowSize} חודשים אחרונים — בחר לכל קטגוריה אם
            להשאיר את הממוצע, להקטין ב-15% / 30%, או לקבוע סכום משלך. שורות
            הכנסה ושורות נעולות לא משתנות.
          </p>
        </div>

        {/* Live totals strip */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          style={{ background: "#1A2438", borderBottom: "1px solid #1F2A3F" }}
        >
          <div className="flex gap-5">
            <Stat label="ממוצע נוכחי" value={fmtILS(Math.round(baselineTotal))} />
            <Stat
              label="תקציב מוצע"
              value={fmtILS(Math.round(proposedTotal))}
              color={proposedTotal <= baselineTotal ? "#A8E040" : "#FCA5A5"}
            />
            {savedDelta !== 0 && (
              <Stat
                label="חיסכון חודשי"
                value={`${savedDelta > 0 ? "+" : ""}${fmtILS(Math.round(savedDelta))}`}
                color={savedDelta > 0 ? "#A8E040" : "#FCA5A5"}
                hint={`${fmtILS(Math.round(savedDelta * 12))} בשנה`}
              />
            )}
          </div>
        </div>

        {/* Category list */}
        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {candidates.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-verdant-muted">
              אין מספיק נתונים מסווגים בחלון הזמן הזה כדי לבנות תקציב בסיס.
              <br />
              העלה קבצי בנק / אשראי נוספים ונסה שוב.
            </div>
          ) : (
            <ul className="space-y-3">
              {candidates.map((cat) => {
                const ch = choices[cat.key] || { choice: "keep" as const };
                const target = choiceToAmount(cat.average, ch.choice, ch.customAmount);
                return (
                  <li
                    key={cat.key}
                    className="rounded-xl p-3"
                    style={{ background: "#131C2E", border: "1px solid #1F2A3F" }}
                  >
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-extrabold text-verdant-ink text-[13px]">
                        {cat.label}
                      </div>
                      <div className="text-[11px] font-bold text-verdant-muted">
                        ממוצע: <span className="tabular-nums">{fmtILS(cat.average)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          ["keep", "השאר", 1.0],
                          ["reduce15", "−15%", 0.85],
                          ["reduce30", "−30%", 0.7],
                          ["custom", "סכום אחר", -1],
                          ["skip", "דלג", 0],
                        ] as const
                      ).map(([key, label, mult]) => {
                        const active = ch.choice === key;
                        const preview =
                          key === "custom"
                            ? ""
                            : key === "skip"
                              ? ""
                              : ` (${fmtILS(Math.round(cat.average * (mult as number) / 50) * 50)})`;
                        return (
                          <button
                            key={key}
                            onClick={() => setChoice(cat.key, key)}
                            className="rounded-full px-3 py-1 text-[11px] font-bold transition-colors"
                            style={{
                              background: active ? "#A8E040" : "#1A2438",
                              color: active ? "#fff" : "#94A3B8",
                              border: `1px solid ${active ? "#F8FAFC" : "#1F2A3F"}`,
                            }}
                          >
                            {label}
                            <span className="text-[10px] opacity-80">{preview}</span>
                          </button>
                        );
                      })}
                      {ch.choice === "custom" && (
                        <input
                          type="number"
                          min={0}
                          value={ch.customAmount ?? ""}
                          onChange={(e) =>
                            setChoice(
                              cat.key,
                              "custom",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="₪"
                          className="w-24 rounded-md border bg-[#131C2E] px-2 py-1 text-center text-[12px] font-extrabold tabular-nums"
                          style={{ borderColor: "#1F2A3F" }}
                          dir="ltr"
                          autoFocus
                        />
                      )}
                      <div className="ms-auto text-[11px] font-bold text-verdant-muted">
                        יעד:{" "}
                        <span
                          className="tabular-nums"
                          style={{
                            color: target < cat.average ? "#A8E040" : "#F8FAFC",
                          }}
                        >
                          {fmtILS(target)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: "1px solid #1F2A3F" }}
        >
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[12px] font-bold text-verdant-muted transition-colors hover:bg-verdant-bg"
          >
            ביטול
          </button>
          <button
            onClick={apply}
            disabled={candidates.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[12px] font-extrabold transition-all disabled:opacity-40"
            style={{
              background: "#A8E040",
              color: "#F8FAFC",
              border: "1px solid #F8FAFC",
            }}
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
            החל על תקציב החודש
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold text-verdant-muted">{label}</div>
      <div
        className="text-[16px] font-extrabold tabular-nums leading-tight"
        style={{ color: color || "#F8FAFC" }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px] font-semibold text-verdant-muted">{hint}</div>
      )}
    </div>
  );
}

function KpiStrip({ summary }: { summary: DiscoverSummary }) {
  const savingsRatePct = (summary.avgSavingsRate * 100).toFixed(0);
  const savingsLabel =
    summary.avgSavingsRate >= 0.2
      ? "בריא"
      : summary.avgSavingsRate >= 0.1
        ? "סביר"
        : summary.avgSavingsRate >= 0
          ? "נמוך"
          : "שלילי";
  const savingsColor =
    summary.avgSavingsRate >= 0.2
      ? "#A8E040"
      : summary.avgSavingsRate >= 0.1
        ? "#92400E"
        : summary.avgSavingsRate >= 0
          ? "#B45309"
          : "#FCA5A5";

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        label="ממוצע הוצאות חודשי"
        value={fmtILS(summary.avgMonthlyExpenses)}
        hint={`לאורך ${summary.monthsCovered} חודשים`}
        color="#F8FAFC"
      />
      <KpiCard
        label="הצפי השנתי"
        value={fmtILS(summary.annualProjectedExpenses)}
        hint="ממוצע × 12"
        color="#A8E040"
        highlight
      />
      <KpiCard
        label="הכנסות חודשיות בממוצע"
        value={fmtILS(summary.avgMonthlyIncome)}
        hint={summary.avgMonthlyIncome > 0 ? "נטו" : "אין נתון"}
        color="#A8E040"
      />
      <KpiCard
        label="שיעור חיסכון"
        value={`${savingsRatePct}%`}
        hint={savingsLabel}
        color={savingsColor}
      />
    </section>
  );
}

function KpiCard({
  label,
  value,
  hint,
  color,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: highlight ? "#1A2438" : "#fff",
        border: `1px solid ${highlight ? "#1F2A3F" : "#1F2A3F"}`,
      }}
    >
      <div className="mb-1 text-[11px] font-bold text-verdant-muted">{label}</div>
      <div className="text-[22px] font-extrabold tabular-nums leading-tight" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] font-semibold text-verdant-muted">{hint}</div>
      )}
    </div>
  );
}

function SpendingSnapshot({ summary }: { summary: DiscoverSummary }) {
  const { months, categories } = summary;

  if (categories.length === 0) {
    return (
      <section
        className="rounded-2xl px-4 py-5 text-center text-[12px]"
        style={{ background: "#1A2438", border: "1px dashed #1F2A3F", color: "#94A3B8" }}
      >
        אין הוצאות מסווגות בחלון הזמן הזה.
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl"
      style={{ background: "#131C2E", border: "1px solid #1F2A3F" }}
    >
      <div className="px-5 pt-5 pb-3">
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          Spending Snapshot
        </div>
        <h3 className="text-base font-extrabold text-verdant-ink">לאן הלך הכסף — לפי קטגוריה</h3>
      </div>

      <div className="overflow-x-auto" style={{ borderTop: "1px solid #1F2A3F" }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "#1A2438", color: "#94A3B8" }}>
              <th className="px-3 py-2 text-right font-extrabold uppercase tracking-[0.06em]">
                קטגוריה
              </th>
              {months.map((m) => (
                <th
                  key={m.ym}
                  className="px-3 py-2 text-left font-extrabold uppercase tracking-[0.06em] tabular-nums"
                >
                  {m.label.split(" ")[0].slice(0, 3)}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-extrabold uppercase tracking-[0.06em] tabular-nums">
                ממוצע
              </th>
              <th className="px-3 py-2 text-left font-extrabold uppercase tracking-[0.06em]">
                שינוי
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((row) => {
              const isVolatile = row.volatility >= 0.5;
              const deltaColor =
                row.lastDelta > 0
                  ? "#B45309"
                  : row.lastDelta < 0
                    ? "#A8E040"
                    : "#94A3B8";
              return (
                <tr key={row.key} style={{ borderTop: "1px solid #1F2A3F" }}>
                  <td className="px-3 py-2 font-bold text-verdant-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {row.label}
                      {row.installmentTxCount > 0 && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                          style={{ background: "#1A2438", color: "#1d4ed8" }}
                          title={`כולל ${row.installmentTxCount} תשלומים זוהו`}
                        >
                          תשלומים×{row.installmentTxCount}
                        </span>
                      )}
                      {isVolatile && (
                        <span
                          className="text-[12px]"
                          style={{ color: "#B45309" }}
                          title="קטגוריה תנודתית — חודש שיא חורג מ-50% מעל הממוצע"
                        >
                          !
                        </span>
                      )}
                    </span>
                  </td>
                  {months.map((m) => (
                    <td
                      key={m.ym}
                      className="px-3 py-2 text-left tabular-nums"
                      style={{ color: "#F8FAFC" }}
                    >
                      {fmtILS(row.byMonth[m.ym] || 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-left font-extrabold tabular-nums text-verdant-ink">
                    {fmtILS(row.average)}
                  </td>
                  <td
                    className="px-3 py-2 text-left tabular-nums font-bold"
                    style={{ color: deltaColor }}
                  >
                    {row.lastDelta === 0
                      ? "—"
                      : `${row.lastDelta > 0 ? "+" : ""}${fmtILS(row.lastDelta)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#1A2438", borderTop: "2px solid #1F2A3F" }}>
              <td className="px-3 py-2.5 font-extrabold text-verdant-ink">סה״כ הוצאות</td>
              {months.map((m) => (
                <td
                  key={m.ym}
                  className="px-3 py-2.5 text-left font-extrabold tabular-nums text-verdant-ink"
                >
                  {fmtILS(m.expenses)}
                </td>
              ))}
              <td
                className="px-3 py-2.5 text-left font-extrabold tabular-nums"
                style={{ color: "#F8FAFC" }}
              >
                {fmtILS(summary.avgMonthlyExpenses)}
              </td>
              <td />
            </tr>
            <tr style={{ background: "#1A2438", borderTop: "1px solid #1F2A3F" }}>
              <td className="px-3 py-2.5 font-bold text-verdant-muted">נטו לחודש</td>
              {months.map((m) => (
                <td
                  key={m.ym}
                  className="px-3 py-2.5 text-left font-extrabold tabular-nums"
                  style={{ color: m.net >= 0 ? "#A8E040" : "#FCA5A5" }}
                >
                  {m.net >= 0 ? "+" : ""}
                  {fmtILS(m.net)}
                </td>
              ))}
              <td
                className="px-3 py-2.5 text-left font-extrabold tabular-nums"
                style={{ color: summary.avgMonthlyNet >= 0 ? "#A8E040" : "#FCA5A5" }}
              >
                {summary.avgMonthlyNet >= 0 ? "+" : ""}
                {fmtILS(summary.avgMonthlyNet)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/**
 * LearningBanner — surfaces "the system is learning" so the user trusts
 * the categorization, and nudges them to triage the unmapped tail so the
 * snapshot becomes more accurate over time. Per finance-agent (P3 of the
 * discover roadmap): merchant memory has higher ROI than AI categorization
 * because it makes the existing rule-based engine smarter for free.
 */
function LearningBanner({
  overrideCount,
  unmappedTxCount,
}: {
  overrideCount: number;
  unmappedTxCount: number;
}) {
  // Nothing learned yet AND nothing pending → don't add visual noise.
  if (overrideCount === 0 && unmappedTxCount === 0) return null;

  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: "#1A2438", border: "1px solid #1F2A3F" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined text-[22px]"
            style={{ color: "#A8E040" }}
          >
            psychology
          </span>
          <div>
            <div className="text-[13px] font-extrabold text-verdant-ink">
              סיווג חכם — המערכת לומדת מהתיקונים שלך
            </div>
            <div className="mt-0.5 text-[11px] font-bold text-verdant-muted">
              {overrideCount > 0 ? (
                <>
                  <span className="text-verdant-emerald">{overrideCount}</span>{" "}
                  סיווגים נלמדו · כל תיקון משפר את הסיווג של עסקאות עתידיות
                </>
              ) : (
                "אין עדיין סיווגים נלמדים"
              )}
            </div>
          </div>
        </div>
        {unmappedTxCount > 0 && (
          <Link
            href="/files"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition-colors"
            style={{
              background: "#fffbea",
              color: "#92400E",
              border: "1px solid #fde68a",
            }}
          >
            <span className="material-symbols-outlined text-[14px]">label</span>
            {unmappedTxCount} עסקאות ממתינות לסיווג →
          </Link>
        )}
      </div>
    </section>
  );
}

function SubscriptionsRadar({
  subscriptions,
  flagged,
  onToggleFlag,
}: {
  subscriptions: RecurringGroup[];
  flagged: Set<string>;
  onToggleFlag: (key: string) => void;
}) {
  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.amount, 0);
  const flaggedTotal = subscriptions
    .filter((s) => flagged.has(subKey(s)))
    .reduce((s, sub) => s + sub.amount, 0);

  return (
    <section
      className="rounded-2xl"
      style={{ background: "#131C2E", border: "1px solid #1F2A3F" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
        <div>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            Subscriptions Radar
          </div>
          <h3 className="text-base font-extrabold text-verdant-ink">
            מנויים שאתה לא יודע שאתה משלם
          </h3>
        </div>
        <div className="text-left">
          <div
            className="text-[18px] font-extrabold tabular-nums leading-tight"
            style={{ color: "#A8E040" }}
          >
            {fmtILS(totalMonthly)}/ח׳
          </div>
          <div className="text-[11px] font-bold text-verdant-muted">
            {subscriptions.length} מנויים · {fmtILS(totalMonthly * 12)} בשנה
          </div>
        </div>
      </div>

      {flagged.size > 0 && (
        <div
          className="mx-5 mb-3 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "#fffbea", border: "1px solid #fde68a", color: "#92400E" }}
        >
          סומנו לדיון: <strong>{flagged.size}</strong> מנויים בעלות{" "}
          <strong className="tabular-nums">{fmtILS(flaggedTotal)}/ח׳</strong>
          {" "}({fmtILS(flaggedTotal * 12)} בשנה אם תבטל)
        </div>
      )}

      <div style={{ borderTop: "1px solid #1F2A3F" }}>
        {subscriptions.map((sub) => {
          const key = subKey(sub);
          const isFlagged = flagged.has(key);
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-3 px-5 py-2.5"
              style={{
                borderTop: "1px solid #1F2A3F",
                background: isFlagged ? "#fffbea" : "#fff",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold text-verdant-ink text-[13px]">
                  {sub.description}
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-verdant-muted">
                  {sub.categoryLabel || sub.category || "אחר"} · {sub.matchCount} חודשים
                  עוקבים · ביום {sub.dayOfMonth} בחודש
                </div>
              </div>
              <div className="text-left">
                <div
                  className="text-[14px] font-extrabold tabular-nums"
                  style={{ color: "#A8E040" }}
                >
                  {fmtILS(sub.amount)}
                </div>
                <div className="text-[10px] font-semibold text-verdant-muted">
                  לחודש
                </div>
              </div>
              <button
                onClick={() => onToggleFlag(key)}
                className="rounded-full px-3 py-1 text-[11px] font-bold transition-colors"
                style={{
                  background: isFlagged ? "#fde68a" : "#1A2438",
                  color: isFlagged ? "#78350F" : "#94A3B8",
                  border: `1px solid ${isFlagged ? "#f59e0b" : "#1F2A3F"}`,
                }}
                title={isFlagged ? "הסר סימון" : "סמן לדיון עם הלקוח"}
              >
                {isFlagged ? "✓ סומן לדיון" : "סמן לדיון"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function subKey(sub: RecurringGroup): string {
  return `${sub.description}|${Math.round(sub.amount)}`;
}

function AnomalySection({
  anomalies,
}: {
  anomalies: DiscoverSummary["anomalies"];
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-verdant-emerald">flag</span>
        <h3 className="text-base font-extrabold text-verdant-ink">חודשים חריגים</h3>
        <span className="text-[11px] font-semibold text-verdant-muted">
          (הוצאות מעל 25% מהממוצע)
        </span>
      </div>
      <div className="space-y-2">
        {anomalies.map((a) => (
          <div
            key={a.ym}
            className="rounded-xl p-3"
            style={{ background: "#fffbea", border: "1px solid #fde68a" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-extrabold text-[13px]" style={{ color: "#78350f" }}>
                {a.label}
              </div>
              <div className="text-[12px] font-bold" style={{ color: "#92400E" }}>
                {fmtILS(a.total)} · חריגה של {fmtILS(a.delta)} מעל הממוצע
              </div>
            </div>
            {a.topContributors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px]" style={{ color: "#78350f" }}>
                {a.topContributors.map((t, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">
                      • {t.description}{" "}
                      <span className="opacity-70">({t.categoryLabel})</span>
                    </span>
                    <span className="tabular-nums font-bold">{fmtILS(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
