/**
 * Step 1 — Family profile.
 *
 * Three sections:
 *   1. Couple details (name, ID, DOB, phone, email, shared address, optional
 *      personal address street + city per spouse, marital status)
 *   2. Children — name, DOB, gender, framework, special needs, kids-savings track
 *   3. Employment — type, employer, role, tenure for each spouse
 *
 * Children writes flow to two places:
 *   • verdant:onboarding:children (raw form data)
 *   • kids-savings-store (via syncOnboardingToStores)
 */

import {
  KIDS_TRACKS,
  KIDS_PROVIDERS,
  GOV_MONTHLY_DEPOSIT,
  PARENT_MONTHLY_MAX,
} from "@/lib/kids-savings-store";
import { fmtILS } from "@/lib/format";
import type { Child, Fields } from "./types";
import { EMPTY_CHILD, FRAMEWORKS } from "./constants";
import { Fld, FldSelect, ModalNumberInput, StepCard } from "./fields";

export function Step1Family({
  fields,
  setField,
  children,
  setChildren,
}: {
  fields: Fields;
  setField: (name: string, value: string) => void;
  children: Child[];
  setChildren: (updater: (prev: Child[]) => Child[]) => void;
}) {
  const spouse2Visible =
    fields.p2_present === "1" ||
    Boolean(
      fields.p2_name ||
        fields.p2_id ||
        fields.p2_dob ||
        fields.p2_phone ||
        fields.p2_email ||
        fields.p2_address_street ||
        fields.p2_address_city ||
        fields.p2_emp_type ||
        fields.p2_employer ||
        fields.p2_role ||
        fields.p2_tenure
    );

  const showSpouse2 = () => setField("p2_present", "1");
  const hideSpouse2 = () => {
    [
      "p2_name",
      "p2_id",
      "p2_dob",
      "p2_phone",
      "p2_email",
      "p2_address_street",
      "p2_address_city",
      "p2_address_present",
      "p2_emp_type",
      "p2_employer",
      "p2_role",
      "p2_tenure",
      "p2_present",
    ].forEach((k) => setField(k, ""));
  };

  const sharedAddress = fields.address || "";
  const spouseHasOwnAddress = (prefix: "p1" | "p2") =>
    fields[`${prefix}_address_present`] === "1" ||
    Boolean(fields[`${prefix}_address_street`] || fields[`${prefix}_address_city`]);
  const showSpouseAddress = (prefix: "p1" | "p2") => setField(`${prefix}_address_present`, "1");
  const hideSpouseAddress = (prefix: "p1" | "p2") => {
    setField(`${prefix}_address_street`, "");
    setField(`${prefix}_address_city`, "");
    setField(`${prefix}_address_present`, "");
  };

  return (
    <StepCard num={1} title="פרופיל משפחתי ואישי" icon="people">
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
              people
            </span>
            פרטי בני הזוג
          </h3>
          {!spouse2Visible ? (
            <button
              type="button"
              onClick={showSpouse2}
              className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              הוסף בן/בת זוג
            </button>
          ) : (
            <button
              type="button"
              onClick={hideSpouse2}
              className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-600"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              הסר בן/בת זוג 2
            </button>
          )}
        </div>

        <div className="space-y-4">
          <SpouseCard
            prefix="p1"
            label="בן/בת זוג 1"
            fields={fields}
            setField={setField}
            accent="primary"
          />
          {spouse2Visible && (
            <SpouseCard
              prefix="p2"
              label="בן/בת זוג 2"
              fields={fields}
              setField={setField}
              accent="secondary"
              onRemove={hideSpouse2}
            />
          )}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Fld
          label="כתובת משפחתית משותפת"
          name="address"
          fields={fields}
          onChange={setField}
          placeholder="רחוב ומספר"
        />
        <Fld label="עיר" name="city" fields={fields} onChange={setField} />
        <FldSelect
          label="מצב משפחתי"
          name="marital"
          fields={fields}
          onChange={setField}
          options={["נשואים", "ידועים בציבור", "פרודים", "גרושים", "אלמן/ה"]}
        />
      </div>
      <div className="mb-6 text-[11px] leading-relaxed text-verdant-muted">
        הכתובת המשותפת משמשת כברירת מחדל. אם לבן/בת זוג יש כתובת אישית, אפשר להגדיר אותה
        בתוך הכרטיס שלו/שלה.
      </div>

      <ChildrenSection children={children} setChildren={setChildren} />

    </StepCard>
  );
}

/* ── Spouse + employment helpers ── */

