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
        <h3 className="text-lg font-extrabold text-verdant-ink mb-4 text-right">פרמטרים</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-[11px] text-verdant-muted font-bold">ימי מילואים בשנה</span>
            <input type="number" value={inputs.reserveDays}
              onChange={(e) => set("reserveDays", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border v-divider px-3 py-2 text-sm font-bold text-verdant-ink tabular bg-white focus:outline-none focus:ring-2 focus:ring-verdant-accent/40" dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-verdant-muted font-bold">רצף הכי ארוך (ימים)</span>
            <input type="number" value={inputs.longestStretchDays}
              onChange={(e) => set("longestStretchDays", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border v-divider px-3 py-2 text-sm font-bold text-verdant-ink tabular bg-white focus:outline-none focus:ring-2 focus:ring-verdant-accent/40" dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-verdant-muted font-bold">משכורת ברוטו (חודשי)</span>
            <input type="number" value={inputs.monthlyGross}
              onChange={(e) => set("monthlyGross", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border v-divider px-3 py-2 text-sm font-bold text-verdant-ink tabular bg-white focus:outline-none focus:ring-2 focus:ring-verdant-accent/40" dir="ltr"
            />
          </label>
          <label className="flex items-center gap-3 pt-5">
            <input type="checkbox" checked={inputs.selfEmployed}
              onChange={(e) => set("selfEmployed", e.target.checked)}
              className="w-5 h-5 rounded border-verdant-line accent-verdant-accent"
            />
            <span className="text-sm font-bold text-verdant-ink">עצמאי</span>
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-extrabold text-verdant-ink mb-4 text-right">הערכת הטבות</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricBox label="מענק ימי מילואים" value={fmtILS(result.grant)} />
          <MetricBox label="זיכוי מס" value={fmtILS(result.taxCreditValue)} />
          <MetricBox label="החזר ביט״ל (עצמאים)" value={fmtILS(result.biturebate)} />
          <MetricBox label="סך הטבה משוערת" value={fmtILS(result.total)} accent />
        </div>

        <div className="border-t v-divider pt-4">
          <h4 className="text-sm font-extrabold text-verdant-ink mb-2 text-right">זכאויות ששוער כי חלות:</h4>
          <ul className="space-y-1.5">
            {result.entitlements.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-right">
                <span className="material-symbols-outlined text-verdant-accent text-[16px] mt-0.5">check_circle</span>
                <span className="text-sm text-verdant-muted font-bold leading-relaxed">{e}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-right">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-600 text-[18px] mt-0.5">info</span>
            <span className="text-xs font-bold text-amber-800 leading-relaxed">
              החישוב הוא הערכה בלבד. יש לפנות ליועץ מס מוסמך לאישור עדכני בהתאם לפקודה ולצווים הנוגעים לשנת המס הרלוונטית.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MetricBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="p-3 rounded-lg border v-divider text-right" style={accent ? { background: "#1B433211", borderColor: "#1B4332" } : undefined}>
      <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">{label}</div>
      <div className="text-lg font-extrabold tabular" style={accent ? { color: "#1B4332" } : undefined}>{value}</div>
    </div>
  );
}
