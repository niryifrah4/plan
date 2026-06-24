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
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";
import { useConfirm } from "@/components/ui/ConfirmModal";

const SPOUSE1_FIELD_KEYS = [
  "p1_name",
  "p1_id",
  "p1_dob",
  "p1_phone",
  "p1_email",
  "p1_address_street",
  "p1_address_city",
  "p1_address_present",
  "p1_emp_type",
  "p1_employer",
  "p1_role",
  "p1_tenure",
];

const SPOUSE2_FIELD_KEYS = [
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
];

const FAMILY_STRUCTURES = [
  { value: "single", label: "רווק/ה או יחיד/ה" },
  { value: "couple", label: "זוג ללא ילדים" },
  { value: "family_with_children", label: "משפחה עם ילדים" },
];

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
  const { confirm, modal } = useConfirm();
  const selectedFamilyStructure = fields.family_structure || "";
  const hasSpouse1Data = Boolean(
    fields.p1_name ||
      fields.p1_id ||
      fields.p1_dob ||
      fields.p1_phone ||
      fields.p1_email ||
      fields.p1_address_street ||
      fields.p1_address_city ||
      fields.p1_emp_type ||
      fields.p1_employer ||
      fields.p1_role ||
      fields.p1_tenure
  );
  const hasSpouse2Data = Boolean(
    fields.p2_present === "1" ||
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
  const spouseSectionVisible =
    selectedFamilyStructure === "couple" ||
    selectedFamilyStructure === "family_with_children";

  const showSpouse2 = () => {
    setField("p2_present", "1");
  };
  const hideSpouse2 = async () => {
    if (hasSpouse2Data) {
      const ok = await confirm({
        title: "הסרת בן/בת זוג",
        body: "פעולה זו תמחק את כל פרטי בן/בת זוג 2 שהזנת. האם להמשיך?",
        variant: "danger",
        confirmLabel: "כן, מחק/י",
        cancelLabel: "ביטול",
      });
      if (!ok) return;
    }
    SPOUSE2_FIELD_KEYS.forEach((k) => setField(k, ""));
  };
  const hasChildrenData = children.some(
    (c) => c.name || c.birthYear || c.is_special_needs === "1"
  );
  const setFamilyStructure = async (value: string) => {
    if (value === selectedFamilyStructure) return;

    // Switching to single clears all spouses + children. If any spouse data
    // or children exist, ask for explicit confirmation first (RTL modal).
    if (value === "single" && (hasSpouse1Data || hasSpouse2Data || hasChildrenData)) {
      const what = [
        hasSpouse1Data || hasSpouse2Data ? "פרטי בן/בת הזוג" : "",
        hasChildrenData ? "פרטי הילדים" : "",
      ]
        .filter(Boolean)
        .join(" ו");
      const ok = await confirm({
        title: "מעבר לתיק של רווק/ה",
        body: `סימנת ״רווק/ה או יחיד/ה״. פעולה זו תמחק את ${what} שהזנת. האם להמשיך?`,
        variant: "danger",
        confirmLabel: "כן, מחק/י",
        cancelLabel: "ביטול",
      });
      if (!ok) return;
    }

    // Switching to couple keeps spouse 1 but drops the children.
    if (value === "couple" && hasChildrenData) {
      const ok = await confirm({
        title: "מעבר לזוג ללא ילדים",
        body: "פעולה זו תמחק את פרטי הילדים שהזנת. האם להמשיך?",
        variant: "danger",
        confirmLabel: "כן, מחק/י",
        cancelLabel: "ביטול",
      });
      if (!ok) return;
    }

    setField("family_structure", value);
    if (value === "single") {
      SPOUSE1_FIELD_KEYS.forEach((k) => setField(k, ""));
      SPOUSE2_FIELD_KEYS.forEach((k) => setField(k, ""));
      setField("has_children", "0");
      setChildren(() => []);
    }
    if (value === "couple") {
      setField("has_children", "0");
      setChildren(() => []);
    }
    if (value === "family_with_children" && children.length === 0) {
      setField("has_children", "1");
      setChildren(() => [{ ...EMPTY_CHILD }]);
    }
  };

  return (
    <StepCard num={1} title="פרופיל משפחתי ואישי" icon="people">
      {modal}
      <div className="mb-6 rounded-xl border border-verdant-line bg-[#FAFAF7] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            family_restroom
          </span>
          מבנה התיק
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {FAMILY_STRUCTURES.map((option) => {
            const active = selectedFamilyStructure === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFamilyStructure(option.value)}
                className={`rounded-lg border px-3 py-3 text-right text-[12px] font-extrabold transition-all ${
                  active
                    ? "border-verdant-emerald bg-verdant-emerald text-white shadow-sm"
                    : "border-gray-200 bg-white text-verdant-ink hover:bg-gray-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-verdant-muted">
          הבחירה כאן קובעת אם האפיון מציג בן/בת זוג שניים וילדים. במקרה של לקוח/ה יחיד/ה,
          המערכת לא תניח שיש 2 בני משפחה.
        </div>
      </div>

      {spouseSectionVisible && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                people
              </span>
              פרטי בני הזוג
            </h3>
            {!hasSpouse2Data ? (
              <button
                type="button"
                onClick={showSpouse2}
                className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-verdant-ink shadow-sm transition-colors hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                הוסף בן/בת זוג 2
              </button>
            ) : (
              <button
                type="button"
                onClick={() => hideSpouse2()}
                className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-500 shadow-sm transition-colors hover:bg-red-50"
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
            {hasSpouse2Data && (
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
      )}
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Fld
          label="כתובת משפחתית משותפת"
          name="address"
          fields={fields}
          onChange={setField}
          placeholder="רחוב ומספר"
        />
        <CityAutocomplete
          label="עיר"
          value={fields.city || ""}
          onChange={(val) => setField("city", val)}
        />
        <FldSelect
          label="מצב משפחתי"
          name="marital"
          fields={fields}
          onChange={setField}
          options={["רווק/ה", "נשואים", "ידועים בציבור", "פרודים", "גרושים", "אלמן/ה"]}
        />
      </div>
      <div className="mb-6 text-[11px] leading-relaxed text-verdant-muted">
        הכתובת המשותפת משמשת כברירת מחדל. אם לבן/בת זוג יש כתובת אישית, אפשר להגדיר אותה
        בתוך הכרטיס שלו/שלה.
      </div>

      {selectedFamilyStructure === "family_with_children" && (
        <ChildrenSection fields={fields} setField={setField} children={children} setChildren={setChildren} />
      )}

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
  onRemove?: () => Promise<void> | void;
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
            className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-500 shadow-sm transition-colors hover:bg-red-50"
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
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-verdant-ink shadow-sm transition-colors hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              יש כתובת משלו/שלה
            </button>
          ) : (
            <button
              type="button"
              onClick={hideSpouseAddress}
              className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-500 shadow-sm transition-colors hover:bg-red-50"
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
            <CityAutocomplete
              label="עיר"
              value={fields[`${prefix}_address_city`] || ""}
              onChange={(val) => setField(`${prefix}_address_city`, val)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] leading-relaxed text-verdant-muted">
            {sharedAddress ? (
              `כרגע משתמשים בכתובת המשותפת: ${sharedAddress}`
            ) : (
              <>
                <span>לא הוזנה כתובת משותפת.</span>
                <button
                  type="button"
                  onClick={() => {
                    const inputs = Array.from(document.querySelectorAll('input'));
                    const sharedInput = inputs.find((i) => i.placeholder === 'רחוב ומספר');
                    if (sharedInput) {
                      sharedInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setTimeout(() => sharedInput.focus(), 300);
                    }
                  }}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold text-verdant-ink shadow-sm transition-colors hover:bg-gray-50"
                >
                  להזנת כתובת משותפת
                </button>
              </>
            )}
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
  const hasChildren = fields.has_children;
  const isYes = hasChildren === "1";
  const isNo = hasChildren !== "1";

  const { confirm, modal } = useConfirm();

  const setHasKids = async (val: "1" | "0") => {
    if (val === "0") {
      const hasData = children.some((c) => c.name || c.birthYear || c.is_special_needs === "1");
      if (hasData) {
        const ok = await confirm({
          title: "מחיקת פרטי הילדים",
          body: "פעולה זו תמחק את כל פרטי הילדים שהזנת. האם להמשיך?",
          variant: "danger",
          confirmLabel: "מחיקה",
          cancelLabel: "ביטול",
        });
        if (!ok) return;
      }
      setField("has_children", "0");
      setChildren(() => []);
      // If family structure is "family_with_children" and user says no kids, downgrade to "couple"
      if (fields.family_structure === "family_with_children") {
        setField("family_structure", "couple");
      }
    } else {
      setField("has_children", "1");
      if (children.length === 0) {
        setChildren(() => [{ ...EMPTY_CHILD }]);
      }
    }
  };

  return (
    <div className="mb-6">
      {modal}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            child_care
          </span>
          ילדים
        </h3>
        {isYes && (
          <button
            type="button"
            onClick={() => setChildren((p) => [...p, { ...EMPTY_CHILD }])}
            className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-verdant-ink shadow-sm transition-colors hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>הוסף ילד/ה
          </button>
        )}
      </div>

      <div className="v-divider mb-4 flex items-center justify-between rounded-lg border bg-[#FAFAF7] p-4 shadow-sm">
        <div className="text-[12px] font-extrabold text-verdant-ink">האם יש לכם ילדים?</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHasKids("1")}
            className={`rounded-md px-4 py-1.5 text-[11px] font-bold transition-all ${
              isYes
                ? "bg-verdant-emerald text-white shadow-md hover:bg-emerald-700"
                : "border border-gray-200 bg-white text-verdant-ink hover:bg-gray-50"
            }`}
          >
            כן
          </button>
          <button
            type="button"
            onClick={() => setHasKids("0")}
            className={`rounded-md px-4 py-1.5 text-[11px] font-bold transition-all ${
              isNo
                ? "bg-verdant-emerald text-white shadow-md hover:bg-emerald-700"
                : "border border-gray-200 bg-white text-verdant-ink hover:bg-gray-50"
            }`}
          >
            לא
          </button>
        </div>
      </div>

      {isYes && (
        <div className="space-y-3">
          {children.length === 0 && (
            <div className="text-[11px] text-verdant-muted">
              אין ילדים ברשימה. לחצו על ״הוסף ילד/ה״ כדי להוסיף.
            </div>
          )}
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
              onRemove={async () => {
                const hasData = c.name || c.birthYear || c.is_special_needs === "1";
                if (hasData) {
                  const ok = await confirm({
                    title: "מחיקת פרטי ילד/ה",
                    body: `פעולה זו תמחק את פרטי הילד/ה ${c.name ? `"${c.name}"` : "שהזנת"}. האם להמשיך?`,
                    variant: "danger",
                    confirmLabel: "מחיקה",
                    cancelLabel: "ביטול",
                  });
                  if (!ok) return;
                }
                
                // If it's the last child being removed, set 'has_children' to '0'
                if (children.length <= 1) {
                  setField("has_children", "0");
                }
                setChildren((p) => p.filter((_, j) => j !== i));
              }}
            />
          ))}
        </div>
      )}
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
        <span className="text-[12px] font-extrabold text-verdant-ink">
          {c.name || `ילד/ה ${index + 1}`}
          {c.age && <span className="mr-2 font-bold text-verdant-muted">(גיל {c.age})</span>}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-500 shadow-sm transition-colors hover:bg-red-50"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>הסר
        </button>
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
      <div className="mb-2 flex items-center justify-start gap-1.5 text-[10px] font-extrabold text-verdant-ink">
        <span className="material-symbols-outlined text-[14px] text-verdant-emerald">savings</span>
        <span>חיסכון לכל ילד</span>
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
  steps,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  steps?: number[];
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
          steps={steps}
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