function SpouseCard({
  prefix,
  label,
  fields,
  setField,
  accent,
  onRemove,
}: {
  prefix: "p1" | "p2";
  label: string;
  fields: Fields;
  setField: (name: string, value: string) => void;
  accent: "primary" | "secondary";
  onRemove?: () => void;
}) {
  const sharedAddress = fields.address || "";
  const spouseHasOwnAddress = () =>
    fields[`${prefix}_address_present`] === "1" ||
    Boolean(fields[`${prefix}_address_street`] || fields[`${prefix}_address_city`]);
  const showSpouseAddress = () => setField(`${prefix}_address_present`, "1");
  const hideSpouseAddress = () => {
    setField(`${prefix}_address_street`, "");
    setField(`${prefix}_address_city`, "");
    setField(`${prefix}_address_present`, "");
  };

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: accent === "primary" ? "#D7E5DC" : "#E5E7EB",
        background: accent === "primary" ? "#F7FBF8" : "#FFFFFF",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="caption">{label}</div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-0.5 text-[11px] font-bold text-red-400 hover:text-red-600"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
            הסר
          </button>
        )}
      </div>
      <Fld label="שם מלא" name={`${prefix}_name`} fields={fields} onChange={setField} />
      <div className="grid grid-cols-2 gap-2">
        <Fld label="ת.ז" name={`${prefix}_id`} fields={fields} onChange={setField} dir="ltr" />
        <Fld
          label="תאריך לידה"
          name={`${prefix}_dob`}
          fields={fields}
          onChange={setField}
          type="date"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Fld
          label="טלפון"
          name={`${prefix}_phone`}
          fields={fields}
          onChange={setField}
          type="tel"
          dir="ltr"
        />
        <Fld
          label="אימייל"
          name={`${prefix}_email`}
          fields={fields}
          onChange={setField}
          type="email"
          dir="ltr"
        />
      </div>
      <div className="mt-3 rounded-xl border border-dashed border-verdant-line bg-white/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold text-verdant-ink">כתובת אישית</div>
          {!spouseHasOwnAddress() ? (
            <button
              type="button"
              onClick={showSpouseAddress}
              className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              יש כתובת משלו/שלה
            </button>
          ) : (
            <button
              type="button"
              onClick={hideSpouseAddress}
              className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-600"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              השתמש/י בכתובת המשותפת
            </button>
          )}
        </div>
        {spouseHasOwnAddress() ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Fld
              label="רחוב ומספר"
              name={`${prefix}_address_street`}
              fields={fields}
              onChange={setField}
              placeholder="רחוב ומספר"
            />
            <Fld
              label="עיר"
              name={`${prefix}_address_city`}
              fields={fields}
              onChange={setField}
            />
          </div>
        ) : (
          <div className="text-[11px] leading-relaxed text-verdant-muted">
            כרגע משתמשים בכתובת המשותפת: {sharedAddress ? sharedAddress : "לא הוזנה כתובת משותפת"}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-verdant-line bg-white/70 p-3">
        <h4 className="mb-3 flex items-center gap-2 text-[11px] font-bold text-verdant-ink">
          <span className="material-symbols-outlined text-[14px] text-verdant-emerald">work</span>
          תעסוקה
        </h4>
        <EmploymentFields prefix={prefix} fields={fields} setField={setField} />
      </div>
    </div>
  );
}

