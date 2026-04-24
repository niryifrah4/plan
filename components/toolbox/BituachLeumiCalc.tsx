"use client";

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";
import { bituachLeumiEstimate } from "@/lib/assumptions";

export function BituachLeumiCalc() {
  const [monthlyGross, setMonthlyGross] = useState(28500);
  const [age, setAge] = useState(42);
  const [childrenUnder18, setChildrenUnder18] = useState(2);

  const bl = useMemo(() => bituachLeumiEstimate(monthlyGross), [monthlyGross]);

  // Simplified rights estimation
  const retirementAge = 67;
  const yearsToRetirement = Math.max(0, retirementAge - age);
  const estimatedPensionBase = 3000; // Base old-age allowance ~₪3,000/month (2025)
  const seniorityBonus = Math.min(50, Math.max(0, (age - 22) * 2)); // 2% per insurance year, max 50%
  const estimatedMonthly = estimatedPensionBase * (1 + seniorityBonus / 100);

  // Child allowance (2025 rates approximation)
  const childAllowance = childrenUnder18 * 188; // ~₪188 per child

  return (
    <div className="space-y-6">
      <div className="card-pad">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">shield</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">זכויות בביטוח לאומי</h3>
        </div>
        <p className="text-xs text-verdant-muted mb-5 leading-relaxed">
          אומדן בסיסי של תשלומים וזכויות. הנתונים הם אומדנים בלבד — לחישוב מדויק פנו לביטוח לאומי.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">ברוטו חודשי</label>
            <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={monthlyGross} onChange={e => setMonthlyGross(Number(e.target.value))}
                className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
              <span className="text-xs text-verdant-muted font-bold">₪</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">גיל</label>
            <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={age} onChange={e => setAge(Number(e.target.value))}
                className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">ילדים מתחת 18</label>
            <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={childrenUnder18} onChange={e => setChildrenUnder18(Number(e.target.value))}
                className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
            </div>
          </div>
        </div>
      </div>

      {/* Payments card */}
      <div className="card-pad">
        <h4 className="text-xs font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-verdant-emerald">payments</span>
          תשלומים
        </h4>
        <div className="rounded-xl p-4 space-y-2" style={{ background: "#f4f7ed" }}>
          <Row label="דמי ביטוח לאומי חודשי" value={fmtILS(bl.monthly)} />
          <Row label="דמי ביטוח לאומי שנתי" value={fmtILS(bl.annual)} />
        </div>
      </div>

      {/* Rights card */}
      <div className="card-pad">
        <h4 className="text-xs font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-verdant-emerald">verified</span>
          זכויות (אומדן)
        </h4>
        <div className="rounded-xl p-4 space-y-3" style={{ background: "#f4f7ed" }}>
          <div className="flex items-start gap-3 p-2 rounded-lg" style={{ background: "#fff" }}>
            <span className="material-symbols-outlined text-[18px] mt-0.5" style={{ color: "#1B4332" }}>elderly</span>
            <div className="flex-1">
              <div className="text-xs font-extrabold text-verdant-ink">קצבת זקנה</div>
              <div className="text-[10px] text-verdant-muted mt-0.5">מגיל {retirementAge} · בעוד {yearsToRetirement} שנים</div>
              <div className="text-sm font-extrabold tabular mt-1" style={{ color: "#1B4332" }}>~{fmtILS(estimatedMonthly)}/חודש</div>
              <div className="text-[9px] text-verdant-muted">כולל תוספת ותק {seniorityBonus}%</div>
            </div>
          </div>

          {childrenUnder18 > 0 && (
            <div className="flex items-start gap-3 p-2 rounded-lg" style={{ background: "#fff" }}>
              <span className="material-symbols-outlined text-[18px] mt-0.5" style={{ color: "#2B694D" }}>child_care</span>
              <div className="flex-1">
                <div className="text-xs font-extrabold text-verdant-ink">קצבת ילדים</div>
                <div className="text-[10px] text-verdant-muted mt-0.5">{childrenUnder18} ילדים</div>
                <div className="text-sm font-extrabold tabular mt-1" style={{ color: "#2B694D" }}>~{fmtILS(childAllowance)}/חודש</div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 p-2 rounded-lg" style={{ background: "#fff" }}>
            <span className="material-symbols-outlined text-[18px] mt-0.5" style={{ color: "#f59e0b" }}>healing</span>
            <div className="flex-1">
              <div className="text-xs font-extrabold text-verdant-ink">דמי מחלה</div>
              <div className="text-[10px] text-verdant-muted mt-0.5">לפי חוק — מהיום ה-4, 50%-100% מהשכר</div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2 rounded-lg" style={{ background: "#fff" }}>
            <span className="material-symbols-outlined text-[18px] mt-0.5" style={{ color: "#3b82f6" }}>work_off</span>
            <div className="flex-1">
              <div className="text-xs font-extrabold text-verdant-ink">דמי אבטלה</div>
              <div className="text-[10px] text-verdant-muted mt-0.5">עד {Math.min(175, Math.max(50, age > 35 ? 175 : 138))} ימים · ~{fmtILS(Math.min(monthlyGross * 0.8, 15000))}/חודש</div>
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
      <span className="text-xs font-bold text-verdant-ink tabular">{value}</span>
    </div>
  );
}
