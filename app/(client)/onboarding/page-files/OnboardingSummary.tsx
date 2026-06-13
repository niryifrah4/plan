"use client";

/**
 * Onboarding summary screen — shown when the questionnaire was ALREADY filled.
 *
 * Built 2026-06-13: previously, re-opening /onboarding (e.g. via the sidebar
 * "אפיון הלקוח" entry, or as an advisor impersonating a client) dropped the
 * user straight onto the welcome screen / empty-looking Step 1, even though the
 * data was already captured. This screen reads the persisted snapshot, reports
 * that the questionnaire is filled, shows a short recap, and offers a single
 * CTA into the full editable form.
 *
 * Completion is detected by the presence of meaningful user-entered data
 * (see isOnboardingFilled) — not a server stage flag — so it works identically
 * for clients and for advisors who entered via impersonation.
 */

import { n } from "./constants";
import type { AssetRow, Child, Fields, GoalRow, IncomeRow } from "./types";

/**
 * Heuristic: did the user actually fill the questionnaire?
 *
 * We deliberately ignore p1_name / p1_email / p1_phone — those are auto-seeded
 * from the CRM client card on first visit, so a fresh household would falsely
 * read as "filled" if we counted them. We look only at data a human must type.
 */
export function isOnboardingFilled(
  fields: Fields,
  children: Child[],
  assets: AssetRow[],
  goals: GoalRow[],
  incomes: IncomeRow[]
): boolean {
  if (children.length > 0) return true;
  if (incomes.some((r) => n(r.value || "0") > 0)) return true;
  if (assets.some((r) => n(r.value || "0") > 0)) return true;
  if (goals.some((r) => (r.name || "").trim().length > 0)) return true;

  // A handful of Step 1 / Step 5 fields that are never auto-prefilled.
  const manualKeys = [
    "p1_dob",
    "p1_id",
    "marital",
    "address",
    "p2_name",
    "p2_dob",
    "r_target_age",
  ];
  return manualKeys.some((k) => (fields[k] || "").trim().length > 0);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface Stat {
  icon: string;
  label: string;
  value: string;
}

interface Props {
  fields: Fields;
  children: Child[];
  assets: AssetRow[];
  goals: GoalRow[];
  incomes: IncomeRow[];
  lastUpdated: string | null;
  familyName?: string;
  onEdit: () => void;
}

export function OnboardingSummary({
  fields,
  children,
  assets,
  goals,
  incomes,
  lastUpdated,
  familyName,
  onEdit,
}: Props) {
  const monthlyIncome = incomes.reduce((sum, r) => sum + n(r.value || "0"), 0);
  const assetCount = assets.filter((r) => n(r.value || "0") > 0).length;
  const goalCount = goals.filter((r) => (r.name || "").trim().length > 0).length;
  const partners = (fields.p2_name || "").trim().length > 0 ? 2 : 1;

  const stats: Stat[] = [
    { icon: "groups", label: "בני משפחה", value: String(partners + children.length) },
    { icon: "child_care", label: "ילדים", value: String(children.length) },
    {
      icon: "payments",
      label: "הכנסה חודשית",
      value: monthlyIncome > 0 ? `₪${monthlyIncome.toLocaleString("he-IL")}` : "—",
    },
    { icon: "account_balance", label: "נכסים", value: String(assetCount) },
    { icon: "flag", label: "יעדים", value: String(goalCount) },
  ];

  const dateLabel = formatDate(lastUpdated);
  const displayName = (fields.p1_name || familyName || "").trim();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12" dir="rtl">
      <div
        className="rounded-2xl p-6 md:p-10"
        style={{ background: "#FFFFFF", border: "1px solid var(--morning-leaf-tint, #e5e9dc)" }}
      >
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
          >
            <span
              className="material-symbols-outlined text-[28px]"
              style={{ color: "var(--morning-forest, #2c7a5a)" }}
            >
              task_alt
            </span>
          </div>
          <h1
            className="mb-3 text-2xl font-extrabold md:text-3xl"
            style={{ color: "var(--morning-ink, #1a1a1a)" }}
          >
            {displayName ? `שאלון האפיון של ${displayName} מולא` : "שאלון האפיון כבר מולא"}
          </h1>
          <p
            className="mx-auto max-w-xl text-[14px] leading-relaxed md:text-[15px]"
            style={{ color: "var(--morning-muted, #6b7b5e)" }}
          >
            {dateLabel
              ? `הנתונים נשמרו ועודכנו לאחרונה ב-${dateLabel}.`
              : "הנתונים נשמרו במערכת."}
            <br />
            כדי לשנות פרט כלשהו, אפשר לפתוח את האפיון המלא לעריכה.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-xl px-3 py-3"
              style={{ background: "#FAFAF7" }}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ color: "var(--morning-forest, #2c7a5a)" }}
              >
                {s.icon}
              </span>
              <div>
                <div
                  className="text-[16px] font-extrabold"
                  style={{ color: "var(--morning-ink, #1a1a1a)" }}
                >
                  {s.value}
                </div>
                <div
                  className="text-[12px]"
                  style={{ color: "var(--morning-muted, #6b7b5e)" }}
                >
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-center text-[15px] font-extrabold transition-opacity hover:opacity-90 md:text-[16px]"
          style={{ background: "var(--morning-forest, #2c7a5a)", color: "#FFFFFF", minHeight: 48 }}
        >
          <span className="material-symbols-outlined text-[20px]">edit</span>
          עריכת האפיון המלא
        </button>
      </div>
    </div>
  );
}
