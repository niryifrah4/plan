import { useState, useEffect } from "react";
import { scopedKey } from "@/lib/client-scope";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import type { Fields, AssetRow } from "@/app/(client)/onboarding/page-files/types";
import { Fld, ModalNumberInput, DynTable } from "@/app/(client)/onboarding/page-files/fields";
import { ASSET_TYPES, fmt } from "@/app/(client)/onboarding/page-files/constants";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { SaveStatus } from "@/components/ui/SaveStatus";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function EditAllocationModal({ onClose, onSaved }: Props) {
  const [fields, setFields] = useState<Fields>({});
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const { status, pulse } = useSaveStatus();

  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem(scopedKey("verdant:onboarding:fields")) || "{}");
      const a = JSON.parse(localStorage.getItem(scopedKey("verdant:onboarding:assets")) || "[]");
      setFields(f);
      setAssets(a);
    } catch {
      // ignore
    }
  }, []);

  const handleSave = () => {
    pulse();
    localStorage.setItem(scopedKey("verdant:onboarding:fields"), JSON.stringify(fields));
    localStorage.setItem(scopedKey("verdant:onboarding:assets"), JSON.stringify(assets));
    
    // Sync to all stores
    syncOnboardingToStores();
    
    // Dispatch a custom event specifically for the wealth tab to refresh
    window.dispatchEvent(new Event("verdant:onboarding_allocations_updated"));
    
    setTimeout(() => {
      onSaved();
      onClose();
    }, 600);
  };

  const setField = (name: string, value: string) => {
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  const assetsTotal = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="v-card max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-organic p-6 shadow-soft"
        style={{ background: "#FFFFFF" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between border-b pb-4 border-gray-100">
          <div>
            <h2 className="text-lg font-extrabold text-verdant-ink flex items-center gap-2">
              <span className="material-symbols-outlined text-verdant-emerald">tune</span>
              עריכת נכסים ויעדי אלוקציה (אפיון)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-verdant-muted">
              הנתונים שכאן הם אלו שהוזנו בשאלון האפיון. עריכתם כאן תשמור אותם למאגר המרכזי ותשפיע מידית על הגרפים והחישובים במערכת.
            </p>
          </div>
          <SaveStatus status={status} />
        </div>

        <div className="space-y-6">
          {/* Target Allocation */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">track_changes</span>
              הרכב יעד רצוי (אחוזים)
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 bg-[#FAFAF7] p-4 rounded-xl border border-gray-200">
              <Fld
                label="מניות (%)"
                name="target_equity"
                fields={fields}
                onChange={setField}
                type="number"
                placeholder="למשל 60"
              />
              <Fld
                label="אג״ח / סולידי (%)"
                name="target_bonds"
                fields={fields}
                onChange={setField}
                type="number"
                placeholder="למשל 20"
              />
              <Fld
                label="חשיפה למט״ח (%)"
                name="target_usd"
                fields={fields}
                onChange={setField}
                type="number"
                placeholder="למשל 50"
              />
              <Fld
                label="חשיפה לשקל (%)"
                name="target_ils"
                fields={fields}
                onChange={setField}
                type="number"
                placeholder="למשל 50"
              />
            </div>
            <p className="mt-2 text-[10px] text-verdant-muted">
              אחוזי היעד יוצגו ליד האחוזים בפועל במפת הנכסים כרפרנס אישי (לא חובה למלא).
            </p>
          </section>

          {/* Onboarding Assets */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
                <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                  account_balance
                </span>
                נכסי אפיון
              </h3>
              <button
                type="button"
                onClick={() =>
                  setAssets((p) => [
                    ...p,
                    { type: 'נדל"ן למגורים', desc: "", value: "", rent: "", rentExpenses: "" },
                  ])
                }
                className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-verdant-ink shadow-sm transition-colors hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>הוסף נכס
              </button>
            </div>

            <DynTable
              headers={["סוג", "תיאור", "שווי (₪)"]}
              rows={assets}
              onUpdate={(i, k, v) =>
                setAssets((p) => p.map((a, j) => (j === i ? { ...a, [k]: v } : a)))
              }
              onRemove={(i) => setAssets((p) => p.filter((_, j) => j !== i))}
              footer={
                <tr className="v-divider border-t" style={{ background: "#FAFAF7" }}>
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold text-verdant-ink">
                    סה"כ נכסים באפיון
                  </td>
                  <td className="tabular px-3 py-2 text-sm font-extrabold text-verdant-ink">
                    {fmt(assetsTotal)}
                  </td>
                  <td />
                </tr>
              }
              renderRow={(a, i, onUpdate) => (
                <>
                  <td className="px-2">
                    <select
                      className="inp w-32"
                      value={a.type}
                      onChange={(e) => onUpdate(i, "type", e.target.value)}
                    >
                      {ASSET_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2">
                    <input
                      className="inp"
                      value={a.desc}
                      onChange={(e) => onUpdate(i, "desc", e.target.value)}
                      placeholder="תיאור"
                    />
                  </td>
                  <td className="px-2">
                    <ModalNumberInput
                      value={a.value}
                      onChange={(v) => onUpdate(i, "value", v)}
                      title={`עריכת שווי נכס - ${a.desc || "נכס"}`}
                      placeholder="0"
                      dir="ltr"
                      inputClassName="inp tabular"
                    />
                  </td>
                </>
              )}
            />
          </section>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button type="button" onClick={handleSave} className="btn-botanical flex-1">
            שמור נתונים וסנכרן אפיון
          </button>
          <button type="button" onClick={onClose} className="btn-botanical-ghost">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
