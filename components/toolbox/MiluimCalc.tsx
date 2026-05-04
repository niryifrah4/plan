"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { fmtILS } from "@/lib/format";
import { simulateMiluim, type MiluimInputs } from "@/lib/miluim";

const DEFAULTS: MiluimInputs = {
  reserveDays: 26,
  longestStretchDays: 26,
  monthlyGross: 28000,
  selfEmployed: false,
};

export function MiluimCalc() {
  const [inputs, setInputs] = useState<MiluimInputs>(DEFAULTS);
  const result = simulateMiluim(inputs);

  function set<K extends keyof MiluimInputs>(key: K, val: MiluimInputs[K]) {
    setInputs((p) => ({ ...p, [key]: val }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-4 text-right text-lg font-extrabold text-verdant-ink">פרמטרים</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="text-[11px] font-bold text-verdant-muted">ימי מילואים בשנה</span>
            <input
              type="number"
              value={inputs.reserveDays}
              onChange={(e) => set("reserveDays", Number(e.target.value))}
              className="v-divider tabular mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-bold text-verdant-ink focus:outline-none focus:ring-2 focus:ring-verdant-accent/40"
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-verdant-muted">רצף הכי ארוך (ימים)</span>
            <input
              type="number"
              value={inputs.longestStretchDays}
              onChange={(e) => set("longestStretchDays", Number(e.target.value))}
              className="v-divider tabular mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-bold text-verdant-ink focus:outline-none focus:ring-2 focus:ring-verdant-accent/40"
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-verdant-muted">משכורת ברוטו (חודשי)</span>
            <input
              type="number"
              value={inputs.monthlyGross}
              onChange={(e) => set("monthlyGross", Number(e.target.value))}
              className="v-divider tabular mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-bold text-verdant-ink focus:outline-none focus:ring-2 focus:ring-verdant-accent/40"
              dir="ltr"
            />
          </label>
          <label className="flex items-center gap-3 pt-5">
            <input
              type="checkbox"
              checked={inputs.selfEmployed}
              onChange={(e) => set("selfEmployed", e.target.checked)}
              className="h-5 w-5 rounded border-verdant-line accent-verdant-accent"
            />
            <span className="text-sm font-bold text-verdant-ink">עצמאי</span>
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-right text-lg font-extrabold text-verdant-ink">הערכת הטבות</h3>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricBox label="מענק ימי מילואים" value={fmtILS(result.grant)} />
          <MetricBox label="זיכוי מס" value={fmtILS(result.taxCreditValue)} />
          <MetricBox label="החזר ביט״ל (עצמאים)" value={fmtILS(result.biturebate)} />
          <MetricBox label="סך הטבה משוערת" value={fmtILS(result.total)} accent />
        </div>

        <div className="v-divider border-t pt-4">
          <h4 className="mb-2 text-right text-sm font-extrabold text-verdant-ink">
            זכאויות ששוער כי חלות:
          </h4>
          <ul className="space-y-1.5">
            {result.entitlements.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-right">
                <span className="material-symbols-outlined mt-0.5 text-[16px] text-verdant-accent">
                  check_circle
                </span>
                <span className="text-sm font-bold leading-relaxed text-verdant-muted">{e}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-right">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined mt-0.5 text-[18px] text-amber-600">
              info
            </span>
            <span className="text-xs font-bold leading-relaxed text-amber-800">
              החישוב הוא הערכה בלבד. יש לפנות ליועץ מס מוסמך לאישור עדכני בהתאם לפקודה ולצווים
              הנוגעים לשנת המס הרלוונטית.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MetricBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="v-divider rounded-lg border p-3 text-right"
      style={accent ? { background: "#1B433211", borderColor: "#1B4332" } : undefined}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
        {label}
      </div>
      <div
        className="tabular text-lg font-extrabold"
        style={accent ? { color: "#1B4332" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
