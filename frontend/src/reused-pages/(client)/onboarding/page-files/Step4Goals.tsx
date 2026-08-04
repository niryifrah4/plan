/**
 * Step 4 — Vision + goals.
 *
 * Two sections:
 *   1. Three qualitative textareas — priorities / satisfaction / concerns
 *   2. Goals table — name, cost, horizon (years), priority (want/need/dream)
 *
 * Goals flow into the buckets store via syncOnboardingToStores. Once seeded,
 * the goals page owns the list (GOALS_SEEDED sentinel prevents re-creation).
 */

import type { Fields, GoalRow } from "./types";
import { DynTable, FldTextarea, ModalNumberInput, StepCard } from "./fields";

export function Step4Goals({
  fields,
  setField,
  goals,
  setGoals,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
  goals: GoalRow[];
  setGoals: (updater: (prev: GoalRow[]) => GoalRow[]) => void;
}) {
  return (
    <StepCard num={4} title="חזון, מטרות ויעדים" icon="flag">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
        <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
          psychology
        </span>
        שאלות איכותניות
      </h3>
      <div className="mb-6 space-y-3">
        <FldTextarea
          label="מה נמצא בראש סדר העדיפויות שלכם כמשפחה?"
          name="q_priorities"
          fields={fields}
          onChange={setField}
        />
        <FldTextarea
          label="מה יגרום לכם להרגיש סיפוק כלכלי?"
          name="q_satisfaction"
          fields={fields}
          onChange={setField}
        />
        <FldTextarea
          label="מה הכי מטריד אתכם כיום בהיבט הכלכלי?"
          name="q_concerns"
          fields={fields}
          onChange={setField}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">flag</span>
          טבלת יעדים
        </h3>
        <button
          type="button"
          onClick={() =>
            setGoals((p) => [...p, { name: "", cost: "", horizon: "", priority: "" }])
          }
          className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-verdant-ink shadow-sm transition-colors hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>הוסף יעד
        </button>
      </div>
      <DynTable
        headers={["יעד", "עלות (₪)", "אופק (שנים)", "חשיבות"]}
        rows={goals}
        onUpdate={(i, k, v) =>
          setGoals((p) => p.map((g, j) => (j === i ? { ...g, [k]: v } : g)))
        }
        onRemove={(i) => setGoals((p) => p.filter((_, j) => j !== i))}
        renderRow={(g, i, onUpdate) => (
          <>
            <td className="px-2">
              <input
                className="inp"
                value={g.name}
                onChange={(e) => onUpdate(i, "name", e.target.value)}
                placeholder="למשל: חתונה לבת"
              />
            </td>
            <td className="px-2">
              <ModalNumberInput
                value={g.cost}
                onChange={(v) => onUpdate(i, "cost", v)}
                title={`עריכת עלות - ${g.name || "יעד"}`}
                placeholder="0"
                inputClassName="inp tabular"
              />
            </td>
            <td className="px-2">
              <ModalNumberInput
                value={g.horizon}
                onChange={(v) => onUpdate(i, "horizon", v)}
                title={`עריכת אופק - ${g.name || "יעד"}`}
                placeholder="0"
                inputClassName="inp tabular"
                steps={[1, 5, 10]}
              />
            </td>
            <td className="px-3">
              <div className="flex gap-1">
                {(["want", "need", "dream"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onUpdate(i, "priority", v)}
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold transition-all ${
                      g.priority === v
                        ? v === "want"
                          ? "border-green-300 bg-green-50 text-green-700"
                          : v === "need"
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-verdant-line bg-[#FFFFFF] text-verdant-muted"
                    }`}
                  >
                    {v === "want" ? "רצון" : v === "need" ? "צורך" : "חלום"}
                  </button>
                ))}
              </div>
            </td>
          </>
        )}
      />
    </StepCard>
  );
}
