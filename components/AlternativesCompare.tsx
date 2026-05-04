/**
 * Alternatives Comparison Module
 * Displays "Current State" vs "Proposed State" side-by-side with a
 * cumulative delta projected over N years. Works for any scenario:
 *   • Pension management fees (current 1.0% → proposed 0.6%)
 *   • Mortgage refinance (current 5.2% → proposed 3.9%)
 *   • Investment instrument swap (current 4% → proposed 7%)
 */

import { Card } from "./ui/Card";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";

export interface AlternativeLeg {
  label: string; // "מצב נוכחי" / "מצב מוצע"
  lumpToday: number;
  monthly: number;
  annualRate: number; // net of fees
}

interface Props {
  title: string;
  horizonYears: number;
  current: AlternativeLeg;
  proposed: AlternativeLeg;
  note?: string;
}

export function AlternativesCompare({ title, horizonYears, current, proposed, note }: Props) {
  const fvCurrent = futureValue(
    current.lumpToday,
    current.monthly,
    current.annualRate,
    horizonYears
  );
  const fvProposed = futureValue(
    proposed.lumpToday,
    proposed.monthly,
    proposed.annualRate,
    horizonYears
  );
  const delta = fvProposed - fvCurrent;
  const pct = fvCurrent > 0 ? (delta / fvCurrent) * 100 : 0;

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
          אופק {horizonYears} שנים
        </span>
        <h3 className="text-lg font-extrabold text-verdant-ink">{title}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Leg leg={current} fv={fvCurrent} tone="muted" />
        <Leg leg={proposed} fv={fvProposed} tone="accent" />
      </div>

      <div className="v-divider mt-4 border-t pt-4">
        <div className="flex items-baseline justify-between">
          <span
            className="tabular text-2xl font-extrabold"
            style={{ color: delta >= 0 ? "#1B4332" : "#b91c1c" }}
          >
            {delta >= 0 ? "+" : ""}
            {fmtILS(delta)} ({pct >= 0 ? "+" : ""}
            {pct.toFixed(1)}%)
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
            הפרש מצטבר
          </span>
        </div>
        {note && (
          <p className="mt-2 text-right text-xs font-bold leading-relaxed text-verdant-muted">
            {note}
          </p>
        )}
      </div>
    </Card>
  );
}

function Leg({ leg, fv, tone }: { leg: AlternativeLeg; fv: number; tone: "muted" | "accent" }) {
  const bg = tone === "accent" ? "#1B433211" : "#f4f6f1";
  const border = tone === "accent" ? "#1B4332" : "#d8e0d0";
  return (
    <div className="rounded-lg border p-3" style={{ background: bg, borderColor: border }}>
      <div className="mb-1 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
        {leg.label}
      </div>
      <div className="tabular text-right text-xl font-extrabold text-verdant-ink">{fmtILS(fv)}</div>
      <div className="mt-2 space-y-0.5 text-right text-[11px] font-bold leading-relaxed text-verdant-muted">
        <div>
          פתיחה: <span className="tabular">{fmtILS(leg.lumpToday)}</span>
        </div>
        <div>
          חודשי: <span className="tabular">{fmtILS(leg.monthly)}</span>
        </div>
        <div>
          תשואה: <span className="tabular">{(leg.annualRate * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
