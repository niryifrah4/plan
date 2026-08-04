"use client";

/**
 * /m/budget — IncomeSheet
 *
 * Mobile-side questionnaire that owns BOTH earners' salary profiles.
 * Tap the "הכנסות" tile on the cashflow HERO → this sheet opens with
 * the current values pre-filled.
 *
 * Why a mobile editor at all?
 *   The desktop onboarding seeds the primary SalaryProfile once via
 *   syncOnboardingToStores → syncSalaryProfile(). After that, the salary
 *   page on the desktop owns the profile. The mobile had nothing — so
 *   updating gross required opening a laptop.
 *
 * Why two earners?
 *   Per finance-agent audit 2026-05-22: Nir's client base is dual-income
 *   couples (30+ with kids). Asking for one salary was producing income
 *   figures off by 30–100%. The second section captures the spouse via
 *   loadSpouseSalaryProfile / saveSpouseSalaryProfile (separate storage
 *   key, same SalaryProfile shape — computeSalaryBreakdown handles both).
 *
 * Mobile scope (deliberately kept narrow):
 *   - Gross monthly salary, annual bonus, credit points — for each earner.
 *   - Passive income (rental) shown as read-only — managed in desktop.
 *   - Pension % / study fund % / periphery benefit stay on the desktop
 *     salary page — they're "set once, forget" settings.
 */

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import {
  loadSalaryProfile,
  saveSalaryProfile,
  loadSpouseSalaryProfile,
  saveSpouseSalaryProfile,
  computeSalaryBreakdown,
  type SalaryProfile,
} from "@/lib/salary-engine";
import { getPassiveIncomeSummary } from "@/lib/passive-income";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

interface EarnerInputs {
  gross: string;
  bonus: string;
  creditPoints: string;
}

function profileToInputs(p: SalaryProfile | null, fallbackCp: number): EarnerInputs {
  if (!p) return { gross: "", bonus: "", creditPoints: String(fallbackCp) };
  return {
    gross: p.monthlyGross > 0 ? String(p.monthlyGross) : "",
    bonus: p.annualBonus > 0 ? String(p.annualBonus) : "",
    creditPoints: String(p.creditPoints),
  };
}

function inputsToProfile(
  i: EarnerInputs,
  base: SalaryProfile | null,
  defaultBase: SalaryProfile
): SalaryProfile | null {
  const gross = Number(i.gross.replace(/[^\d.]/g, "")) || 0;
  if (gross <= 0) return null; // no profile = clear
  const bonus = Number(i.bonus.replace(/[^\d.]/g, "")) || 0;
  const cp = Number(i.creditPoints.replace(/[^\d.]/g, "")) || 0;
  const start = base ?? defaultBase;
  return {
    ...start,
    monthlyGross: gross,
    annualBonus: bonus,
    creditPoints: cp > 0 ? cp : start.creditPoints,
  };
}

