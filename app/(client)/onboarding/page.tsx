"use client";

import { useState, useCallback, useEffect, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { usePersistedState } from "@/hooks/usePersistedState";
import { SaveIndicator } from "@/components/SaveIndicator";

/* ===== Types ===== */
interface Child { [key: string]: string; name: string; age: string; framework: string; special: string }
interface AssetRow { [key: string]: string; type: string; desc: string; value: string }
interface LiabRow { [key: string]: string; type: string; lender: string; balance: string; rate: string; monthly: string }
interface InsRow { [key: string]: string; type: string; has: string; company: string; coverage: string; premium: string }
interface GoalRow { [key: string]: string; name: string; cost: string; horizon: string; priority: string }
interface Fields { [key: string]: string }

const ASSET_TYPES = ["נדל\"ן למגורים","נדל\"ן להשקעה","רכב","רכב יוקרה","תיק השקעות","פיקדון / חיסכון","קופת גמל","קרן השתלמות","אחר"];
const LIAB_TYPES = ["משכנתא","הלוואה בנקאית","הלוואה חוץ-בנקאית","מסגרת אוברדרפט","אחר"];
const FRAMEWORKS = ["גן","יסודי","חט\"ב","תיכון","אחרי צבא","בוגר"];
const INS_DEFAULTS: InsRow[] = [
  { type:"ביטוח חיים", has:"", company:"", coverage:"", premium:"" },
  { type:"בריאות", has:"", company:"", coverage:"", premium:"" },
  { type:"סיעוד", has:"", company:"", coverage:"", premium:"" },
  { type:"אובדן כושר עבודה", has:"", company:"", coverage:"", premium:"" },
];

const n = (v: string) => Number(v) || 0;
const fmt = (v: number) => "₪" + Math.round(v).toLocaleString("he-IL");

export default function OnboardingPage() {
  const router = useRouter();
  /* ── Step navigation (5 steps) ── */
  const [step, setStep] = usePersistedState<number>("verdant:onboarding:step", 1);
  const TOTAL_STEPS = 5;
  const STEP_LABELS = ["פרופיל משפחתי", "תמונה כספית", "סיכונים ומשפט", "חזון ויעדים", "פנסיה ופרישה"];

  /* ── Persisted state — auto-saves to localStorage (1.5s debounce) ── */
  const [fields, setFields, fieldsSaving] = usePersistedState<Fields>("verdant:onboarding:fields", {}, 1500);
  const [children, setChildren, childrenSaving] = usePersistedState<Child[]>("verdant:onboarding:children", [{ name:"", age:"", framework:"", special:"" }], 1500);
  const [assets, setAssets, assetsSaving] = usePersistedState<AssetRow[]>("verdant:onboarding:assets", [{ type:"נדל\"ן למגורים", desc:"", value:"" }], 1500);
  const [liabilities, setLiabilities, liabSaving] = usePersistedState<LiabRow[]>("verdant:onboarding:liabilities", [{ type:"משכנתא", lender:"", balance:"", rate:"", monthly:"" }], 1500);
  const [insurance, setInsurance, insSaving] = usePersistedState<InsRow[]>("verdant:onboarding:insurance", INS_DEFAULTS, 1500);
  const [goals, setGoals, goalsSaving] = usePersistedState<GoalRow[]>("verdant:onboarding:goals", [{ name:"", cost:"", horizon:"", priority:"" }], 1500);
  const [plannerNotes, setPlannerNotes, notesSaving] = usePersistedState<Record<string, string>>("verdant:onboarding:planner_notes", {}, 1500);

  const isSaving = fieldsSaving || childrenSaving || assetsSaving || liabSaving || insSaving || goalsSaving || notesSaving;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (isSaving) { setSaveStatus("saving"); }
    else if (saveStatus === "saving") { setSaveStatus("saved"); const t = setTimeout(() => setSaveStatus("idle"), 2000); return () => clearTimeout(t); }
  }, [isSaving, saveStatus]);

  const setField = useCallback((name: string, value: string) => setFields(p => ({ ...p, [name]: value })), []);

  /* Derived */
  const income = n(fields.inc_salary1)+n(fields.inc_salary2)+n(fields.inc_rental)+n(fields.inc_pension)+n(fields.inc_parents)+n(fields.inc_other);
  const expense = n(fields.exp_housing)+n(fields.exp_property_tax)+n(fields.exp_utilities)+n(fields.exp_telecom)+n(fields.exp_education)+n(fields.exp_insurance)+n(fields.exp_food)+n(fields.exp_car)+n(fields.exp_leisure)+n(fields.exp_health)+n(fields.exp_vacation)+n(fields.exp_other);
  const assetsTotal = assets.reduce((s,a) => s+n(a.value), 0);
  const liabTotal = liabilities.reduce((s,l) => s+n(l.balance), 0);
  const cashflow = income - expense;
  const netWorth = assetsTotal - liabTotal;

  function goNext() { setStep((s: number) => Math.min(s + 1, TOTAL_STEPS)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function goPrev() { setStep((s: number) => Math.max(s - 1, 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function goToStep(n: number) { setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.25em] text-verdant-muted font-bold mb-2">שאלון אפיון · Onboarding</div>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-4xl font-extrabold text-verdant-ink tracking-tight leading-tight">איסוף פרטי המשפחה או היחיד</h1>
            <p className="text-sm text-verdant-muted mt-2">{TOTAL_STEPS} שלבים · שמירה אוטומטית · הנתונים מעדכנים את מפת העושר והתקציב</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: saveStatus === "saved" ? "#10b981" : "#5a7a6a" }}>
            <span className="material-symbols-outlined text-[16px]">{saveStatus === "saving" ? "cloud_sync" : "cloud_done"}</span>
            <span>{saveStatus === "saving" ? "שומר..." : saveStatus === "saved" ? "נשמר" : "אוטומטי"}</span>
          </div>
        </div>

        {/* ═══ Progress Bar ═══ */}
        <div className="v-card p-4">
          <div className="flex items-center justify-between mb-3">
            {STEP_LABELS.map((label, i) => {
              const num = i + 1;
              const active = step === num;
              const done = step > num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => goToStep(num)}
                  className="flex flex-col items-center gap-1.5 flex-1 transition-all"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold transition-all"
                    style={{
                      background: done ? "#10b981" : active ? "#012d1d" : "#eef2e8",
                      color: done || active ? "#fff" : "#5a7a6a",
                    }}
                  >
                    {done ? <span className="material-symbols-outlined text-[16px]">check</span> : num}
                  </div>
                  <span className={`text-[10px] font-bold ${active ? "text-verdant-ink" : "text-verdant-muted"}`}>{label}</span>
                </button>
              );
            })}
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`, background: "#10b981" }} />
          </div>
        </div>
      </header>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        {/* ===== STEP 1 · Family Profile ===== */}
        {step === 1 && <StepCard num={1} title="פרופיל משפחתי ואישי" icon="people">

          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">people</span>פרטי בני הזוג
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">בן/בת זוג 1</div>
              <Fld label="שם מלא" name="p1_name" fields={fields} onChange={setField} />
              <div className="grid grid-cols-2 gap-2">
                <Fld label="ת.ז" name="p1_id" fields={fields} onChange={setField} dir="ltr" />
                <Fld label="תאריך לידה" name="p1_dob" fields={fields} onChange={setField} type="date" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Fld label="טלפון" name="p1_phone" fields={fields} onChange={setField} type="tel" dir="ltr" />
                <Fld label="אימייל" name="p1_email" fields={fields} onChange={setField} type="email" dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">בן/בת זוג 2</div>
              <Fld label="שם מלא" name="p2_name" fields={fields} onChange={setField} />
              <div className="grid grid-cols-2 gap-2">
                <Fld label="ת.ז" name="p2_id" fields={fields} onChange={setField} dir="ltr" />
                <Fld label="תאריך לידה" name="p2_dob" fields={fields} onChange={setField} type="date" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Fld label="טלפון" name="p2_phone" fields={fields} onChange={setField} type="tel" dir="ltr" />
                <Fld label="אימייל" name="p2_email" fields={fields} onChange={setField} type="email" dir="ltr" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Fld label="כתובת" name="address" fields={fields} onChange={setField} placeholder="רחוב ומספר" />
            <Fld label="עיר" name="city" fields={fields} onChange={setField} />
            <FldSelect label="מצב משפחתי" name="marital" fields={fields} onChange={setField} options={["נשואים","ידועים בציבור","פרודים","גרושים","אלמן/ה"]} />
          </div>

          {/* Children */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-verdant-ink flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-verdant-emerald">child_care</span>ילדים
              </h3>
              <button type="button" onClick={() => setChildren(p => [...p, { name:"",age:"",framework:"",special:"" }])} className="text-[11px] font-bold text-verdant-emerald hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">add</span>הוסף ילד/ה
              </button>
            </div>
            <DynTable
              headers={["שם","גיל","מסגרת","צרכים מיוחדים"]}
              rows={children}
              onUpdate={(i,k,v) => setChildren(p => p.map((c,j)=> j===i ? {...c,[k]:v} : c))}
              onRemove={(i) => setChildren(p => p.filter((_,j)=>j!==i))}
              renderRow={(c,i,onUpdate) => (
                <>
                  <td className="px-2"><input className="inp" value={c.name} onChange={e=>onUpdate(i,"name",e.target.value)} placeholder="שם" /></td>
                  <td className="px-2"><input className="inp" type="number" min="0" value={c.age} onChange={e=>onUpdate(i,"age",e.target.value)} /></td>
                  <td className="px-2">
                    <select className="inp" value={c.framework} onChange={e=>onUpdate(i,"framework",e.target.value)}>
                      <option value="">—</option>
                      {FRAMEWORKS.map(f=><option key={f}>{f}</option>)}
                    </select>
                  </td>
                  <td className="px-2"><input className="inp" value={c.special} onChange={e=>onUpdate(i,"special",e.target.value)} placeholder="—" /></td>
                </>
              )}
            />
          </div>

          {/* Employment */}
          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">work</span>תעסוקה
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">בן/בת זוג 1</div>
              <Fld label="מעסיק" name="p1_employer" fields={fields} onChange={setField} />
              <div className="grid grid-cols-2 gap-2">
                <Fld label="תפקיד" name="p1_role" fields={fields} onChange={setField} />
                <Fld label="ותק (שנים)" name="p1_tenure" fields={fields} onChange={setField} type="number" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">בן/בת זוג 2</div>
              <Fld label="מעסיק" name="p2_employer" fields={fields} onChange={setField} />
              <div className="grid grid-cols-2 gap-2">
                <Fld label="תפקיד" name="p2_role" fields={fields} onChange={setField} />
                <Fld label="ותק (שנים)" name="p2_tenure" fields={fields} onChange={setField} type="number" />
              </div>
            </div>
          </div>
          <PlannerNotes stepKey="step1" notes={plannerNotes} onChange={(k,v) => setPlannerNotes(p => ({...p,[k]:v}))} />
        </StepCard>}

        {/* ===== STEP 2 · Financial Picture ===== */}
        {step === 2 && <StepCard num={2} title="תמונה כספית" icon="payments">

          {/* Income */}
          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">payments</span>הכנסות חודשיות <span className="text-[10px] text-verdant-muted font-semibold">(₪)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Fld label="שכר בן/בת זוג 1 (נטו)" name="inc_salary1" fields={fields} onChange={setField} type="number" />
            <Fld label="שכר בן/בת זוג 2 (נטו)" name="inc_salary2" fields={fields} onChange={setField} type="number" />
            <Fld label="הכנסה מנכסים מניבים" name="inc_rental" fields={fields} onChange={setField} type="number" />
            <Fld label="קצבאות" name="inc_pension" fields={fields} onChange={setField} type="number" />
            <Fld label="עזרה מההורים" name="inc_parents" fields={fields} onChange={setField} type="number" />
            <Fld label="אחר" name="inc_other" fields={fields} onChange={setField} type="number" />
          </div>
          <SummaryBar label="סה״כ הכנסה חודשית" value={fmt(income)} bg="#eef7f1" />

          {/* Expenses */}
          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 mt-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">shopping_cart</span>הוצאות חודשיות <span className="text-[10px] text-verdant-muted font-semibold">(₪)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-2">קבועות</div>
              <div className="space-y-2">
                {[["דיור/משכנתא","exp_housing"],["ארנונה ועד","exp_property_tax"],["חשמל/מים/גז","exp_utilities"],["תקשורת","exp_telecom"],["חינוך/חוגים","exp_education"],["ביטוחים","exp_insurance"]].map(([l,k])=>(
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-verdant-muted w-28">{l}</span>
                    <input className="inp tabular" type="number" min="0" value={fields[k]||""} onChange={e=>setField(k,e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-2">משתנות</div>
              <div className="space-y-2">
                {[["מזון וצריכה","exp_food"],["רכב ודלק","exp_car"],["פנאי ובידור","exp_leisure"],["בריאות","exp_health"],["חופשות","exp_vacation"],["אחר","exp_other"]].map(([l,k])=>(
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-verdant-muted w-28">{l}</span>
                    <input className="inp tabular" type="number" min="0" value={fields[k]||""} onChange={e=>setField(k,e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <SummaryBar label="סה״כ הוצאה חודשית" value={fmt(expense)} bg="#fffbeb" />
          <div className="mt-2 flex items-center justify-between p-3 rounded-lg" style={{ background:"#012d1d" }}>
            <span className="text-xs font-bold text-white">תזרים חודשי פנוי</span>
            <span className="text-lg font-extrabold tabular" style={{ color:"#58e1b0" }}>{fmt(cashflow)}</span>
          </div>

          {/* Assets */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-verdant-ink flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-verdant-emerald">account_balance</span>נכסים
              </h3>
              <button type="button" onClick={()=>setAssets(p=>[...p,{type:"נדל\"ן למגורים",desc:"",value:""}])} className="text-[11px] font-bold text-verdant-emerald hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">add</span>הוסף נכס
              </button>
            </div>
            <DynTable
              headers={["סוג","תיאור","שווי נוכחי (₪)"]}
              rows={assets}
              onUpdate={(i,k,v)=>setAssets(p=>p.map((a,j)=>j===i?{...a,[k]:v}:a))}
              onRemove={(i)=>setAssets(p=>p.filter((_,j)=>j!==i))}
              footer={<tr className="border-t v-divider" style={{background:"#eef7f1"}}><td colSpan={2} className="px-3 py-2 text-xs font-bold text-verdant-ink">סה&quot;כ נכסים</td><td className="px-3 py-2 text-sm font-extrabold text-verdant-ink tabular">{fmt(assetsTotal)}</td><td /></tr>}
              renderRow={(a,i,onUpdate)=>(
                <>
                  <td className="px-2"><select className="inp" value={a.type} onChange={e=>onUpdate(i,"type",e.target.value)}>{ASSET_TYPES.map(t=><option key={t}>{t}</option>)}</select></td>
                  <td className="px-2"><input className="inp" value={a.desc} onChange={e=>onUpdate(i,"desc",e.target.value)} placeholder="תיאור" /></td>
                  <td className="px-2"><input className="inp tabular" type="number" min="0" value={a.value} onChange={e=>onUpdate(i,"value",e.target.value)} /></td>
                </>
              )}
            />
          </div>

          {/* Liabilities */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-verdant-ink flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-verdant-emerald">credit_card</span>התחייבויות
              </h3>
              <button type="button" onClick={()=>setLiabilities(p=>[...p,{type:"הלוואה בנקאית",lender:"",balance:"",rate:"",monthly:""}])} className="text-[11px] font-bold text-verdant-emerald hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">add</span>הוסף הלוואה
              </button>
            </div>
            <DynTable
              headers={["סוג","מלווה","יתרה (₪)","ריבית %","החזר חודשי"]}
              rows={liabilities}
              onUpdate={(i,k,v)=>setLiabilities(p=>p.map((l,j)=>j===i?{...l,[k]:v}:l))}
              onRemove={(i)=>setLiabilities(p=>p.filter((_,j)=>j!==i))}
              footer={<tr className="border-t v-divider" style={{background:"#fef2f2"}}><td colSpan={2} className="px-3 py-2 text-xs font-bold text-verdant-ink">סה&quot;כ התחייבויות</td><td className="px-3 py-2 text-sm font-extrabold text-verdant-ink tabular">{fmt(liabTotal)}</td><td colSpan={3}/></tr>}
              renderRow={(l,i,onUpdate)=>(
                <>
                  <td className="px-2"><select className="inp" value={l.type} onChange={e=>onUpdate(i,"type",e.target.value)}>{LIAB_TYPES.map(t=><option key={t}>{t}</option>)}</select></td>
                  <td className="px-2"><input className="inp" value={l.lender} onChange={e=>onUpdate(i,"lender",e.target.value)} placeholder="בנק/גוף" /></td>
                  <td className="px-2"><input className="inp tabular" type="number" min="0" value={l.balance} onChange={e=>onUpdate(i,"balance",e.target.value)} /></td>
                  <td className="px-2"><input className="inp tabular" type="number" step="0.1" min="0" value={l.rate} onChange={e=>onUpdate(i,"rate",e.target.value)} /></td>
                  <td className="px-2"><input className="inp tabular" type="number" min="0" value={l.monthly} onChange={e=>onUpdate(i,"monthly",e.target.value)} /></td>
                </>
              )}
            />
          </div>

          {/* Net Worth */}
          <div className="mt-4 flex items-center justify-between p-4 rounded-lg" style={{ background:"linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)" }}>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color:"#58e1b0" }}>שווי נקי מחושב</div>
              <div className="text-[10px] opacity-70 mt-0.5" style={{ color:"#a7c5b5" }}>נכסים פחות התחייבויות</div>
            </div>
            <div className="text-2xl font-extrabold tabular text-white">{fmt(netWorth)}</div>
          </div>
          <PlannerNotes stepKey="step2" notes={plannerNotes} onChange={(k,v) => setPlannerNotes(p => ({...p,[k]:v}))} />
        </StepCard>}

        {/* ===== STEP 3 · Risk & Legal ===== */}
        {step === 3 && <StepCard num={3} title="ניהול סיכונים ומשפט" icon="health_and_safety">

          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">health_and_safety</span>כיסויים ביטוחיים
          </h3>
          <div className="v-card overflow-hidden mb-6" style={{ borderRadius:8 }}>
            <table className="w-full text-sm">
              <thead className="border-b v-divider" style={{ background:"#f9faf2" }}>
                <tr className="text-right">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">סוג כיסוי</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted w-28">קיים?</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">חברה</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted w-32">סכום כיסוי</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted w-28">פרמיה חודשית</th>
                </tr>
              </thead>
              <tbody className="divide-y v-divider">
                {insurance.map((ins,i)=>(
                  <tr key={i} className="h-[30px]">
                    <td className="text-xs font-bold text-verdant-ink px-3">{ins.type}</td>
                    <td className="px-2"><select className="inp" value={ins.has} onChange={e=>setInsurance(p=>p.map((x,j)=>j===i?{...x,has:e.target.value}:x))}><option value="">—</option><option>כן</option><option>לא</option><option>לא יודע</option></select></td>
                    <td className="px-2"><input className="inp" value={ins.company} onChange={e=>setInsurance(p=>p.map((x,j)=>j===i?{...x,company:e.target.value}:x))} placeholder="חברה" /></td>
                    <td className="px-2"><input className="inp tabular" type="number" min="0" value={ins.coverage} onChange={e=>setInsurance(p=>p.map((x,j)=>j===i?{...x,coverage:e.target.value}:x))} /></td>
                    <td className="px-2"><input className="inp tabular" type="number" min="0" value={ins.premium} onChange={e=>setInsurance(p=>p.map((x,j)=>j===i?{...x,premium:e.target.value}:x))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">gavel</span>מדיניות משפטית
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FldSelect label="מוטבים בביטוחי חיים" name="beneficiaries" fields={fields} onChange={setField} options={["מעודכנים","לא מעודכנים","לא ידוע"]} />
            <FldSelect label="קיום צוואה" name="will" fields={fields} onChange={setField} options={["קיימת ומעודכנת","קיימת ולא מעודכנת","לא קיימת"]} />
            <FldSelect label="הסכם ממון" name="prenup" fields={fields} onChange={setField} options={["קיים","לא קיים","לא רלוונטי"]} />
            <FldSelect label="ייפוי כוח מתמשך" name="poa" fields={fields} onChange={setField} options={["קיים","לא קיים"]} />
          </div>
          <PlannerNotes stepKey="step3" notes={plannerNotes} onChange={(k,v) => setPlannerNotes(p => ({...p,[k]:v}))} />
        </StepCard>}

        {/* ===== STEP 4 · Vision & Goals ===== */}
        {step === 4 && <StepCard num={4} title="חזון, מטרות ויעדים" icon="flag">

          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">psychology</span>שאלות איכותניות
          </h3>
          <div className="space-y-3 mb-6">
            <FldTextarea label="מה נמצא בראש סדר העדיפויות שלכם כמשפחה?" name="q_priorities" fields={fields} onChange={setField} />
            <FldTextarea label="מה יגרום לכם להרגיש סיפוק כלכלי?" name="q_satisfaction" fields={fields} onChange={setField} />
            <FldTextarea label="מה הכי מטריד אתכם כיום בהיבט הכלכלי?" name="q_concerns" fields={fields} onChange={setField} />
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold text-verdant-ink flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">flag</span>טבלת יעדים
            </h3>
            <button type="button" onClick={()=>setGoals(p=>[...p,{name:"",cost:"",horizon:"",priority:""}])} className="text-[11px] font-bold text-verdant-emerald hover:underline flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">add</span>הוסף יעד
            </button>
          </div>
          <DynTable
            headers={["יעד","עלות (₪)","אופק (שנים)","חשיבות"]}
            rows={goals}
            onUpdate={(i,k,v)=>setGoals(p=>p.map((g,j)=>j===i?{...g,[k]:v}:g))}
            onRemove={(i)=>setGoals(p=>p.filter((_,j)=>j!==i))}
            renderRow={(g,i,onUpdate)=>(
              <>
                <td className="px-2"><input className="inp" value={g.name} onChange={e=>onUpdate(i,"name",e.target.value)} placeholder="למשל: חתונה לבת" /></td>
                <td className="px-2"><input className="inp tabular" type="number" min="0" value={g.cost} onChange={e=>onUpdate(i,"cost",e.target.value)} /></td>
                <td className="px-2"><input className="inp tabular" type="number" min="0" value={g.horizon} onChange={e=>onUpdate(i,"horizon",e.target.value)} /></td>
                <td className="px-3">
                  <div className="flex gap-1">
                    {(["want","need","dream"] as const).map(v=>(
                      <button key={v} type="button" onClick={()=>onUpdate(i,"priority",v)}
                        className={`text-[10px] font-bold py-0.5 px-2 rounded border transition-all ${g.priority===v ? (v==="want"?"bg-green-50 text-green-700 border-green-300":v==="need"?"bg-amber-50 text-amber-700 border-amber-300":"bg-blue-50 text-blue-700 border-blue-300") : "text-verdant-muted border-verdant-line bg-white"}`}
                      >{v==="want"?"רצון":v==="need"?"צורך":"חלום"}</button>
                    ))}
                  </div>
                </td>
              </>
            )}
          />
          <PlannerNotes stepKey="step4" notes={plannerNotes} onChange={(k,v) => setPlannerNotes(p => ({...p,[k]:v}))} />
        </StepCard>}

        {/* ===== STEP 5 · Pension & Retirement ===== */}
        {step === 5 && <StepCard num={5} title="פנסיה ופרישה" icon="elderly">
          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">savings</span>חיסכון פנסיוני
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <FldSelect label="סוג תוכנית — בן/בת זוג 1" name="pension_type_1" fields={fields} onChange={setField} options={["קרן פנסיה מקיפה","ביטוח מנהלים","קרן פנסיה כללית","קופת גמל","אין","לא יודע/ת"]} />
            <FldSelect label="סוג תוכנית — בן/בת זוג 2" name="pension_type_2" fields={fields} onChange={setField} options={["קרן פנסיה מקיפה","ביטוח מנהלים","קרן פנסיה כללית","קופת גמל","אין","לא יודע/ת"]} />
            <Fld label="צבירה נוכחית — בן/בת זוג 1 (₪)" name="pension_balance_1" fields={fields} onChange={setField} type="number" />
            <Fld label="צבירה נוכחית — בן/בת זוג 2 (₪)" name="pension_balance_2" fields={fields} onChange={setField} type="number" />
            <Fld label="הפרשה חודשית עובד (₪)" name="pension_monthly_emp" fields={fields} onChange={setField} type="number" />
            <Fld label="הפרשה חודשית מעסיק (₪)" name="pension_monthly_er" fields={fields} onChange={setField} type="number" />
          </div>

          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">beach_access</span>תכנון פרישה
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <Fld label="גיל פרישה רצוי" name="retire_age" fields={fields} onChange={setField} type="number" placeholder="67" />
            <Fld label="הכנסה חודשית רצויה בפרישה (₪)" name="retire_income" fields={fields} onChange={setField} type="number" />
            <FldSelect label="מוכנות לסיכון בתיק פנסיוני" name="pension_risk" fields={fields} onChange={setField} options={["שמרני מאוד","שמרני","מאוזן","צמיחה","אגרסיבי"]} />
            <FldSelect label="קרן השתלמות" name="hishtalmut" fields={fields} onChange={setField} options={["קיימת ופעילה","קיימת ולא פעילה","לא קיימת"]} />
          </div>

          <h3 className="text-sm font-extrabold text-verdant-ink mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">military_tech</span>שירות צבאי ומילואים
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <FldSelect label="סטטוס מילואים — בן/בת זוג 1" name="miluim_1" fields={fields} onChange={setField} options={["משרת/ת פעיל","משוחרר/ת","לא שירתתי","נ/ר"]} />
            <FldSelect label="סטטוס מילואים — בן/בת זוג 2" name="miluim_2" fields={fields} onChange={setField} options={["משרת/ת פעיל","משוחרר/ת","לא שירתתי","נ/ר"]} />
            <Fld label="ימי מילואים שנתיים (ממוצע)" name="miluim_days" fields={fields} onChange={setField} type="number" />
          </div>

          <PlannerNotes stepKey="step5" notes={plannerNotes} onChange={(k,v) => setPlannerNotes(p => ({...p,[k]:v}))} />
        </StepCard>}

        {/* ═══ Step Navigation ═══ */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={goPrev} className="text-sm font-bold text-verdant-muted hover:text-verdant-ink transition-colors flex items-center gap-1 px-4 py-2.5 rounded-lg" style={{ background: "#f4f7ed" }}>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>שלב קודם
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < TOTAL_STEPS ? (
              <button type="button" onClick={goNext} className="text-white font-bold text-sm py-2.5 px-6 rounded-lg transition-transform hover:scale-[0.98] flex items-center gap-2" style={{ background:"linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)" }}>
                שלב הבא<span className="material-symbols-outlined text-[16px]">arrow_back</span>
              </button>
            ) : (
              <button type="button" onClick={() => router.push("/dashboard")} className="text-white font-bold text-sm py-3 px-6 rounded-lg transition-transform hover:scale-[0.98] flex items-center gap-2" style={{ background:"linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)" }}>
                <span className="material-symbols-outlined text-[18px]">check_circle</span>סיום ומעבר לדשבורד
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
function StepCard({ num, title, icon, children }: { num: number; title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="v-card overflow-hidden">
      <div className="px-5 py-4 text-white" style={{ background: "#012d1d" }}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] opacity-70">{icon}</span>
          <h2 className="text-base font-extrabold">{title}</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] opacity-50 font-bold mr-auto">שלב {num}</span>
        </div>
      </div>
      <div className="p-6 space-y-6">{children}</div>
    </section>
  );
}

function PlannerNotes({ stepKey, notes, onChange }: { stepKey: string; notes: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="mt-6 pt-6 border-t v-divider">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-[16px] text-verdant-emerald">edit_note</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-verdant-muted">הערות מתכנן</span>
      </div>
      <textarea
        className="inp resize-none text-right"
        rows={3}
        placeholder="תובנות ראשוניות, נקודות לבדיקה, הנחיות לשלבים הבאים..."
        value={notes[stepKey] || ""}
        onChange={e => onChange(stepKey, e.target.value)}
      />
    </div>
  );
}

function Fld({ label, name, fields, onChange, type="text", dir, placeholder }: { label:string; name:string; fields:Fields; onChange:(n:string,v:string)=>void; type?:string; dir?:string; placeholder?:string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-verdant-ink mb-1 px-0.5">{label}</label>
      <input className="inp" type={type} dir={dir} placeholder={placeholder} value={fields[name]||""} onChange={e=>onChange(name,e.target.value)} />
    </div>
  );
}

function FldSelect({ label, name, fields, onChange, options }: { label:string; name:string; fields:Fields; onChange:(n:string,v:string)=>void; options:string[] }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-verdant-ink mb-1 px-0.5">{label}</label>
      <select className="inp" value={fields[name]||""} onChange={e=>onChange(name,e.target.value)}>
        <option value="">בחר...</option>
        {options.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function FldTextarea({ label, name, fields, onChange }: { label:string; name:string; fields:Fields; onChange:(n:string,v:string)=>void }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-verdant-ink mb-1 px-0.5">{label}</label>
      <textarea className="inp resize-none" rows={3} value={fields[name]||""} onChange={e=>onChange(name,e.target.value)} />
    </div>
  );
}

function SummaryBar({ label, value, bg }: { label:string; value:string; bg:string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: bg }}>
      <span className="text-xs font-bold text-verdant-ink">{label}</span>
      <span className="text-lg font-extrabold text-verdant-ink tabular">{value}</span>
    </div>
  );
}

function DynTable<T extends Record<string,string>>({ headers, rows, onUpdate, onRemove, renderRow, footer }: {
  headers: string[];
  rows: T[];
  onUpdate: (i:number, k:string, v:string)=>void;
  onRemove: (i:number)=>void;
  renderRow: (row:T, i:number, onUpdate:(i:number,k:string,v:string)=>void) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="v-card overflow-hidden" style={{ borderRadius:8 }}>
      <table className="w-full text-sm">
        <thead className="border-b v-divider" style={{ background:"#f9faf2" }}>
          <tr className="text-right">
            {headers.map(h=><th key={h} className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">{h}</th>)}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y v-divider">
          {rows.map((r,i)=>(
            <tr key={i} className="h-[30px]">
              {renderRow(r,i,onUpdate)}
              <td className="px-2">
                <button type="button" onClick={()=>onRemove(i)} className="text-verdant-muted hover:text-red-600 transition-colors">
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