function EmploymentFields({
  prefix,
  fields,
  setField,
}: {
  prefix: "p1" | "p2";
  fields: Fields;
  setField: (name: string, value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FldSelect
        label="סוג תעסוקה"
        name={`${prefix}_emp_type`}
        fields={fields}
        onChange={setField}
        options={["שכיר/ה", "עצמאי/ת", "שכיר/ה + עצמאי/ת"]}
      />
      <Fld
        label="מעסיק / שם העסק"
        name={`${prefix}_employer`}
        fields={fields}
        onChange={setField}
      />
      <div className="grid grid-cols-2 gap-2">
        <Fld label="תפקיד" name={`${prefix}_role`} fields={fields} onChange={setField} />
        <Fld
          label="ותק (שנים)"
          name={`${prefix}_tenure`}
          fields={fields}
          onChange={setField}
          type="number"
        />
      </div>
    </div>
  );
}

/* ── Children — repeats with kids-savings sub-section ── */

function ChildrenSection({
  children,
  setChildren,
}: {
  children: Child[];
  setChildren: (updater: (prev: Child[]) => Child[]) => void;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            child_care
          </span>
          ילדים
        </h3>
        <button
          type="button"
          onClick={() => setChildren((p) => [...p, { ...EMPTY_CHILD }])}
          className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>הוסף ילד/ה
        </button>
      </div>
      <div className="space-y-3">
        {children.map((c, i) => (
          <ChildRow
            key={i}
            child={c}
            index={i}
            onUpdate={(k, v) =>
              setChildren((p) =>
                p.map((ch, j) => {
                  if (j !== i) return ch;
                  const updated = { ...ch, [k]: v };
                  if (k === "dob" && v) {
                    const birth = new Date(v);
                    const diff = Date.now() - birth.getTime();
                    const ageYears = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
                    updated.age = ageYears >= 0 ? String(ageYears) : "";
                  }
                  return updated;
                })
              )
            }
            onRemove={() => setChildren((p) => p.filter((_, j) => j !== i))}
          />
        ))}
      </div>
    </div>
  );
}

function ChildRow({
  child: c,
  index,
  onUpdate,
  onRemove,
}: {
  child: Child;
  index: number;
  onUpdate: (k: string, v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="v-divider rounded-lg border bg-[#FFFFFF] p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-0.5 text-[11px] font-bold text-red-400 hover:text-red-600"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>הסר
        </button>
        <span className="text-[12px] font-extrabold text-verdant-ink">
          {c.name || `ילד/ה ${index + 1}`}
          {c.age && <span className="mr-2 font-bold text-verdant-muted">(גיל {c.age})</span>}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <LabeledInput label="שם" value={c.name} onChange={(v) => onUpdate("name", v)} placeholder="שם הילד/ה" />
        <LabeledInput
          label="תאריך לידה"
          type="date"
          value={c.dob}
          onChange={(v) => onUpdate("dob", v)}
        />
        <LabeledSelect
          label="מין"
          value={c.gender}
          onChange={(v) => onUpdate("gender", v)}
          options={[
            { value: "male", label: "זכר" },
            { value: "female", label: "נקבה" },
          ]}
        />
        <LabeledSelect
          label="מסגרת"
          value={c.framework}
          onChange={(v) => onUpdate("framework", v)}
          options={FRAMEWORKS.map((f) => ({ value: f, label: f }))}
        />
        <LabeledInput
          label="צרכים מיוחדים"
          value={c.special}
          onChange={(v) => onUpdate("special", v)}
          placeholder="—"
        />
      </div>

      <KidsSavingsRow child={c} onUpdate={onUpdate} />
    </div>
  );
}

function KidsSavingsRow({
  child: c,
  onUpdate,
}: {
  child: Child;
  onUpdate: (k: string, v: string) => void;
}) {
  const parentDeposit = Number(c.savings_parent_deposit) || 0;
  const totalDeposit =
    parentDeposit > 0
      ? `ביט״ל ${fmtILS(GOV_MONTHLY_DEPOSIT)}/ח + הורים ${fmtILS(
          PARENT_MONTHLY_MAX
        )}/ח = ${fmtILS(GOV_MONTHLY_DEPOSIT + PARENT_MONTHLY_MAX)}/חודש`
      : `ביט״ל בלבד — ${fmtILS(GOV_MONTHLY_DEPOSIT)}/חודש`;

  return (
    <div className="v-divider border-t pt-3">
      <div className="mb-2 flex items-center justify-end gap-1.5 text-[10px] font-extrabold text-verdant-ink">
        <span>חיסכון לכל ילד</span>
        <span className="material-symbols-outlined text-[14px] text-verdant-emerald">savings</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <LabeledSelect
          label="בית השקעות"
          value={c.savings_provider}
          onChange={(v) => onUpdate("savings_provider", v)}
          options={KIDS_PROVIDERS.map((p) => ({ value: p, label: p }))}
          placeholder="בחר..."
        />
        <LabeledSelect
          label="מסלול"
          value={c.savings_track || "medium"}
          onChange={(v) => onUpdate("savings_track", v)}
          options={KIDS_TRACKS.map((t) => ({ value: t.key, label: t.label }))}
          noPlaceholder
        />
        <LabeledInput
          label="יתרה נוכחית ₪"
          type="number"
          value={c.savings_balance}
          onChange={(v) => onUpdate("savings_balance", v)}
          placeholder="0"
        />
        <div>
          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
            הורים מפקידים?
          </label>
          <div className="flex gap-1 rounded-xl p-0.5" style={{ background: "#E5E7EB" }}>
            <button
              type="button"
              onClick={() => onUpdate("savings_parent_deposit", String(PARENT_MONTHLY_MAX))}
              className="flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors"
              style={{
                background: parentDeposit > 0 ? "#059669" : "transparent",
                color: parentDeposit > 0 ? "#FFFFFF" : "#6B7280",
              }}
            >
              כן
            </button>
            <button
              type="button"
              onClick={() => onUpdate("savings_parent_deposit", "0")}
              className="flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors"
              style={{
                background: parentDeposit === 0 ? "#059669" : "transparent",
                color: parentDeposit === 0 ? "#FFFFFF" : "#6B7280",
              }}
            >
              לא
            </button>
          </div>
        </div>
      </div>
      <div className="mt-1.5 text-right text-[9px] text-verdant-muted">{totalDeposit}</div>
    </div>
  );
}

/* ── Small inline atoms (just for ChildRow's grid — they don't fit the
       Fld signature which is wired to the global `Fields` bag). ── */

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold text-verdant-muted">{label}</label>
      {type === "number" ? (
        <ModalNumberInput
          value={value}
          onChange={onChange}
          title={label}
          placeholder={placeholder}
          inputClassName="inp w-full tabular"
        />
      ) : (
        <input
          className="inp w-full"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  noPlaceholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  noPlaceholder?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold text-verdant-muted">{label}</label>
      <select
        className="inp w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!noPlaceholder && <option value="">{placeholder || "—"}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
