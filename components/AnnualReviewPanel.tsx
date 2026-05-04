"use client";

/**
 * AnnualReviewPanel — year-end "strategic brain" UI.
 *
 * Built 2026-04-29 per Nir's killer-feature brief: end-of-year, the user
 * enters real numbers; we compare to the forecast snapshot and recommend
 * what to do with any surplus.
 *
 * Lives under /retirement (most natural home — also where the long-term
 * trajectory is visualized). Reads + writes via lib/annual-review.ts.
 */

import { useState, useMemo, useEffect } from "react";
import { fmtILS } from "@/lib/format";
import {
  loadAnnualSnapshots,
  recordAnnualSnapshot,
  captureCurrentForecast,
  analyzeSnapshot,
  ANNUAL_REVIEW_EVENT,
  type AnnualSnapshot,
} from "@/lib/annual-review";

export function AnnualReviewPanel() {
  const [snaps, setSnaps] = useState<AnnualSnapshot[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const refresh = () => setSnaps(loadAnnualSnapshots());
    refresh();
    window.addEventListener(ANNUAL_REVIEW_EVENT, refresh);
    return () => window.removeEventListener(ANNUAL_REVIEW_EVENT, refresh);
  }, []);

  const latest = snaps[snaps.length - 1];
  const verdict = useMemo(() => (latest ? analyzeSnapshot(latest) : null), [latest]);

  return (
    <section className="card-pad mb-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-verdant-emerald">
            psychology
          </span>
          <div>
            <div className="caption mb-0.5">בקרה שנתית</div>
            <h3 className="text-base font-extrabold text-verdant-ink">ביצוע מול תחזית</h3>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg border px-3 py-1.5 text-[12px] font-bold"
          style={{ background: "#F3F4EC", color: "#1B4332", borderColor: "#c9d3c0" }}
        >
          + הוסף סיכום שנתי
        </button>
      </div>

      {/* Latest verdict */}
      {latest && verdict && (
        <div
          className="mb-3 rounded-xl p-4"
          style={{
            background: verdict.totalSurplus > 0 ? "#f0fdf4" : "#fffbeb",
            border: `1px solid ${verdict.totalSurplus > 0 ? "#86efac" : "#fcd34d"}`,
          }}
        >
          <div
            className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em]"
            style={{ color: verdict.totalSurplus > 0 ? "#166534" : "#92400e" }}
          >
            סיכום {latest.year}
          </div>
          <div
            className="text-base font-extrabold leading-relaxed"
            style={{ color: verdict.totalSurplus > 0 ? "#14532d" : "#78350f" }}
          >
            {verdict.headline}
          </div>
          {verdict.recommendation && (
            <div
              className="mt-2 text-[13px] leading-relaxed"
              style={{ color: verdict.totalSurplus > 0 ? "#166534" : "#92400e" }}
            >
              💡 {verdict.recommendation}
            </div>
          )}
          {verdict.fastTrackedGoals.length > 0 && (
            <div className="mt-2 text-[12px]" style={{ color: "#166534" }}>
              <strong>זריזה משמעותית:</strong> {verdict.fastTrackedGoals.join(" · ")}
            </div>
          )}

          {/* Compare grid */}
          <div
            className="mt-3 grid grid-cols-3 gap-3 border-t pt-3"
            style={{ borderColor: verdict.totalSurplus > 0 ? "#86efac" : "#fcd34d" }}
          >
            <CompareCell
              label="הון נטו"
              actual={latest.actualNetWorth}
              forecast={latest.forecastNetWorth}
            />
            <CompareCell
              label="הכנסה שנתית"
              actual={latest.actualAnnualIncome}
              forecast={latest.forecastIncome}
            />
            <CompareCell
              label="הוצאה שנתית"
              actual={latest.actualAnnualExpenses}
              forecast={latest.forecastExpenses}
              lowerIsBetter
            />
          </div>
        </div>
      )}

      {!latest && (
        <div className="py-6 text-center text-sm text-verdant-muted">
          סוף שנה? לחץ "הוסף סיכום שנתי" כדי לראות איך הביצוע מול התחזית.
        </div>
      )}

      {/* History */}
      {snaps.length > 1 && (
        <div className="v-divider mt-4 border-t pt-3">
          <div className="mb-2 text-[11px] font-bold text-verdant-muted">היסטוריה</div>
          <div className="space-y-1.5">
            {snaps
              .slice()
              .reverse()
              .slice(1)
              .map((s) => {
                const v = analyzeSnapshot(s);
                return (
                  <div key={s.year} className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-verdant-ink">{s.year}</span>
                    <span className="text-verdant-muted">{v.headline}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {showForm && <AnnualReviewForm onClose={() => setShowForm(false)} />}
    </section>
  );
}

function CompareCell({
  label,
  actual,
  forecast,
  lowerIsBetter,
}: {
  label: string;
  actual: number;
  forecast: number;
  lowerIsBetter?: boolean;
}) {
  const diff = actual - forecast;
  const positive = lowerIsBetter ? diff < 0 : diff > 0;
  const color = diff === 0 ? "#5a7a6a" : positive ? "#1B4332" : "#8B2E2E";
  return (
    <div>
      <div className="text-[10px] font-bold text-verdant-muted">{label}</div>
      <div className="text-sm font-extrabold tabular-nums text-verdant-ink">{fmtILS(actual)}</div>
      <div className="mt-0.5 text-[10px] tabular-nums" style={{ color }}>
        {diff === 0 ? "כצפוי" : `${diff > 0 ? "+" : ""}${fmtILS(diff)} מהתחזית`}
      </div>
    </div>
  );
}

function AnnualReviewForm({ onClose }: { onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const forecast = useMemo(() => captureCurrentForecast(), []);
  const [year, setYear] = useState(currentYear);
  const [income, setIncome] = useState("");
  const [expenses, setExpenses] = useState("");
  const [netWorth, setNetWorth] = useState("");
  const [contribs, setContribs] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    recordAnnualSnapshot({
      year,
      actualAnnualIncome: parseFloat(income) || 0,
      actualAnnualExpenses: parseFloat(expenses) || 0,
      actualNetWorth: parseFloat(netWorth) || 0,
      actualContributions: parseFloat(contribs) || 0,
      forecastNetWorth: forecast.forecastNetWorth,
      forecastIncome: forecast.forecastIncome,
      forecastExpenses: forecast.forecastExpenses,
      forecastReturnPct: forecast.forecastReturnPct,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="v-divider flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-extrabold text-verdant-ink">סיכום שנתי</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-verdant-bg">
            <span className="material-symbols-outlined text-[20px] text-verdant-muted">close</span>
          </button>
        </div>
        <div className="space-y-3 px-6 py-4">
          <Field
            label="שנה"
            value={String(year)}
            onChange={(v) => setYear(parseInt(v) || currentYear)}
            type="number"
          />
          <Field
            label="הכנסה שנתית בפועל"
            value={income}
            onChange={setIncome}
            type="number"
            placeholder={String(forecast.forecastIncome)}
          />
          <Field
            label="הוצאה שנתית בפועל"
            value={expenses}
            onChange={setExpenses}
            type="number"
            placeholder={String(forecast.forecastExpenses)}
          />
          <Field
            label="הון נטו בסוף שנה"
            value={netWorth}
            onChange={setNetWorth}
            type="number"
            placeholder={String(forecast.forecastNetWorth)}
          />
          <Field
            label="סך הפקדות לחיסכון/השקעות"
            value={contribs}
            onChange={setContribs}
            type="number"
          />
          <div>
            <label className="mb-1 block text-[11px] font-bold text-verdant-muted">
              הערות (אופציונלי)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "#d8e0d0" }}
            />
          </div>
          <div
            className="rounded-lg p-2.5 text-[11px]"
            style={{ background: "#f4f7ed", color: "#5a7a6a" }}
          >
            <strong>תחזית מערכתית:</strong> הון {fmtILS(forecast.forecastNetWorth)} · הכנסה{" "}
            {fmtILS(forecast.forecastIncome)} · הוצאות {fmtILS(forecast.forecastExpenses)}
          </div>
        </div>
        <div className="v-divider flex justify-end gap-2 border-t px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-bold text-verdant-muted hover:bg-verdant-bg"
          >
            ביטול
          </button>
          <button
            onClick={submit}
            className="rounded-lg px-4 py-2 text-[12px] font-bold"
            style={{ background: "#1B4332", color: "#fff" }}
          >
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-verdant-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
        style={{ borderColor: "#d8e0d0" }}
      />
    </div>
  );
}
