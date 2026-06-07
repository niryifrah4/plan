/**
 * Step 2 — Financial picture.
 *
 * Sections:
 *   1. Income — dynamic list (label/value), feeds budget income lines
 *   2. Gross salary breakdown — optional, feeds salary-engine (tax/pension)
 *   3. Rent — for tenants only (owners flow through mortgage liability)
 *   4. Assets — type/desc/value; investment property gets a rental sub-form
 *   5. Liabilities — type/lender/balance/rate/monthly; mortgage rate locked
 *
 * Expenses intentionally NOT collected here — they come from real mapped
 * transactions in /budget. Asking the user to guess introduces fake data
 * that competes with the real cashflow.
 */

import type { AssetRow, Fields, IncomeRow, LiabRow } from "./types";
import { ASSET_TYPES, LIAB_TYPES, fmt, n } from "./constants";
import { DynTable, Fld, ModalNumberInput, StepCard } from "./fields";

export function Step2Finances({
  fields,
  setField,
  incomes,
  setIncomes,
  assets,
  setAssets,
  liabilities,
  setLiabilities,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
  incomes: IncomeRow[];
  setIncomes: (updater: (prev: IncomeRow[]) => IncomeRow[]) => void;
  assets: AssetRow[];
  setAssets: (updater: (prev: AssetRow[]) => AssetRow[]) => void;
  liabilities: LiabRow[];
  setLiabilities: (updater: (prev: LiabRow[]) => LiabRow[]) => void;
}) {
  const assetsTotal = assets.reduce((s, a) => s + n(a.value), 0);
  const liabTotal = liabilities.reduce((s, l) => s + n(l.balance), 0);

  return (
    <StepCard num={2} title="תמונה כספית" icon="payments">
      <IncomesList incomes={incomes} setIncomes={setIncomes} />
      <SalaryBreakdown fields={fields} setField={setField} />
      <ExpensesNote />
      <RentForRenters fields={fields} setField={setField} />
      <AssetsSection
        assets={assets}
        setAssets={setAssets}
        assetsTotal={assetsTotal}
      />
      <LiabilitiesSection
        liabilities={liabilities}
        setLiabilities={setLiabilities}
        liabTotal={liabTotal}
      />
    </StepCard>
  );
}

/* ── Income — dynamic list with running total ── */

function IncomesList({
  incomes,
  setIncomes,
}: {
  incomes: IncomeRow[];
  setIncomes: (updater: (prev: IncomeRow[]) => IncomeRow[]) => void;
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            payments
          </span>
          הכנסות חודשיות{" "}
          <span className="text-[10px] font-semibold text-verdant-muted">(₪)</span>
        </h3>
        <button
          type="button"
          onClick={() => setIncomes((p) => [...p, { label: "", value: "" }])}
          className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          הוסף הכנסה
        </button>
      </div>
      <div className="card mb-3 overflow-hidden" style={{ borderRadius: 8 }}>
        <ul className="v-divider divide-y">
          {incomes.map((row, i) => (
            <li
              key={i}
              className="flex items-center gap-2 px-3 py-2"
              style={{ background: i % 2 ? "#FAFAF7" : "#FFFFFF" }}
            >
              <input
                className="inp flex-1"
                value={row.label}
                onChange={(e) =>
                  setIncomes((p) =>
                    p.map((r, j) => (j === i ? { ...r, label: e.target.value } : r))
                  )
                }
                placeholder="תיאור ההכנסה (למשל: שכר, שכ״ד, הרצאות...)"
              />
              <ModalNumberInput
                value={row.value}
                onChange={(v) =>
                  setIncomes((p) =>
                    p.map((r, j) => (j === i ? { ...r, value: v } : r))
                  )
                }
                title={`עריכת הכנסה - ${row.label || "שורה"}`}
                placeholder="0"
                dir="ltr"
                inputClassName="inp tabular w-36 text-left"
              />
              <button
                type="button"
                onClick={() => setIncomes((p) => p.filter((_, j) => j !== i))}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-red-50"
                title="הסר שורה"
              >
                <span className="material-symbols-outlined text-[18px] text-verdant-muted hover:text-red-600">
                  close
                </span>
              </button>
            </li>
          ))}
          <li
            className="flex items-center justify-between border-t-2 px-3 py-2"
            style={{ background: "#FAFAF7", borderColor: "#E5E7EB" }}
          >
            <span className="text-[12px] font-bold text-verdant-ink">
              סה&quot;כ הכנסות חודשיות
            </span>
            <span
              className="tabular text-[13px] font-extrabold text-verdant-ink"
              dir="ltr"
            >
              {fmt(incomes.reduce((s, r) => s + n(r.value), 0))}
            </span>
          </li>
        </ul>
      </div>
    </>
  );
}

