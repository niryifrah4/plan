/**
 * Step 5 — Pension + retirement plan.
 *
 * The actual pension balance + fees come from the מסלקה upload on the
 * pension page (authoritative source). Here we only capture the user's
 * retirement preferences:
 *   • desired retirement age
 *   • desired monthly income at retirement
 *   • risk tolerance (maps to assumptions.riskTolerance via sync)
 */

import type { Fields } from "./types";
import { Fld, FldSelect, StepCard } from "./fields";

export function Step5Retirement({
  fields,
  setField,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
}) {
  return (
    <StepCard num={5} title="פנסיה ופרישה" icon="elderly">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
        <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
          beach_access
        </span>
        תכנון פרישה
      </h3>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Fld
          label="גיל פרישה רצוי"
          name="retire_age"
          fields={fields}
          onChange={setField}
          type="number"
          placeholder="67"
        />
        <Fld
          label="הכנסה חודשית רצויה בפרישה (₪)"
          name="retire_income"
          fields={fields}
          onChange={setField}
          type="number"
        />
        <FldSelect
          label="מוכנות לסיכון בתיק פנסיוני"
          name="pension_risk"
          fields={fields}
          onChange={setField}
          options={["שמרני מאוד", "שמרני", "מאוזן", "צמיחה", "אגרסיבי"]}
        />
      </div>

      <div
        className="mb-4 flex items-start gap-2 rounded-xl p-3"
        style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
      >
        <span className="material-symbols-outlined mt-0.5 text-[18px] text-verdant-emerald">
          info
        </span>
        <div className="text-[12px] leading-relaxed text-verdant-ink">
          פנסיה נטענת מהמסלקה.
        </div>
      </div>
    </StepCard>
  );
}
