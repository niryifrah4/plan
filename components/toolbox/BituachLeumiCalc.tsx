"use client";

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";
import { bituachLeumiEstimate, OLD_AGE_ALLOWANCE_DEFAULTS } from "@/lib/assumptions";

export function BituachLeumiCalc() {
  const [monthlyGross, setMonthlyGross] = useState(28500);
  const [age, setAge] = useState(42);
  const [childrenUnder18, setChildrenUnder18] = useState(2);

  const bl = useMemo(() => bituachLeumiEstimate(monthlyGross), [monthlyGross]);

  // Simplified rights estimation
  const retirementAge = 67;
  const yearsToRetirement = Math.max(0, retirementAge - age);
  const estimatedPensionBase = OLD_AGE_ALLOWANCE_DEFAULTS.single; // ₪1,795/חודש (2026)
  const seniorityBonus = Math.min(50, Math.max(0, (age - 22) * 2)); // 2% per insurance year, max 50%
  const estimatedMonthly = estimatedPensionBase * (1 + seniorityBonus / 100);

  // Child allowance — official 2026 (btl.gov.il/About/news/Pages/hadasaidkonkitzva2026.aspx):
  //   child #1     → ₪173
  //   children #2-4 → ₪219 each
  //   child #5+    → ₪173 each
  // Previous code used a flat ₪212/child which over-stated 2-kid families and
  // under-stated 5+. Stays an estimate (BTL applies adjustments per case).
  const childAllowance = (() => {
    if (childrenUnder18 <= 0) return 0;
    if (childrenUnder18 === 1) return 173;
    const fives = Math.max(0, childrenUnder18 - 4);
    const middle = Math.min(3, childrenUnder18 - 1); // kids 2,3,4
    return 173 + middle * 219 + fives * 173;
  })();

  return (
    <div className="space-y-6">
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-verdant-emerald">shield</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">זכויות בביטוח לאומי</h3>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-verdant-muted">
          אומדן בסיסי של תשלומים וזכויות. הנתונים הם אומדנים בלבד — לחישוב מדויק פנו לביטוח לאומי.
        </p>

        <div className="mb-5 grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              ברוטו חודשי
            </label>
            <div
              className="flex items-center rounded-lg border px-3 py-2"
              style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            >
              <input
                type="number"
                value={monthlyGross}
                onChange={(e) => setMonthlyGross(Number(e.target.value))}
                className="tabular flex-1 bg-transparent text-sm font-bold text-verdant-ink outline-none"
                dir="ltr"
              />
              <span className="text-xs font-bold text-verdant-muted">₪</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              גיל
            </label>
            <div
              className="flex items-center rounded-lg border px-3 py-2"
              style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            >
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="tabular flex-1 bg-transparent text-sm font-bold text-verdant-ink outline-none"
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              ילדים מתחת 18
            </label>
            <div
              className="flex items-center rounded-lg border px-3 py-2"
              style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            >
              <input
                type="number"
                value={childrenUnder18}
                onChange={(e) => setChildrenUnder18(Number(e.target.value))}
                className="tabular flex-1 bg-transparent text-sm font-bold text-verdant-ink outline-none"
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Payments card */}
      <div className="card-pad">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[16px] text-verdant-emerald">
            payments
          </span>
          תשלומים
        </h4>
        <div className="space-y-2 rounded-xl p-4" style={{ background: "#FAFAF7" }}>
          <Row label="דמי ביטוח לאומי חודשי" value={fmtILS(bl.monthly)} />
          <Row label="דמי ביטוח לאומי שנתי" value={fmtILS(bl.annual)} />
        </div>
      </div>

      {/* Rights card */}
      <div className="card-pad">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[16px] text-verdant-emerald">
            verified
          </span>
          זכויות (אומדן)
        </h4>
        <div className="space-y-3 rounded-xl p-4" style={{ background: "#FAFAF7" }}>
          <div className="flex items-start gap-3 rounded-lg p-2" style={{ background: "#FFFFFF" }}>
            <span
              className="material-symbols-outlined mt-0.5 text-[18px]"
              style={{ color: "#2C7A5A" }}
            >
              elderly
            </span>
            <div className="flex-1">
              <div className="text-xs font-extrabold text-verdant-ink">קצבת זקנה</div>
              <div className="mt-0.5 text-[10px] text-verdant-muted">
                מגיל {retirementAge} · בעוד {yearsToRetirement} שנים
              </div>
              <div className="tabular mt-1 text-sm font-extrabold" style={{ color: "#2C7A5A" }}>
                ~{fmtILS(estimatedMonthly)}/חודש
              </div>
              <div className="text-[9px] text-verdant-muted">כולל תוספת ותק {seniorityBonus}%</div>
            </div>
          </div>

          {childrenUnder18 > 0 && (
            <div className="flex items-start gap-3 rounded-lg p-2" style={{ background: "#FFFFFF" }}>
              <span
                className="material-symbols-outlined mt-0.5 text-[18px]"
                style={{ color: "#059669" }}
              >
                child_care
              </span>
              <div className="flex-1">
                <div className="text-xs font-extrabold text-verdant-ink">קצבת ילדים</div>
                <div className="mt-0.5 text-[10px] text-verdant-muted">{childrenUnder18} ילדים</div>
                <div className="tabular mt-1 text-sm font-extrabold" style={{ color: "#059669" }}>
                  ~{fmtILS(childAllowance)}/חודש
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-lg p-2" style={{ background: "#FFFFFF" }}>
            <span
              className="material-symbols-outlined mt-0.5 text-[18px]"
              style={{ color: "#D97706" }}
            >
              healing
            </span>
            <div className="flex-1">
              <div className="text-xs font-extrabold text-verdant-ink">דמי מחלה</div>
              <div className="mt-0.5 text-[10px] text-verdant-muted">
                לפי חוק — מהיום ה-4, 50%-100% מהשכר
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg p-2" style={{ background: "#FFFFFF" }}>
            <span
              className="material-symbols-outlined mt-0.5 text-[18px]"
              style={{ color: "#2563EB" }}
            >
              work_off
            </span>
            <div className="flex-1">
              <div className="text-xs font-extrabold text-verdant-ink">דמי אבטלה</div>
              <div className="mt-0.5 text-[10px] text-verdant-muted">
                עד {Math.min(175, Math.max(50, age > 35 ? 175 : 138))} ימים · ~
                {fmtILS(Math.min(monthlyGross * 0.8, 15000))}/חודש
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-verdant-muted">{label}</span>
      <span className="tabular text-xs font-bold text-verdant-ink">{value}</span>
    </div>
  );
}