/* ── Salary breakdown (optional, feeds salary-engine) ── */

function SalaryBreakdown({
  fields,
  setField,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
}) {
  return (
    <details className="mb-4 rounded-xl border border-verdant-line bg-[#FFFFFF] p-3">
      <summary className="flex cursor-pointer select-none items-center gap-2 text-[11px] font-bold text-verdant-muted">
        <span className="material-symbols-outlined text-[14px]">tune</span>
        פירוט שכר ברוטו (אופציונלי — לדיוק חישובי המס)
        <span className="text-[10px] font-medium opacity-75">
          מופיע בתלוש — משמש לחישוב נטו, פנסיה וקה&quot;ש
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Fld
          label="ברוטו חודשי בן/בת זוג 1 (₪)"
          name="p1_gross"
          fields={fields}
          onChange={setField}
          type="number"
        />
        <Fld
          label="בונוס שנתי בן/בת זוג 1 (₪)"
          name="p1_annual_bonus"
          fields={fields}
          onChange={setField}
          type="number"
        />
        <Fld
          label="נקודות זיכוי בן/בת זוג 1"
          name="p1_credit_points"
          fields={fields}
          onChange={setField}
          type="number"
        />
        <Fld
          label="ברוטו חודשי בן/בת זוג 2 (₪)"
          name="p2_gross"
          fields={fields}
          onChange={setField}
          type="number"
        />
        <Fld
          label="בונוס שנתי בן/בת זוג 2 (₪)"
          name="p2_annual_bonus"
          fields={fields}
          onChange={setField}
          type="number"
        />
        <Fld
          label="נקודות זיכוי בן/בת זוג 2"
          name="p2_credit_points"
          fields={fields}
          onChange={setField}
          type="number"
        />
      </div>
      <div className="mt-2 text-[10px] leading-relaxed text-verdant-muted">
        ברירות מחדל: פנסיה 6% עובד / 6.5% מעסיק / 6% פיצויים · קה&quot;ש 2.5% / 7.5% · נקודות זיכוי
        2.25. נשמר בפרופיל השכר ומשפיע על דוחות התזרים והפרישה.
      </div>
    </details>
  );
}

function ExpensesNote() {
  return (
    <div
      className="mb-3 mt-6 flex items-start gap-2 rounded-xl p-3"
      style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
    >
      <span className="material-symbols-outlined mt-0.5 text-[18px] text-verdant-emerald">
        info
      </span>
      <div className="text-[12px] leading-relaxed text-verdant-ink">
        הכנסות מתעדים כאן. הוצאות נשאבות מתקציב.
      </div>
    </div>
  );
}