export function IncomeSheet({ onClose, onSaved }: Props) {
  const initialPrimary = loadSalaryProfile();
  const initialSpouse = loadSpouseSalaryProfile();

  const [primary, setPrimary] = useState<EarnerInputs>(() =>
    profileToInputs(initialPrimary, 2.25)
  );
  const [spouse, setSpouse] = useState<EarnerInputs>(() =>
    profileToInputs(initialSpouse, 2.75)
  );

  const passive = getPassiveIncomeSummary();

  // Compute preview using current inputs (re-runs each render — cheap).
  const previewPrimaryNet = useMemo(() => {
    const p = inputsToProfile(primary, initialPrimary, initialPrimary);
    if (!p) return 0;
    try {
      return computeSalaryBreakdown(p).netMonthly;
    } catch {
      return 0;
    }
  }, [primary, initialPrimary]);

  const previewSpouseNet = useMemo(() => {
    const p = inputsToProfile(spouse, initialSpouse, initialPrimary);
    if (!p) return 0;
    try {
      return computeSalaryBreakdown(p).netMonthly;
    } catch {
      return 0;
    }
  }, [spouse, initialSpouse, initialPrimary]);

  const previewSalaryNet = previewPrimaryNet + previewSpouseNet;
  const previewTotalIncome = Math.round(previewSalaryNet + passive.totalMonthly);

  const canSave =
    (Number(primary.gross.replace(/[^\d.]/g, "")) || 0) > 0 ||
    (Number(spouse.gross.replace(/[^\d.]/g, "")) || 0) > 0;

  const handleSave = () => {
    if (!canSave) return;
    const primaryProfile = inputsToProfile(primary, initialPrimary, initialPrimary);
    if (primaryProfile) {
      saveSalaryProfile(primaryProfile);
    }
    const spouseProfile = inputsToProfile(spouse, initialSpouse, initialPrimary);
    saveSpouseSalaryProfile(spouseProfile); // null = clear
    onSaved();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16, 24, 40, 0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="עדכון הכנסות"
        dir="rtl"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--morning-surface)",
          borderTopRightRadius: 24,
          borderTopLeftRadius: 24,
          padding: "16px 20px calc(20px + env(safe-area-inset-bottom))",
          boxShadow: "0 -20px 40px rgba(16, 24, 40, 0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "var(--morning-border-strong)",
            margin: "0 auto 14px",
          }}
        />

        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
          עדכון הכנסות
        </h2>
        <div
          style={{
            fontSize: 12,
            color: "var(--morning-muted)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          הנתונים מסונכרנים אוטומטית עם השאלון בדשבורד וקובעים את ההכנסה
          הנטו שמופיעה בתזרים.
        </div>

        {/* Live preview — sticky at the top so it's visible while typing */}
        <div
          style={{
            background: "var(--morning-leaf-tint)",
            border: "1px solid var(--morning-border)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--morning-forest-deep)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            תצוגה מקדימה — נטו חודשי לתזרים
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--morning-forest-deep)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtILS(previewTotalIncome)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--morning-forest-deep)",
              marginTop: 4,
              opacity: 0.85,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {previewPrimaryNet > 0 && <>{fmtILS(previewPrimaryNet)} ראשי</>}
            {previewSpouseNet > 0 && <> + {fmtILS(previewSpouseNet)} בן/בת זוג</>}
            {passive.totalMonthly > 0 && (
              <> + {fmtILS(passive.totalMonthly)} פסיבי</>
            )}
          </div>
        </div>

        {/* Primary earner */}
        <SectionLabel text="מרוויח/ה ראשי/ת" />
        <EarnerFields values={primary} onChange={setPrimary} autoFocus />

        {/* Spouse */}
        <SectionLabel text="בן/בת הזוג" hint="אם יש שכיר/ה שני/יה בבית — מלאו כאן. אחרת השאירו ריק." />
        <EarnerFields values={spouse} onChange={setSpouse} />

        {/* Passive read-only */}
        <SectionLabel text="הכנסות פסיביות" />
        <div
          style={{
            background: "var(--morning-bg)",
            border: "1px solid var(--morning-border)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          {passive.sources.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--morning-muted)" }}>
              לא נרשמו הכנסות פסיביות. ניתן להוסיף נכס מניב בעמוד הנדל״ן בדשבורד.
            </div>
          ) : (
            <>
              {passive.sources.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--morning-ink)" }}>{s.label}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: "var(--morning-forest)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtILS(s.monthly)} / חודש
                  </span>
                </div>
              ))}
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: "1px dashed var(--morning-border)",
                  fontSize: 11,
                  color: "var(--morning-subtle)",
                }}
              >
                ניהול הנכסים נעשה בעמוד הנדל״ן בדשבורד.
              </div>
            </>
          )}
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--morning-subtle)",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          הגדרות פנסיה, קרן השתלמות והטבת מס יישובים נמצאות בדשבורד.
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: "0 0 auto",
              padding: "14px 18px",
              fontSize: 14,
              fontWeight: 600,
              background: "var(--morning-surface)",
              color: "var(--morning-ink)",
              border: "1px solid var(--morning-border)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 1,
              padding: "14px 18px",
              fontSize: 15,
              fontWeight: 700,
              background: canSave
                ? "var(--morning-forest)"
                : "var(--morning-surface-3)",
              color: canSave ? "#ffffff" : "var(--morning-subtle)",
              border: "none",
              borderRadius: 12,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            שמירת ההכנסות
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */

function EarnerFields({
  values,
  onChange,
  autoFocus = false,
}: {
  values: EarnerInputs;
  onChange: (v: EarnerInputs) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Field label="שכר ברוטו חודשי (₪)" hint="לפני ניכויי מס, פנסיה, ביטוח לאומי">
        <input
          type="number"
          inputMode="decimal"
          value={values.gross}
          onChange={(e) => onChange({ ...values, gross: e.target.value })}
          placeholder="0"
          autoFocus={autoFocus}
          style={amountInputStyle}
        />
      </Field>

      <Field label="בונוס שנתי (₪)" hint="לא חובה — מחושב כממוצע על פני 12 חודשים">
        <input
          type="number"
          inputMode="decimal"
          value={values.bonus}
          onChange={(e) => onChange({ ...values, bonus: e.target.value })}
          placeholder="0"
          style={textInputStyle}
        />
      </Field>

      <Field
        label="נקודות זיכוי"
        hint="תושב: 2.25 · אישה: 2.75 · ילד: 2 לכל ילד · הורה יחיד: 4.25"
      >
        <input
          type="number"
          inputMode="decimal"
          step="0.25"
          value={values.creditPoints}
          onChange={(e) => onChange({ ...values, creditPoints: e.target.value })}
          placeholder="2.25"
          style={textInputStyle}
        />
      </Field>
    </>
  );
}

function SectionLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 8, marginTop: 6 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--morning-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "var(--morning-subtle)",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--morning-ink)" }}>
        {label}
      </span>
      {hint && (
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--morning-muted)",
            marginTop: 2,
          }}
        >
          {hint}
        </span>
      )}
      <div style={{ marginTop: 6 }}>{children}</div>
    </label>
  );
}

const textInputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 14px",
  fontSize: 15,
  border: "1px solid var(--morning-border)",
  borderRadius: 12,
  background: "var(--morning-bg)",
  color: "var(--morning-ink)",
  outline: "none",
  fontVariantNumeric: "tabular-nums",
};

const amountInputStyle: React.CSSProperties = {
  ...textInputStyle,
  fontSize: 24,
  fontWeight: 800,
  textAlign: "end",
};
