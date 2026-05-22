"use client";

/**
 * InsuranceNeedsPanel — צרכי כיסוי
 *
 * Sits at the top of /insurance, above the categorical checklist.
 * Built 2026-05-19 — the "math" layer that turns the page from a
 * tracking checklist into an advisory tool: how much coverage does
 * the household need, how much do they have, where is the gap.
 *
 * Pulls context from existing stores (assumptions, debt, pensions,
 * accounts, household kids). Only the "Profile" inputs that no other
 * store knows about live in insurance-profile localStorage.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { loadAssumptions } from "@/lib/assumptions";
import { loadDebtData } from "@/lib/debt-store";
import { loadPensionFunds, EVENT_NAME as PENSION_EVENT } from "@/lib/pension-store";
import { loadAccounts, totalBankBalance, ACCOUNTS_EVENT } from "@/lib/accounts-store";
import { loadRiskItems, RISK_EVENT, type RiskItem } from "@/lib/risk-store";
import { scopedKey } from "@/lib/client-scope";
import {
  computeInsuranceNeeds,
  loadInsuranceProfile,
  saveInsuranceProfile,
  INSURANCE_PROFILE_EVENT,
  type InsuranceProfile,
  type NeedsContext,
  type NeedResult,
  type NeedSeverity,
} from "@/lib/insurance-needs";

/* ── Severity tokens (Morning pastel palette) ── */

const SEV: Record<
  NeedSeverity,
  { fill: string; text: string; border: string; label: string; icon: string }
> = {
  ok: { fill: "#D1FAE5", text: "#065F46", border: "#A7F3D0", label: "תקין", icon: "check_circle" },
  warning: {
    fill: "#FEF3C7",
    text: "#92400E",
    border: "#FDE68A",
    label: "לבדוק",
    icon: "warning",
  },
  // Critical = soft coral background with bold dark-red text. Aggressive
  // full-red fills (#B91C1C) felt alarmist for a financial-planning
  // surface; the dark text on coral already signals urgency without
  // shouting.
  critical: {
    fill: "#FEE2E2",
    text: "#991B1B",
    border: "#FCA5A5",
    label: "פער מהותי",
    icon: "error",
  },
};

/* ── Helpers ── */

interface KidRow {
  dob?: string;
}

function loadKidsAges(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey("verdant:onboarding:children"));
    if (!raw) return [];
    const arr = JSON.parse(raw) as KidRow[];
    const now = new Date();
    return arr
      .map((k) => {
        if (!k.dob) return null;
        const d = new Date(k.dob);
        if (isNaN(d.getTime())) return null;
        let age = now.getFullYear() - d.getFullYear();
        const monthDiff = now.getMonth() - d.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age -= 1;
        return age >= 0 ? age : null;
      })
      .filter((a): a is number => a !== null);
  } catch {
    return [];
  }
}

function buildContext(): NeedsContext {
  const a = loadAssumptions();
  const debt = loadDebtData();
  const pensions = loadPensionFunds();
  const accounts = loadAccounts();

  const mortgageBalance = (debt.mortgages || []).reduce(
    (s, m) => s + (m.tracks || []).reduce((ts, t) => ts + (t.remainingBalance || 0), 0),
    0
  );
  const loansTotal = (debt.loans || []).reduce(
    (s, l) => s + (l.monthlyPayment || 0) * (l.totalPayments || 0),
    0
  );
  const installmentsTotal = (debt.installments || []).reduce(
    (s, i) => s + (i.monthlyAmount || 0) * Math.max(0, (i.totalPayments || 0) - (i.currentPayment || 0)),
    0
  );
  const nonMortgageDebt = loansTotal + installmentsTotal;

  const cash = totalBankBalance(accounts);
  const emergencyMonths = a.monthlyExpenses > 0 ? cash / a.monthlyExpenses : 0;

  return {
    monthlyIncome: a.monthlyIncome,
    monthlyExpenses: a.monthlyExpenses,
    currentAge: a.currentAge,
    retirementAge: a.retirementAge,
    mortgageBalance,
    nonMortgageDebt,
    kidsAges: loadKidsAges(),
    pensionDeathCovered: pensions.some((f) => f.insuranceCover?.death),
    pensionDisabilityCovered: pensions.some((f) => f.insuranceCover?.disability),
    pensionNursingCovered: false, // pension-store doesn't model nursing yet — keep false
    emergencyMonths,
  };
}

/* ═══════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════ */