function RentForRenters({
  fields,
  setField,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
}) {
  return (
    <div className="mt-4 rounded-xl bg-[#FFFFFF] p-3" style={{ border: "1px solid #e5e9dc" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px] text-verdant-emerald">home</span>
        <h4 className="text-[13px] font-extrabold text-verdant-ink">שכר דירה (אם אתם שוכרים)</h4>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-verdant-muted">
        ממלאים רק אם אתם שוכרים. אם אתם בעלי הדירה — המשכנתא נקלטת אוטומטית מטבלת ההתחייבויות, ואין
        צורך למלא כאן.
      </p>
      <div className="max-w-[220px]">
        <Fld
          label="שכ״ד חודשי (₪)"
          name="exp_rent"
          fields={fields}
          onChange={setField}
          type="number"
          placeholder="0"
        />
      </div>
    </div>
  );
}

/* ── Assets — type/desc/value + investment-rental sub-form ── */

function AssetsSection({
  assets,
  setAssets,
  assetsTotal,
}: {
  assets: AssetRow[];
  setAssets: (updater: (prev: AssetRow[]) => AssetRow[]) => void;
  assetsTotal: number;
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            account_balance
          </span>
          נכסים
        </h3>
        <button
          type="button"
          onClick={() =>
            setAssets((p) => [
              ...p,
              { type: 'נדל"ן למגורים', desc: "", value: "", rent: "", rentExpenses: "" },
            ])
          }
          className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>הוסף נכס
        </button>
      </div>
      <DynTable
        headers={["סוג", "תיאור", "שווי נוכחי (₪)"]}
        rows={assets}
        onUpdate={(i, k, v) =>
          setAssets((p) => p.map((a, j) => (j === i ? { ...a, [k]: v } : a)))
        }
        onRemove={(i) => setAssets((p) => p.filter((_, j) => j !== i))}
        footer={
          <tr className="v-divider border-t" style={{ background: "#FAFAF7" }}>
            <td colSpan={2} className="px-3 py-2 text-xs font-bold text-verdant-ink">
              סה&quot;כ נכסים
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
                className="inp"
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

      {assets.some((a) => a.type === 'נדל"ן להשקעה') && (
        <InvestmentPropertyRentals assets={assets} setAssets={setAssets} />
      )}
    </div>
  );
}

function InvestmentPropertyRentals({
  assets,
  setAssets,
}: {
  assets: AssetRow[];
  setAssets: (updater: (prev: AssetRow[]) => AssetRow[]) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-verdant-muted">
        <span className="material-symbols-outlined text-[14px] text-verdant-emerald">
          home_work
        </span>
        פרטי שכירות — נכסים להשקעה
      </div>
      {assets.map((a, i) =>
        a.type !== 'נדל"ן להשקעה' ? null : (
          <div
            key={`rent-${i}`}
            className="rounded-xl p-3"
            style={{ background: "#FFFFFF", border: "1px solid #e5e9dc" }}
          >
            <div className="mb-2 text-[12px] font-extrabold text-verdant-ink">
              {a.desc || "נכס ללא שם"} {a.value ? `· ${fmt(Number(a.value))}` : ""}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                  שכ״ד חודשי (₪)
                </label>
                <ModalNumberInput
                  value={a.rent || ""}
                  onChange={(v) =>
                    setAssets((p) =>
                      p.map((x, j) => (j === i ? { ...x, rent: v } : x))
                    )
                  }
                  title={`עריכת שכ״ד - ${a.desc || "נכס"}`}
                  placeholder="0"
                  dir="ltr"
                  inputClassName="inp tabular"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                  הוצאות חודשיות (₪)
                </label>
                <ModalNumberInput
                  value={a.rentExpenses || ""}
                  onChange={(v) =>
                    setAssets((p) =>
                      p.map((x, j) =>
                        j === i ? { ...x, rentExpenses: v } : x
                      )
                    )
                  }
                  title={`עריכת הוצאות - ${a.desc || "נכס"}`}
                  placeholder="0"
                  dir="ltr"
                  inputClassName="inp tabular"
                />
              </div>
            </div>
            <div className="mt-2 text-[10px] text-verdant-muted">
              שכ״ד נטו ({fmt(Math.max(0, (Number(a.rent) || 0) - (Number(a.rentExpenses) || 0)))}/ח׳)
              ייכנס אוטומטית לתקציב כהכנסה.
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ── Liabilities — mortgage rate locked, taken from amortization PDF ── */

function LiabilitiesSection({
  liabilities,
  setLiabilities,
  liabTotal,
}: {
  liabilities: LiabRow[];
  setLiabilities: (updater: (prev: LiabRow[]) => LiabRow[]) => void;
  liabTotal: number;
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            credit_card
          </span>
          התחייבויות
        </h3>
        <button
          type="button"
          onClick={() =>
            setLiabilities((p) => [
              ...p,
              { type: "הלוואה בנקאית", lender: "", balance: "", rate: "", monthly: "" },
            ])
          }
          className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>הוסף הלוואה
        </button>
      </div>
      <DynTable
        headers={["סוג", "מלווה", "יתרה (₪)", "ריבית %", "החזר חודשי"]}
        rows={liabilities}
        onUpdate={(i, k, v) =>
          setLiabilities((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
        }
        onRemove={(i) => setLiabilities((p) => p.filter((_, j) => j !== i))}
        footer={
          <tr
            className="v-divider border-t"
            style={{ background: "rgba(248,113,113,0.08)" }}
          >
            <td colSpan={2} className="px-3 py-2 text-xs font-bold text-verdant-ink">
              סה&quot;כ התחייבויות
            </td>
            <td className="tabular px-3 py-2 text-sm font-extrabold text-verdant-ink">
              {fmt(liabTotal)}
            </td>
            <td colSpan={3} />
          </tr>
        }
        renderRow={(l, i, onUpdate) => (
          <>
            <td className="px-2">
              <select
                className="inp"
                value={l.type}
                onChange={(e) => onUpdate(i, "type", e.target.value)}
              >
                {LIAB_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </td>
            <td className="px-2">
              <input
                className="inp"
                value={l.lender}
                onChange={(e) => onUpdate(i, "lender", e.target.value)}
                placeholder="בנק/גוף"
              />
            </td>
            <td className="px-2">
              <ModalNumberInput
                value={l.balance}
                onChange={(v) => onUpdate(i, "balance", v)}
                title={`עריכת יתרה - ${l.lender || l.type}`}
                placeholder="0"
                dir="ltr"
                inputClassName="inp tabular"
              />
            </td>
            <td className="px-2">
              {l.type === "משכנתא" ? (
                <input
                  className="inp tabular"
                  disabled
                  value=""
                  placeholder="מלוח סילוקין"
                  title='במשכנתא יש בד"כ כמה מסלולים עם ריביות שונות. הריבית המדויקת תיטען מלוח הסילוקין שתעלה בדף "נדל״ן" — לכל נכס בנפרד.'
                  style={{ background: "#FAFAF7", color: "#6B7280", cursor: "help" }}
                />
              ) : (
                <ModalNumberInput
                  value={l.rate}
                  onChange={(v) => onUpdate(i, "rate", v)}
                  title={`עריכת ריבית - ${l.lender || l.type}`}
                  placeholder="0"
                  dir="ltr"
                  inputClassName="inp tabular"
                />
              )}
            </td>
            <td className="px-2">
              <ModalNumberInput
                value={l.monthly}
                onChange={(v) => onUpdate(i, "monthly", v)}
                title={`עריכת החזר חודשי - ${l.lender || l.type}`}
                placeholder="0"
                dir="ltr"
                inputClassName="inp tabular"
              />
            </td>
          </>
        )}
      />
      <div
        className="mt-3 flex items-start gap-2 rounded-xl p-3"
        style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
      >
        <span className="material-symbols-outlined mt-0.5 text-[18px] text-verdant-emerald">
          info
        </span>
        <div className="text-[12px] leading-relaxed text-verdant-ink">
          ריביות ומסלולים יילקחו מלוח הסילוקין בדף <b>נדל״ן</b>. כאן רק יתרה והחזר חודשי.
        </div>
      </div>
    </div>
  );
}
