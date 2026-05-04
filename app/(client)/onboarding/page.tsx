"use client";

import { useState, useCallback, useEffect, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { usePersistedState } from "@/hooks/usePersistedState";
import { SaveIndicator } from "@/components/SaveIndicator";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import { pushOnboardingSnapshot, hydrateOnboardingFromRemote } from "@/lib/onboarding-remote";
import { notifyBusinessScopeChanged } from "@/lib/business-scope";
import { scopedKey } from "@/lib/client-scope";
import {
  KIDS_TRACKS,
  KIDS_PROVIDERS,
  GOV_MONTHLY_DEPOSIT,
  PARENT_MONTHLY_MAX,
} from "@/lib/kids-savings-store";
import { useClient } from "@/lib/client-context";

/* ===== Types ===== */
interface Child {
  [key: string]: string;
  name: string;
  dob: string;
  gender: string;
  age: string;
  framework: string;
  special: string;
  savings_provider: string;
  savings_track: string;
  savings_balance: string;
  savings_parent_deposit: string;
}
interface AssetRow {
  [key: string]: string;
  type: string;
  desc: string;
  value: string;
  /** Monthly gross rent (investment properties only). */
  rent: string;
  /** Monthly operating expenses — ועד בית, ניהול, ארנונה (non-mortgage). */
  rentExpenses: string;
}
interface LiabRow {
  [key: string]: string;
  type: string;
  lender: string;
  balance: string;
  rate: string;
  monthly: string;
}
interface InsRow {
  [key: string]: string | undefined;
  type: string;
  has: string;
  company: string;
  coverage: string;
  premium: string;
  for?: string;
  isCustom?: string;
}
interface GoalRow {
  [key: string]: string;
  name: string;
  cost: string;
  horizon: string;
  priority: string;
}
interface IncomeRow {
  [key: string]: string;
  label: string;
  value: string;
}
interface Fields {
  [key: string]: string;
}

/* Default income rows shown to every new client — can be edited or deleted.
   Note: "שכר" and "הכנסה מנכסים מניבים" are covered automatically by the
   salary profile and the real-estate store; values entered here are still
   useful for the snapshot but won't double-inject into the budget. The
   allowance rows below (קצבאות) feed straight into the budget as income. */
const INCOME_DEFAULTS: IncomeRow[] = [
  { label: "שכר בן/בת זוג 1 (נטו)", value: "" },
  { label: "שכר בן/בת זוג 2 (נטו)", value: "" },
  { label: "הכנסה מנכסים מניבים", value: "" },
  { label: "קצבת ילדים", value: "" },
  { label: "קצבת נכות / אחר מביטוח לאומי", value: "" },
  { label: "עזרה מההורים", value: "" },
];

const ASSET_TYPES = [
  'נדל"ן למגורים',
  'נדל"ן להשקעה',
  "רכב",
  "רכב יוקרה",
  "תיק השקעות",
  "פיקדון / חיסכון",
  "קופת גמל",
  "קרן השתלמות",
  "אחר",
];
const LIAB_TYPES = ["משכנתא", "הלוואה בנקאית", "הלוואה חוץ-בנקאית", "מסגרת אוברדרפט", "אחר"];
const FRAMEWORKS = ["גן", "יסודי", 'חט"ב', "תיכון", "אחרי צבא", "בוגר"];
const INS_DEFAULTS: InsRow[] = [
  { type: "ביטוח חיים", has: "", company: "", coverage: "", premium: "" },
  { type: "בריאות", has: "", company: "", coverage: "", premium: "" },
  { type: "סיעוד", has: "", company: "", coverage: "", premium: "" },
  { type: "אובדן כושר עבודה", has: "", company: "", coverage: "", premium: "" },
];

const n = (v: string) => Number(v) || 0;
const fmt = (v: number) => "₪" + Math.round(v).toLocaleString("he-IL");

export default function OnboardingPage() {
  const router = useRouter();

  /* ── Hydrate from Supabase BEFORE rendering the form ──
   * Prevents usePersistedState from initializing with a stale empty state
   * when the user re-opens the page on a different browser. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const wrote = await hydrateOnboardingFromRemote();
        if (!alive) return;
        // If we wrote new data, force a full remount so usePersistedState re-reads
        // from localStorage. Otherwise just proceed — local already matches.
        if (wrote) {
          // Re-render with remounted hooks; simplest approach: reload.
          window.location.reload();
          return;
        }
      } catch {}
      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ── Step navigation (5 steps) ── */
  const [step, setStep] = usePersistedState<number>("verdant:onboarding:step", 1);
  const TOTAL_STEPS = 5;
  const STEP_LABELS = [
    "פרופיל משפחתי",
    "תמונה כספית",
    "סיכונים ומשפט",
    "חזון ויעדים",
    "פנסיה ופרישה",
  ];

  /* ── Persisted state — auto-saves to localStorage (1.5s debounce) ── */
  const [fields, setFields, fieldsSaving] = usePersistedState<Fields>(
    "verdant:onboarding:fields",
    {},
    1500
  );
  const emptyChild: Child = {
    name: "",
    dob: "",
    gender: "",
    age: "",
    framework: "",
    special: "",
    savings_provider: "",
    savings_track: "medium",
    savings_balance: "",
    savings_parent_deposit: "57",
  };
  const [children, setChildren, childrenSaving] = usePersistedState<Child[]>(
    "verdant:onboarding:children",
    [emptyChild],
    1500
  );
  const [assets, setAssets, assetsSaving] = usePersistedState<AssetRow[]>(
    "verdant:onboarding:assets",
    [{ type: 'נדל"ן למגורים', desc: "", value: "", rent: "", rentExpenses: "" }],
    1500
  );
  const [liabilities, setLiabilities, liabSaving] = usePersistedState<LiabRow[]>(
    "verdant:onboarding:liabilities",
    [{ type: "משכנתא", lender: "", balance: "", rate: "", monthly: "" }],
    1500
  );
  const [insurance, setInsurance, insSaving] = usePersistedState<InsRow[]>(
    "verdant:onboarding:insurance",
    INS_DEFAULTS,
    1500
  );
  const [goals, setGoals, goalsSaving] = usePersistedState<GoalRow[]>(
    "verdant:onboarding:goals",
    [{ name: "", cost: "", horizon: "", priority: "" }],
    1500
  );
  const [incomes, setIncomes, incomesSaving] = usePersistedState<IncomeRow[]>(
    "verdant:onboarding:incomes",
    INCOME_DEFAULTS,
    1500
  );

  const isSaving =
    fieldsSaving ||
    childrenSaving ||
    assetsSaving ||
    liabSaving ||
    insSaving ||
    goalsSaving ||
    incomesSaving;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (isSaving) {
      setSaveStatus("saving");
    } else if (saveStatus === "saving") {
      setSaveStatus("saved");
      const t = setTimeout(() => setSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [isSaving, saveStatus]);

  /* ── Push to Supabase + cascade to all stores whenever saves settle ──
   * usePersistedState writes to the RAW key (no scope). The stores read from
   * the scoped key. So after each debounced save we:
   *   1. Copy every onboarding slice to its scoped key (what the sync reads).
   *   2. Fan out via syncOnboardingToStores → budget, properties, etc.
   *   3. Push a remote snapshot (Supabase).
   * Result: the client doesn't need to click "סיום" for data to flow —
   * navigating to /budget immediately shows allowances, rent, etc. */
  useEffect(() => {
    if (!hydrated) return;
    if (!isSaving) {
      try {
        localStorage.setItem(scopedKey("verdant:onboarding:fields"), JSON.stringify(fields));
        localStorage.setItem(scopedKey("verdant:onboarding:children"), JSON.stringify(children));
        localStorage.setItem(scopedKey("verdant:onboarding:assets"), JSON.stringify(assets));
        localStorage.setItem(
          scopedKey("verdant:onboarding:liabilities"),
          JSON.stringify(liabilities)
        );
        localStorage.setItem(scopedKey("verdant:onboarding:insurance"), JSON.stringify(insurance));
        localStorage.setItem(scopedKey("verdant:onboarding:goals"), JSON.stringify(goals));
        localStorage.setItem(scopedKey("verdant:onboarding:incomes"), JSON.stringify(incomes));
      } catch {}
      syncOnboardingToStores();
      pushOnboardingSnapshot();
    }
  }, [hydrated, isSaving, fields, children, assets, liabilities, insurance, goals, incomes]);

  /* ── One-shot migration: legacy inc_* fields → incomes[] list ──
   * Runs once per client after hydration. If the user already has any
   * non-zero income recorded in the old fixed-field model, we pull those
   * values into the new dynamic list. After migration, the inc_* keys
   * are cleared so the legacy sum logic in onboarding-sync stops firing. */
  const incomesMigratedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || incomesMigratedRef.current) return;
    const legacyKeys: [string, string][] = [
      ["inc_salary1", "שכר בן/בת זוג 1 (נטו)"],
      ["inc_salary2", "שכר בן/בת זוג 2 (נטו)"],
      ["inc_rental", "הכנסה מנכסים מניבים"],
      ["inc_pension", "קצבאות"],
      ["inc_parents", "עזרה מההורים"],
      ["inc_other", "אחר"],
    ];
    const hasLegacy = legacyKeys.some(([k]) => n(fields[k] || "0") > 0);
    const listIsDefault = incomes.every((r) => !r.value);
    if (hasLegacy && listIsDefault) {
      const migrated: IncomeRow[] = legacyKeys
        .filter(([k]) => n(fields[k] || "0") > 0)
        .map(([k, label]) => ({ label, value: fields[k] || "" }));
      if (migrated.length > 0) setIncomes(migrated);
      // Clear legacy keys so they don't double-count via onboarding-sync.
      setFields((p) => {
        const next = { ...p };
        legacyKeys.forEach(([k]) => delete next[k]);
        return next;
      });
    }
    incomesMigratedRef.current = true;
  }, [hydrated, fields, incomes, setIncomes, setFields]);

  /* ── Pre-fill primary contact from CRM client card ──
   * When the advisor converts a lead to a client, the lead's email/phone
   * are copied onto the client record. On first visit to the questionnaire,
   * seed p1_email / p1_phone so the advisor doesn't re-type them.
   * Only seeds empty fields — never overwrites user edits. Partner (p2) is
   * intentionally left blank; the advisor captures it during intake. */
  const { client } = useClient();
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!hydrated || prefilledRef.current || !client) return;
    const patch: Record<string, string> = {};
    if (!fields.p1_email && client.email) patch.p1_email = client.email;
    if (!fields.p1_phone && client.phone) patch.p1_phone = client.phone;
    if (!fields.p1_name && client.family) patch.p1_name = client.family;
    if (Object.keys(patch).length > 0) {
      setFields((p) => ({ ...p, ...patch }));
    }
    prefilledRef.current = true;
  }, [hydrated, client, fields.p1_email, fields.p1_phone, fields.p1_name, setFields]);

  const setField = useCallback((name: string, value: string) => {
    setFields((p) => ({ ...p, [name]: value }));
    // When employment type changes, notify business-scope gate
    if (name === "p1_emp_type" || name === "p2_emp_type") {
      // Small delay so persisted state writes first
      setTimeout(notifyBusinessScopeChanged, 200);
    }
  }, []);

  /* Derived — table footers still show scoped totals */
  const assetsTotal = assets.reduce((s, a) => s + n(a.value), 0);
  const liabTotal = liabilities.reduce((s, l) => s + n(l.balance), 0);

  function goNext() {
    setStep((s: number) => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goPrev() {
    setStep((s: number) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goToStep(n: number) {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Guard: don't render the form until remote hydration has resolved.
  // Otherwise usePersistedState initializes with localStorage defaults
  // and the effect's window.location.reload() yanks the page mid-render.
  if (!hydrated) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="card-pad flex items-center gap-3 text-[13px] text-verdant-muted">
          <span className="material-symbols-outlined animate-spin text-[18px]">
            progress_activity
          </span>
          טוען שאלון...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Page header removed 2026-04-28 — only save indicator + progress bar remain. */}
      <header className="mb-3">
        <div className="mb-2 flex items-center justify-end">
          <div
            className="flex items-center gap-2 text-[11px] font-semibold"
            style={{ color: saveStatus === "saved" ? "#2B694D" : "#5a7a6a" }}
          >
            <span className="material-symbols-outlined text-[16px]">
              {saveStatus === "saving" ? "cloud_sync" : "cloud_done"}
            </span>
            <span>
              {saveStatus === "saving"
                ? "שומר..."
                : saveStatus === "saved"
                  ? "נשמר אוטומטית"
                  : "אוטומטי"}
            </span>
          </div>
        </div>

        {/* ═══ Progress Bar ═══ */}
        <div className="card-pad">
          <div className="mb-3 flex items-center justify-between">
            {STEP_LABELS.map((label, i) => {
              const num = i + 1;
              const active = step === num;
              const done = step > num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => goToStep(num)}
                  className="flex flex-1 flex-col items-center gap-1.5 transition-all"
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold transition-all"
                    style={{
                      background: done ? "#2B694D" : active ? "#012d1d" : "#eef2e8",
                      color: done || active ? "#fff" : "#5a7a6a",
                    }}
                  >
                    {done ? (
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    ) : (
                      num
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold ${active ? "text-verdant-ink" : "text-verdant-muted"}`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "#eef2e8" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`, background: "#2B694D" }}
            />
          </div>
        </div>
      </header>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        {/* ===== STEP 1 · Family Profile ===== */}
        {step === 1 && (
          <StepCard num={1} title="פרופיל משפחתי ואישי" icon="people">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                people
              </span>
              פרטי בני הזוג
            </h3>
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="caption">בן/בת זוג 1</div>
                <Fld label="שם מלא" name="p1_name" fields={fields} onChange={setField} />
                <div className="grid grid-cols-2 gap-2">
                  <Fld label="ת.ז" name="p1_id" fields={fields} onChange={setField} dir="ltr" />
                  <Fld
                    label="תאריך לידה"
                    name="p1_dob"
                    fields={fields}
                    onChange={setField}
                    type="date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Fld
                    label="טלפון"
                    name="p1_phone"
                    fields={fields}
                    onChange={setField}
                    type="tel"
                    dir="ltr"
                  />
                  <Fld
                    label="אימייל"
                    name="p1_email"
                    fields={fields}
                    onChange={setField}
                    type="email"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="caption">בן/בת זוג 2</div>
                <Fld label="שם מלא" name="p2_name" fields={fields} onChange={setField} />
                <div className="grid grid-cols-2 gap-2">
                  <Fld label="ת.ז" name="p2_id" fields={fields} onChange={setField} dir="ltr" />
                  <Fld
                    label="תאריך לידה"
                    name="p2_dob"
                    fields={fields}
                    onChange={setField}
                    type="date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Fld
                    label="טלפון"
                    name="p2_phone"
                    fields={fields}
                    onChange={setField}
                    type="tel"
                    dir="ltr"
                  />
                  <Fld
                    label="אימייל"
                    name="p2_email"
                    fields={fields}
                    onChange={setField}
                    type="email"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Fld
                label="כתובת"
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

            {/* Children */}
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
                  onClick={() => setChildren((p) => [...p, { ...emptyChild }])}
                  className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>הוסף ילד/ה
                </button>
              </div>
              <div className="space-y-3">
                {children.map((c, i) => {
                  const updateChild = (k: string, v: string) => {
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
                    );
                  };
                  return (
                    <div key={i} className="v-divider rounded-lg border bg-white p-4">
                      {/* Row 1: basic info */}
                      <div className="mb-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setChildren((p) => p.filter((_, j) => j !== i))}
                          className="flex items-center gap-0.5 text-[11px] font-bold text-red-400 hover:text-red-600"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>הסר
                        </button>
                        <span className="text-[12px] font-extrabold text-verdant-ink">
                          {c.name || `ילד/ה ${i + 1}`}
                          {c.age && (
                            <span className="mr-2 font-bold text-verdant-muted">(גיל {c.age})</span>
                          )}
                        </span>
                      </div>
                      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                            שם
                          </label>
                          <input
                            className="inp w-full"
                            value={c.name}
                            onChange={(e) => updateChild("name", e.target.value)}
                            placeholder="שם הילד/ה"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                            תאריך לידה
                          </label>
                          <input
                            className="inp w-full"
                            type="date"
                            value={c.dob}
                            onChange={(e) => updateChild("dob", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                            מין
                          </label>
                          <select
                            className="inp w-full"
                            value={c.gender}
                            onChange={(e) => updateChild("gender", e.target.value)}
                          >
                            <option value="">—</option>
                            <option value="male">זכר</option>
                            <option value="female">נקבה</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                            מסגרת
                          </label>
                          <select
                            className="inp w-full"
                            value={c.framework}
                            onChange={(e) => updateChild("framework", e.target.value)}
                          >
                            <option value="">—</option>
                            {FRAMEWORKS.map((f) => (
                              <option key={f}>{f}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                            צרכים מיוחדים
                          </label>
                          <input
                            className="inp w-full"
                            value={c.special}
                            onChange={(e) => updateChild("special", e.target.value)}
                            placeholder="—"
                          />
                        </div>
                      </div>

                      {/* Row 2: חיסכון לכל ילד */}
                      <div className="v-divider border-t pt-3">
                        <div className="mb-2 flex items-center justify-end gap-1.5 text-[10px] font-extrabold text-verdant-ink">
                          <span>חיסכון לכל ילד</span>
                          <span className="material-symbols-outlined text-[14px] text-verdant-emerald">
                            savings
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                              בית השקעות
                            </label>
                            <select
                              className="inp w-full"
                              value={c.savings_provider}
                              onChange={(e) => updateChild("savings_provider", e.target.value)}
                            >
                              <option value="">בחר...</option>
                              {KIDS_PROVIDERS.map((p) => (
                                <option key={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                              מסלול
                            </label>
                            <select
                              className="inp w-full"
                              value={c.savings_track || "medium"}
                              onChange={(e) => updateChild("savings_track", e.target.value)}
                            >
                              {KIDS_TRACKS.map((t) => (
                                <option key={t.key} value={t.key}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                              יתרה נוכחית ₪
                            </label>
                            <input
                              className="inp w-full"
                              type="number"
                              min="0"
                              value={c.savings_balance}
                              onChange={(e) => updateChild("savings_balance", e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                              הורים מפקידים?
                            </label>
                            <div
                              className="flex gap-1 rounded-xl p-0.5"
                              style={{ background: "#eef2e8" }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  updateChild("savings_parent_deposit", String(PARENT_MONTHLY_MAX))
                                }
                                className="flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors"
                                style={{
                                  background:
                                    (Number(c.savings_parent_deposit) || 0) > 0
                                      ? "#2B694D"
                                      : "transparent",
                                  color:
                                    (Number(c.savings_parent_deposit) || 0) > 0
                                      ? "#F9FAF2"
                                      : "#5C6058",
                                }}
                              >
                                כן
                              </button>
                              <button
                                type="button"
                                onClick={() => updateChild("savings_parent_deposit", "0")}
                                className="flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors"
                                style={{
                                  background:
                                    (Number(c.savings_parent_deposit) || 0) === 0
                                      ? "#2B694D"
                                      : "transparent",
                                  color:
                                    (Number(c.savings_parent_deposit) || 0) === 0
                                      ? "#F9FAF2"
                                      : "#5C6058",
                                }}
                              >
                                לא
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-1.5 text-right text-[9px] text-verdant-muted">
                          {(Number(c.savings_parent_deposit) || 0) > 0
                            ? `ביט״ל ₪${GOV_MONTHLY_DEPOSIT}/ח + הורים ₪${PARENT_MONTHLY_MAX}/ח = ₪${GOV_MONTHLY_DEPOSIT + PARENT_MONTHLY_MAX}/חודש`
                            : `ביט״ל בלבד — ₪${GOV_MONTHLY_DEPOSIT}/חודש`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Employment */}
            <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                work
              </span>
              תעסוקה
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="caption">בן/בת זוג 1</div>
                <FldSelect
                  label="סוג תעסוקה"
                  name="p1_emp_type"
                  fields={fields}
                  onChange={setField}
                  options={["שכיר/ה", "עצמאי/ת", "שכיר/ה + עצמאי/ת"]}
                />
                <Fld
                  label="מעסיק / שם העסק"
                  name="p1_employer"
                  fields={fields}
                  onChange={setField}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Fld label="תפקיד" name="p1_role" fields={fields} onChange={setField} />
                  <Fld
                    label="ותק (שנים)"
                    name="p1_tenure"
                    fields={fields}
                    onChange={setField}
                    type="number"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="caption">בן/בת זוג 2</div>
                <FldSelect
                  label="סוג תעסוקה"
                  name="p2_emp_type"
                  fields={fields}
                  onChange={setField}
                  options={["שכיר/ה", "עצמאי/ת", "שכיר/ה + עצמאי/ת"]}
                />
                <Fld
                  label="מעסיק / שם העסק"
                  name="p2_employer"
                  fields={fields}
                  onChange={setField}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Fld label="תפקיד" name="p2_role" fields={fields} onChange={setField} />
                  <Fld
                    label="ותק (שנים)"
                    name="p2_tenure"
                    fields={fields}
                    onChange={setField}
                    type="number"
                  />
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {/* ===== STEP 2 · Financial Picture ===== */}
        {step === 2 && (
          <StepCard num={2} title="תמונה כספית" icon="payments">
            {/* Income — dynamic list */}
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
                    style={{ background: i % 2 ? "#fbfcf6" : "#fff" }}
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
                    <input
                      className="inp tabular w-36 text-left"
                      type="number"
                      min="0"
                      value={row.value}
                      onChange={(e) =>
                        setIncomes((p) =>
                          p.map((r, j) => (j === i ? { ...r, value: e.target.value } : r))
                        )
                      }
                      placeholder="0"
                      dir="ltr"
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
                  style={{ background: "#f4f8f0", borderColor: "#c9e3d4" }}
                >
                  <span className="text-[12px] font-bold text-verdant-ink">
                    סה&quot;כ הכנסות חודשיות
                  </span>
                  <span className="tabular text-[13px] font-extrabold text-verdant-ink" dir="ltr">
                    {fmt(incomes.reduce((s, r) => s + n(r.value), 0))}
                  </span>
                </li>
              </ul>
            </div>

            {/* Gross salary breakdown — feeds salary-engine (tax & pension calculators) */}
            <details className="mb-4 rounded-xl border border-verdant-line bg-[#f9faf2] p-3">
              <summary className="flex cursor-pointer select-none items-center gap-2 text-[11px] font-bold text-verdant-muted">
                <span className="material-symbols-outlined text-[14px]">tune</span>
                פירוט שכר ברוטו (אופציונלי — לדיוק חישובי המס)
                <span className="text-[10px] font-medium opacity-75">
                  מופיע בתלוש — משמש לחישוב נטו, פנסיה וקה"ש
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
                ברירות מחדל: פנסיה 6% עובד / 6.5% מעסיק / 6% פיצויים · קה"ש 2.5% / 7.5% · נקודות
                זיכוי 2.25. נשמר בפרופיל השכר ומשפיע על דוחות התזרים והפרישה.
              </div>
            </details>

            {/* ── Expenses section removed ──
             * ההוצאות נאספות דרך מיפוי אמיתי של עסקאות (עו"ש + כרטיסי אשראי)
             * בדף "תקציב" / "תזרים". אין טעם לבקש מהמשתמש לנחש "בערך" — זה
             * מייצר נתון מזויף שמתחרה עם הנתון האמיתי מהמיפוי. */}
            <div
              className="mb-3 mt-6 flex items-start gap-2 rounded-xl p-3"
              style={{ background: "#eef7f1", border: "1px solid #c9e3d4" }}
            >
              <span className="material-symbols-outlined mt-0.5 text-[18px] text-verdant-emerald">
                info
              </span>
              <div className="text-[12px] leading-relaxed text-verdant-ink">
                הכנסות מתעדים כאן. הוצאות נשאבות מתקציב.
              </div>
            </div>

            {/* Assets */}
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
                  <tr className="v-divider border-t" style={{ background: "#eef7f1" }}>
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
                      <input
                        className="inp tabular"
                        type="number"
                        min="0"
                        value={a.value}
                        onChange={(e) => onUpdate(i, "value", e.target.value)}
                      />
                    </td>
                  </>
                )}
              />

              {/* Rental details — shown ONLY for investment properties so the
                value auto-flows to /realestate and from there into /budget as
                a locked income row. Keeps the main table clean for other
                asset types (pension, car, portfolio, etc.). */}
              {assets.some((a) => a.type === 'נדל"ן להשקעה') && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-verdant-muted">
                    <span className="material-symbols-outlined text-[14px] text-verdant-emerald">
                      home_work
                    </span>
                    פרטי שכירות — נכסים להשקעה
                  </div>
                  {assets.map((a, i) =>
                    a.type === 'נדל"ן להשקעה' ? (
                      <div
                        key={`rent-${i}`}
                        className="rounded-xl p-3"
                        style={{ background: "#f9faf2", border: "1px solid #e5e9dc" }}
                      >
                        <div className="mb-2 text-[12px] font-extrabold text-verdant-ink">
                          {a.desc || "נכס ללא שם"} {a.value ? `· ${fmt(Number(a.value))}` : ""}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                              שכ״ד חודשי (₪)
                            </label>
                            <input
                              className="inp tabular"
                              type="number"
                              min="0"
                              value={a.rent || ""}
                              onChange={(e) =>
                                setAssets((p) =>
                                  p.map((x, j) => (j === i ? { ...x, rent: e.target.value } : x))
                                )
                              }
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                              הוצאות חודשיות (₪)
                            </label>
                            <input
                              className="inp tabular"
                              type="number"
                              min="0"
                              value={a.rentExpenses || ""}
                              onChange={(e) =>
                                setAssets((p) =>
                                  p.map((x, j) =>
                                    j === i ? { ...x, rentExpenses: e.target.value } : x
                                  )
                                )
                              }
                              placeholder="ועד בית, ארנונה, ניהול"
                              title="לא כולל משכנתא — היא כבר נספרת דרך טבלת ההתחייבויות"
                            />
                          </div>
                        </div>
                        <div className="mt-2 text-[10px] text-verdant-muted">
                          שכ״ד נטו (
                          {fmt(Math.max(0, (Number(a.rent) || 0) - (Number(a.rentExpenses) || 0)))}
                          /ח׳) ייכנס אוטומטית לתקציב כהכנסה.
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>

            {/* Liabilities */}
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
                  <tr className="v-divider border-t" style={{ background: "#fef2f2" }}>
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
                      <input
                        className="inp tabular"
                        type="number"
                        min="0"
                        value={l.balance}
                        onChange={(e) => onUpdate(i, "balance", e.target.value)}
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
                          style={{ background: "#f4f5ed", color: "#7a8a7e", cursor: "help" }}
                        />
                      ) : (
                        <input
                          className="inp tabular"
                          type="number"
                          step="0.1"
                          min="0"
                          value={l.rate}
                          onChange={(e) => onUpdate(i, "rate", e.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-2">
                      <input
                        className="inp tabular"
                        type="number"
                        min="0"
                        value={l.monthly}
                        onChange={(e) => onUpdate(i, "monthly", e.target.value)}
                      />
                    </td>
                  </>
                )}
              />
              <div
                className="mt-3 flex items-start gap-2 rounded-xl p-3"
                style={{ background: "#eef7f1", border: "1px solid #c9e3d4" }}
              >
                <span className="material-symbols-outlined mt-0.5 text-[18px] text-verdant-emerald">
                  info
                </span>
                <div className="text-[12px] leading-relaxed text-verdant-ink">
                  ריביות ומסלולים יילקחו מלוח הסילוקין בדף <b>נדל״ן</b>. כאן רק יתרה והחזר חודשי.
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {/* ===== STEP 3 · Risk & Legal ===== */}
        {step === 3 && (
          <StepCard num={3} title="ניהול סיכונים ומשפט" icon="health_and_safety">
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
                <thead className="v-divider border-b" style={{ background: "#f9faf2" }}>
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
                    <tr key={i} className="h-[30px]">
                      {/* Type cell: fixed label for defaults, dropdown for custom rows */}
                      {ins.isCustom === "1" ? (
                        <td className="px-2">
                          <select
                            className="inp"
                            value={ins.type}
                            onChange={(e) =>
                              setInsurance((p) =>
                                p.map((x, j) => (j === i ? { ...x, type: e.target.value } : x))
                              )
                            }
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
                      {/* For whom — editable on every row (not just custom additions) */}
                      <td className="px-2">
                        <input
                          className="inp"
                          value={ins.for || ""}
                          onChange={(e) =>
                            setInsurance((p) =>
                              p.map((x, j) => (j === i ? { ...x, for: e.target.value } : x))
                            )
                          }
                          placeholder="בן זוג / שם"
                        />
                      </td>
                      <td className="px-2">
                        <select
                          className="inp"
                          value={ins.has}
                          onChange={(e) =>
                            setInsurance((p) =>
                              p.map((x, j) => (j === i ? { ...x, has: e.target.value } : x))
                            )
                          }
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
                          onChange={(e) =>
                            setInsurance((p) =>
                              p.map((x, j) => (j === i ? { ...x, company: e.target.value } : x))
                            )
                          }
                          placeholder="חברה"
                        />
                      </td>
                      <td className="px-2">
                        <input
                          className="inp tabular"
                          type="number"
                          min="0"
                          value={ins.coverage}
                          onChange={(e) =>
                            setInsurance((p) =>
                              p.map((x, j) => (j === i ? { ...x, coverage: e.target.value } : x))
                            )
                          }
                        />
                      </td>
                      <td className="px-2">
                        <input
                          className="inp tabular"
                          type="number"
                          min="0"
                          value={ins.premium}
                          onChange={(e) =>
                            setInsurance((p) =>
                              p.map((x, j) => (j === i ? { ...x, premium: e.target.value } : x))
                            )
                          }
                        />
                      </td>
                      {/* Delete button — only on custom rows */}
                      <td className="px-1">
                        {ins.isCustom === "1" && (
                          <button
                            type="button"
                            onClick={() => setInsurance((p) => p.filter((_, j) => j !== i))}
                            className="text-verdant-muted transition-colors hover:text-red-600"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-verdant-ink">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                gavel
              </span>
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
          </StepCard>
        )}

        {/* ===== STEP 4 · Vision & Goals ===== */}
        {step === 4 && (
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
                <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                  flag
                </span>
                טבלת יעדים
              </h3>
              <button
                type="button"
                onClick={() =>
                  setGoals((p) => [...p, { name: "", cost: "", horizon: "", priority: "" }])
                }
                className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
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
                    <input
                      className="inp tabular"
                      type="number"
                      min="0"
                      value={g.cost}
                      onChange={(e) => onUpdate(i, "cost", e.target.value)}
                    />
                  </td>
                  <td className="px-2">
                    <input
                      className="inp tabular"
                      type="number"
                      min="0"
                      value={g.horizon}
                      onChange={(e) => onUpdate(i, "horizon", e.target.value)}
                    />
                  </td>
                  <td className="px-3">
                    <div className="flex gap-1">
                      {(["want", "need", "dream"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onUpdate(i, "priority", v)}
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold transition-all ${g.priority === v ? (v === "want" ? "border-green-300 bg-green-50 text-green-700" : v === "need" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-blue-300 bg-blue-50 text-blue-700") : "border-verdant-line bg-white text-verdant-muted"}`}
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
        )}

        {/* ===== STEP 5 · Pension & Retirement =====
         * "חיסכון פנסיוני" (pension savings) was removed — the מסלקה upload
         * on the pension page is the authoritative source. We keep only
         * the retirement plan + study-fund status (for both partners).
         */}
        {step === 5 && (
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
              style={{ background: "#eef7f1", border: "1px solid #c9e3d4" }}
            >
              <span className="material-symbols-outlined mt-0.5 text-[18px] text-verdant-emerald">
                info
              </span>
              <div className="text-[12px] leading-relaxed text-verdant-ink">
                פנסיה נטענת מהמסלקה.
              </div>
            </div>
          </StepCard>
        )}

        {/* ═══ Step Navigation ═══ */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={goPrev}
                className="btn-botanical-ghost flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>שלב קודם
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="btn-botanical flex items-center gap-2"
              >
                שלב הבא<span className="material-symbols-outlined text-[16px]">arrow_back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Flush all persisted state to localStorage immediately before sync.
                  // Must use scopedKey() so the sync engine and store migrations read
                  // from the same client-scoped namespace (verdant:c:{id}:...).
                  try {
                    localStorage.setItem(
                      scopedKey("verdant:onboarding:fields"),
                      JSON.stringify(fields)
                    );
                    localStorage.setItem(
                      scopedKey("verdant:onboarding:children"),
                      JSON.stringify(children)
                    );
                    localStorage.setItem(
                      scopedKey("verdant:onboarding:assets"),
                      JSON.stringify(assets)
                    );
                    localStorage.setItem(
                      scopedKey("verdant:onboarding:liabilities"),
                      JSON.stringify(liabilities)
                    );
                    localStorage.setItem(
                      scopedKey("verdant:onboarding:insurance"),
                      JSON.stringify(insurance)
                    );
                    localStorage.setItem(
                      scopedKey("verdant:onboarding:goals"),
                      JSON.stringify(goals)
                    );
                    localStorage.setItem(
                      scopedKey("verdant:onboarding:incomes"),
                      JSON.stringify(incomes)
                    );
                  } catch {}
                  syncOnboardingToStores();
                  router.push("/dashboard");
                }}
                className="btn-botanical flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">check_circle</span>סיום
                ומעבר לדשבורד
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Auto-save status indicator */}
      <SaveIndicator status={saveStatus} />
    </div>
  );
}

/* ===== Reusable sub-components ===== */
function StepCard({
  num,
  title,
  icon,
  children,
}: {
  num: number;
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4 text-white" style={{ background: "#012d1d" }}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] opacity-70">{icon}</span>
          <h2 className="text-base font-extrabold">{title}</h2>
          <span className="mr-auto text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">
            שלב {num}
          </span>
        </div>
      </div>
      <div className="space-y-6 p-6">{children}</div>
    </section>
  );
}

function Fld({
  label,
  name,
  fields,
  onChange,
  type = "text",
  dir,
  placeholder,
}: {
  label: string;
  name: string;
  fields: Fields;
  onChange: (n: string, v: string) => void;
  type?: string;
  dir?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block px-0.5 text-[11px] font-bold text-verdant-ink">{label}</label>
      <input
        className="inp"
        type={type}
        dir={dir}
        placeholder={placeholder}
        value={fields[name] || ""}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

function FldSelect({
  label,
  name,
  fields,
  onChange,
  options,
}: {
  label: string;
  name: string;
  fields: Fields;
  onChange: (n: string, v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="mb-1 block px-0.5 text-[11px] font-bold text-verdant-ink">{label}</label>
      <select
        className="inp"
        value={fields[name] || ""}
        onChange={(e) => onChange(name, e.target.value)}
      >
        <option value="">בחר...</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function FldTextarea({
  label,
  name,
  fields,
  onChange,
}: {
  label: string;
  name: string;
  fields: Fields;
  onChange: (n: string, v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block px-0.5 text-[11px] font-bold text-verdant-ink">{label}</label>
      <textarea
        className="inp resize-none"
        rows={3}
        value={fields[name] || ""}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

function DynTable<T extends Record<string, string>>({
  headers,
  rows,
  onUpdate,
  onRemove,
  renderRow,
  footer,
}: {
  headers: string[];
  rows: T[];
  onUpdate: (i: number, k: string, v: string) => void;
  onRemove: (i: number) => void;
  renderRow: (
    row: T,
    i: number,
    onUpdate: (i: number, k: string, v: string) => void
  ) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden" style={{ borderRadius: 8 }}>
      <table className="w-full text-sm">
        <thead className="v-divider border-b" style={{ background: "#f9faf2" }}>
          <tr className="text-right">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted"
              >
                {h}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="v-divider divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="h-[30px]">
              {renderRow(r, i, onUpdate)}
              <td className="px-2">
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="text-verdant-muted transition-colors hover:text-red-600"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