export function InsuranceNeedsPanel() {
  const [profile, setProfile] = useState<InsuranceProfile>(() => loadInsuranceProfile());
  const [ctx, setCtx] = useState<NeedsContext>(() => buildContext());
  const [riskItems, setRiskItems] = useState<RiskItem[]>(() => loadRiskItems());
  const [expandedCat, setExpandedCat] = useState<NeedResult["category"] | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  /* Sync with the rest of the system — any change to assumptions / debt /
     pensions / accounts / profile / risk-checklist triggers a recompute. */
  const refresh = useCallback(() => {
    setProfile(loadInsuranceProfile());
    setCtx(buildContext());
    setRiskItems(loadRiskItems());
  }, []);

  useEffect(() => {
    refresh();
    const events = [
      INSURANCE_PROFILE_EVENT,
      PENSION_EVENT,
      ACCOUNTS_EVENT,
      RISK_EVENT,
      "verdant:assumptions",
      "verdant:debt:updated",
      "storage",
    ];
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, [refresh]);

  const report = useMemo(
    () => computeInsuranceNeeds(profile, ctx, riskItems),
    [profile, ctx, riskItems]
  );

  const handleProfileChange = (patch: Partial<InsuranceProfile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveInsuranceProfile(next);
  };

  /* Missing-context warning — most fields default to 0 until onboarding/
     assumptions are filled. We don't hide the panel; we explain. */
  const missingContext = ctx.monthlyIncome === 0;

  return (
    <section className="mb-10">
      {/* Header text removed 2026-05-21 per Nir — title was redundant with the
          page-level "ניהול סיכונים" headline. The "הנחות חישוב" button stays
          aligned to the end (left in RTL) so users can still open the
          assumption editor. */}
      <div className="mb-5 flex justify-end">
        <button
          type="button"
          onClick={() => setShowProfile((s) => !s)}
          className="rounded-lg px-3 py-2 text-xs font-bold transition-colors"
          style={{
            background: showProfile ? "var(--morning-surface-3)" : "var(--morning-surface)",
            border: "1px solid var(--morning-border)",
            color: "var(--morning-ink)",
          }}
        >
          <span className="material-symbols-outlined ml-1 align-middle text-[14px]">tune</span>
          {showProfile ? "סגור הנחות" : "הנחות חישוב"}
        </button>
      </div>

      {/* ── Profile editor (collapsible) — sits directly under the button so
          clicking the toggle shows the panel where the user's eye already is,
          instead of scrolling them past 4 cards to find it. (2026-05-21) ── */}
      {showProfile && (
        <div className="mb-5">
          <ProfileEditor
            profile={profile}
            ctx={ctx}
            onChange={handleProfileChange}
            onClose={() => setShowProfile(false)}
          />
        </div>
      )}

      {/* ── Missing-context banner ── */}
      {missingContext && (
        <div
          className="mb-5 flex items-start gap-2 rounded-xl p-3 text-xs"
          style={{ background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E" }}
        >
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>
            לא מולא <b>שכר חודשי</b> בהנחות העבודה. החישוב מבוסס על שכר 0 — מלא את הפרופיל
            הפיננסי בעמוד הראשי כדי לקבל אומדן אמיתי.
          </span>
        </div>
      )}

      {/* ── Auto-linked from checklist info ── */}
      {report.derivedFromChecklist > 0 && (
        <div
          className="mb-5 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold"
          style={{
            background: "#ECFDF5",
            border: "1px solid #A7F3D0",
            color: "#065F46",
          }}
        >
          <span className="material-symbols-outlined text-[14px]">link</span>
          <span>
            {report.derivedFromChecklist} כיסויים פרטיים נטענו אוטומטית מהצ׳קליסט שלמטה
          </span>
        </div>
      )}

      {/* ── Summary banner ── */}
      <div
        className="mb-6 flex items-center gap-3 rounded-2xl p-4"
        style={{
          background: SEV[report.overallSeverity].fill,
          color: SEV[report.overallSeverity].text,
        }}
      >
        <span className="material-symbols-outlined text-[20px]">
          {SEV[report.overallSeverity].icon}
        </span>
        <div className="flex-1 text-sm font-bold">{report.summary}</div>
        {report.totalLumpSumGap > 0 && (
          <div className="text-left text-[11px] font-semibold opacity-90">
            <div>פער הון</div>
            <div className="text-base font-extrabold tabular-nums">
              {fmtILS(report.totalLumpSumGap)}
            </div>
          </div>
        )}
      </div>

      {/* ── 4 category cards ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {report.results.map((r) => (
          <NeedCard
            key={r.category}
            result={r}
            expanded={expandedCat === r.category}
            onToggle={() =>
              setExpandedCat(expandedCat === r.category ? null : r.category)
            }
          />
        ))}
      </div>

    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   NeedCard — one of the 4 risk tiles
   ═══════════════════════════════════════════════════════════ */

function NeedCard({
  result,
  expanded,
  onToggle,
}: {
  result: NeedResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sev = SEV[result.severity];
  const unitSuffix = result.unit === "monthly" ? " / חודש" : "";

  return (
    <article
      className="rounded-2xl p-5"
      style={{
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: sev.fill }}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ color: sev.text }}>
              {result.icon}
            </span>
          </span>
          <div>
            <div className="text-sm font-extrabold" style={{ color: "var(--morning-ink)" }}>
              {result.label}
            </div>
            <div className="text-[11px] font-medium" style={{ color: "var(--morning-muted)" }}>
              {result.unit === "monthly" ? "הכנסה חודשית בעת אירוע" : "סכום חד-פעמי לסגירת הסיכון"}
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-extrabold"
          style={{ background: sev.fill, color: sev.text }}
        >
          {sev.label}
        </span>
      </div>

      {/* Required / Existing / Gap row */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] font-semibold" style={{ color: "var(--morning-muted)" }}>
            דרוש
          </div>
          <div
            className="text-base font-extrabold tabular-nums"
            style={{ color: "var(--morning-ink)" }}
          >
            {fmtILS(result.required)}
            <span className="text-[10px] font-bold opacity-70">{unitSuffix}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold" style={{ color: "var(--morning-muted)" }}>
            יש
          </div>
          <div
            className="text-base font-extrabold tabular-nums"
            style={{ color: "#065F46" }}
          >
            {fmtILS(result.existing)}
            <span className="text-[10px] font-bold opacity-70">{unitSuffix}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold" style={{ color: "var(--morning-muted)" }}>
            פער
          </div>
          <div
            className="text-base font-extrabold tabular-nums"
            style={{ color: result.gap > 0 ? sev.text : "#065F46" }}
          >
            {result.gap > 0 ? fmtILS(result.gap) : "—"}
            {result.gap > 0 && (
              <span className="text-[10px] font-bold opacity-70">{unitSuffix}</span>
            )}
          </div>
        </div>
      </div>

      {/* Coverage bar */}
      <div className="mb-4">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--morning-surface-3)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${result.required > 0 ? Math.min(100, (result.existing / result.required) * 100) : 100}%`,
              background: sev.border,
            }}
          />
        </div>
      </div>

      {/* Expand / collapse */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-[11px] font-bold"
        style={{ color: "var(--morning-muted)" }}
      >
        <span>{expanded ? "סגור פירוט" : "פירוט מלא + המלצה"}</span>
        <span className="material-symbols-outlined text-[16px]">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            {result.breakdown.map((line, i) => (
              <div key={i} className="flex justify-between gap-2 text-[12px]">
                <div className="flex-1">
                  <div
                    className="font-semibold"
                    style={{
                      color: line.isExisting ? "#065F46" : "var(--morning-ink)",
                    }}
                  >
                    <span className="ml-1">{line.isExisting ? "✓" : "·"}</span>
                    {line.label}
                  </div>
                  {line.note && (
                    <div
                      className="text-[10px]"
                      style={{ color: "var(--morning-muted)" }}
                    >
                      {line.note}
                    </div>
                  )}
                </div>
                <div
                  className="font-extrabold tabular-nums"
                  style={{
                    color: line.isExisting ? "#065F46" : "var(--morning-ink)",
                  }}
                >
                  {line.isExisting ? "+" : ""}
                  {fmtILS(line.amount)}
                </div>
              </div>
            ))}
          </div>
          <div
            className="rounded-lg p-3 text-[12px] leading-relaxed"
            style={{ background: "var(--morning-surface-2)", color: "var(--morning-ink)" }}
          >
            <div
              className="mb-1 text-[10px] font-bold tracking-[0.1em]"
              style={{ color: "var(--morning-muted)" }}
            >
              המלצה
            </div>
            {result.recommendation}
          </div>
        </div>
      )}
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════
   ProfileEditor — collapsible inputs panel
   ═══════════════════════════════════════════════════════════ */

function ProfileEditor({
  profile,
  ctx,
  onChange,
  onClose,
}: {
  profile: InsuranceProfile;
  ctx: NeedsContext;
  onChange: (patch: Partial<InsuranceProfile>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--morning-surface-2)",
        border: "1px solid var(--morning-border)",
      }}
    >
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-extrabold" style={{ color: "var(--morning-ink)" }}>
          הנחות חישוב — שדות שלא נטענים מהצ׳קליסט
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-[11px] font-bold"
          style={{ color: "var(--morning-muted)" }}
        >
          סגור
        </button>
      </header>

      <div
        className="mb-4 rounded-lg p-3 text-[11px]"
        style={{
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
          color: "var(--morning-muted)",
        }}
      >
        משק הבית: {ctx.kidsAges.length} ילדים · גיל נוכחי {ctx.currentAge} · שכר חודשי{" "}
        {fmtILS(ctx.monthlyIncome)} · יתרת משכנתא {fmtILS(ctx.mortgageBalance)}
      </div>

      {/* ── Years to replace ── */}
      <fieldset className="mb-5">
        <legend className="mb-2 text-[11px] font-extrabold" style={{ color: "var(--morning-ink)" }}>
          תקופת החלפת הכנסה במקרה פטירה
        </legend>
        <div className="flex flex-wrap gap-2">
          {[
            { v: "until_kids_22" as const, label: "עד שהילד הצעיר בן 22" },
            { v: "until_retirement" as const, label: "עד גיל פרישה" },
            { v: "custom" as const, label: "מותאם" },
          ].map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ yearsToReplaceMode: v })}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
              style={{
                background:
                  profile.yearsToReplaceMode === v ? "#1B4332" : "var(--morning-surface)",
                color: profile.yearsToReplaceMode === v ? "#fff" : "var(--morning-ink)",
                border: "1px solid var(--morning-border)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {profile.yearsToReplaceMode === "custom" && (
          <NumInput
            className="mt-2 w-32"
            value={profile.yearsToReplaceCustom || 0}
            onChange={(n) => onChange({ yearsToReplaceCustom: n })}
            placeholder="שנים"
          />
        )}
      </fieldset>

      {/* ── Grid of value inputs ──
       *  Note (2026-05-19): private-coverage amounts (life / disability /
       *  nursing / critical / mortgage-life) were removed from this editor —
       *  they're now derived automatically from the risk-checklist below.
       *  Only assumptions the checklist *cannot* express live here.
       */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="עלות חינוך מתוכננת לילד (₪)">
          <NumInput
            value={profile.educationCostPerKid}
            onChange={(n) => onChange({ educationCostPerKid: n })}
            placeholder="200,000"
          />
        </Field>

        <Field label="סוג פוליסת אכ״ע">
          <div className="flex gap-2">
            {[
              { v: "general" as const, label: "כללי" },
              { v: "occupational" as const, label: "עיסוקי" },
            ].map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ disabilityType: v })}
                className="flex-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
                style={{
                  background:
                    profile.disabilityType === v ? "#1B4332" : "var(--morning-surface)",
                  color: profile.disabilityType === v ? "#fff" : "var(--morning-ink)",
                  border: "1px solid var(--morning-border)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="קצבת שאירים מביטוח לאומי — הזנה ידנית (₪/חודש)">
          <NumInput
            value={profile.btlSurvivorsMonthlyOverride ?? 0}
            onChange={(n) =>
              onChange({ btlSurvivorsMonthlyOverride: n > 0 ? n : undefined })
            }
            placeholder="אומדן אוטומטי"
          />
        </Field>
      </div>

      <div
        className="mt-5 flex items-start gap-2 rounded-lg p-3 text-[11px]"
        style={{
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
          color: "var(--morning-muted)",
        }}
      >
        <span className="material-symbols-outlined text-[14px]">link</span>
        <span>
          סכומי ביטוח פרטי (חיים, אכ״ע, סיעוד, מחלות קשות, ביטוח משכנתא) — נטענים אוטומטית
          מהצ׳קליסט למטה. עדכון שורה בצ׳קליסט מעדכן את חישוב הפערים מיידית.
        </span>
      </div>
    </div>
  );
}

/* ── Small input helpers ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div
        className="mb-1.5 text-[11px] font-extrabold"
        style={{ color: "var(--morning-ink)" }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value || ""}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      placeholder={placeholder}
      className={`w-full rounded-lg px-3 py-2 text-sm font-bold tabular-nums ${className ?? ""}`}
      style={{
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        color: "var(--morning-ink)",
      }}
    />
  );
}
