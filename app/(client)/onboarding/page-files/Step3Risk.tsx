/**
 * Step 3 — Risk management + legal docs.
 *
 * Insurance: 4 default coverages (life, health, nursing, disability) plus
 * any custom rows. "כן" answers map to /risk-store as `covered`; "לא"
 * stays as gaps the advisor can plan around. Custom rows are removable.
 *
 * Legal: 4 dropdown questions (beneficiaries, will, prenup, POA) feed
 * directly into the same risk store via onboarding-sync.
 */

import type { Fields, InsRow } from "./types";
import { FldSelect, ModalNumberInput, StepCard } from "./fields";

export function Step3Risk({
  fields,
  setField,
  insurance,
  setInsurance,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
  insurance: InsRow[];
  setInsurance: (updater: (prev: InsRow[]) => InsRow[]) => void;
}) {
  return (
    <StepCard num={3} title="ניהול סיכונים ומשפט" icon="health_and_safety">
      <InsuranceTable insurance={insurance} setInsurance={setInsurance} />
      <LegalDocs fields={fields} setField={setField} />
    </StepCard>
  );
}

function InsuranceTable({
  insurance,
  setInsurance,
}: {
  insurance: InsRow[];
  setInsurance: (updater: (prev: InsRow[]) => InsRow[]) => void;
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            health_and_safety
          </span>
          כיסויים ביטוחיים
        </h3>
        <button
          type="button"
          onClick={() =>
            setInsurance((p) => {
              // Insert the new row right after the LAST occurrence of the
              // same type so related coverages stay grouped. New custom
              // rows default to "ביטוח חיים" so a new life-insurance entry
              // lands next to the existing one.
              const newRow: InsRow = {
                type: "ביטוח חיים",
                has: "",
                company: "",
                coverage: "",
                premium: "",
                for: "",
                isCustom: "1",
              };
              const lastIdx = (() => {
                for (let i = p.length - 1; i >= 0; i--) {
                  if (p[i].type === newRow.type) return i;
                }
                return p.length - 1;
              })();
              return [...p.slice(0, lastIdx + 1), newRow, ...p.slice(lastIdx + 1)];
            })
          }
          className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>הוסף ביטוח
        </button>
      </div>
      <div className="card mb-6 overflow-hidden" style={{ borderRadius: 8 }}>
        <table className="w-full text-sm">
          <thead className="v-divider border-b" style={{ background: "#FFFFFF" }}>
            <tr className="text-right">
              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                סוג כיסוי
              </th>
              <th className="w-24 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                עבור
              </th>
              <th className="w-28 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                קיים?
              </th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                חברה
              </th>
              <th className="w-32 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                סכום כיסוי
              </th>
              <th className="w-28 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                פרמיה חודשית
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="v-divider divide-y">
            {insurance.map((ins, i) => (
              <InsuranceRow
                key={i}
                row={ins}
                onUpdate={(patch) =>
                  setInsurance((p) =>
                    p.map((x, j) => (j === i ? { ...x, ...patch } : x))
                  )
                }
                onRemove={() => setInsurance((p) => p.filter((_, j) => j !== i))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InsuranceRow({
  row: ins,
  onUpdate,
  onRemove,
}: {
  row: InsRow;
  onUpdate: (patch: Partial<InsRow>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="h-[30px]">
      {ins.isCustom === "1" ? (
        <td className="px-2">
          <select
            className="inp"
            value={ins.type}
            onChange={(e) => onUpdate({ type: e.target.value })}
          >
            <option>ביטוח חיים</option>
            <option>בריאות</option>
            <option>סיעוד</option>
            <option>אובדן כושר עבודה</option>
            <option>ביטוח אחר</option>
          </select>
        </td>
      ) : (
        <td className="px-3 text-xs font-bold text-verdant-ink">{ins.type}</td>
      )}
      <td className="px-2">
        <input
          className="inp"
          value={ins.for || ""}
          onChange={(e) => onUpdate({ for: e.target.value })}
          placeholder="בן זוג / שם"
        />
      </td>
      <td className="px-2">
        <select
          className="inp"
          value={ins.has}
          onChange={(e) => onUpdate({ has: e.target.value })}
        >
          <option value="">—</option>
          <option>כן</option>
          <option>לא</option>
          <option>לא יודע</option>
        </select>
      </td>
      <td className="px-2">
        <input
          className="inp"
          value={ins.company}
          onChange={(e) => onUpdate({ company: e.target.value })}
          placeholder="חברה"
        />
      </td>
      <td className="px-2">
        <ModalNumberInput
          value={ins.coverage}
          onChange={(v) => onUpdate({ coverage: v })}
          title={`עריכת סכום כיסוי - ${ins.type}`}
          placeholder="0"
          inputClassName="inp tabular"
          steps={[10000, 50000, 100000]}
        />
      </td>
      <td className="px-2">
        <ModalNumberInput
          value={ins.premium}
          onChange={(v) => onUpdate({ premium: v })}
          title={`עריכת פרמיה - ${ins.type}`}
          placeholder="0"
          inputClassName="inp tabular"
          steps={[10, 50, 100]}
        />
      </td>
      <td className="px-1">
        {ins.isCustom === "1" && (
          <button
            type="button"
            onClick={onRemove}
            className="text-verdant-muted transition-colors hover:text-red-600"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </td>
    </tr>
  );
}

function LegalDocs({
  fields,
  setField,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
}) {
  return (
    <>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
        <span className="material-symbols-outlined text-[18px] text-verdant-emerald">gavel</span>
        מדיניות משפטית
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FldSelect
          label="מוטבים בביטוחי חיים"
          name="beneficiaries"
          fields={fields}
          onChange={setField}
          options={["מעודכנים", "לא מעודכנים", "לא ידוע"]}
        />
        <FldSelect
          label="קיום צוואה"
          name="will"
          fields={fields}
          onChange={setField}
          options={["קיימת ומעודכנת", "קיימת ולא מעודכנת", "לא קיימת"]}
        />
        <FldSelect
          label="הסכם ממון"
          name="prenup"
          fields={fields}
          onChange={setField}
          options={["קיים", "לא קיים", "לא רלוונטי"]}
        />
        <FldSelect
          label="ייפוי כוח מתמשך"
          name="poa"
          fields={fields}
          onChange={setField}
          options={["קיים", "לא קיים"]}
        />
      </div>
    </>
  );
}
