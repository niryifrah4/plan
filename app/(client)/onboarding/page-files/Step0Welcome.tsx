"use client";

/**
 * Step 0 — Welcome screen shown ONCE before the questionnaire.
 *
 * Built 2026-05-22 per product audit: couples landing on Step 1's 30+ fields
 * with no context were closing the tab. This screen sets expectations
 * (5 steps, ~5 minutes, privacy assurance) and gives a single forward CTA.
 *
 * Renders once per household, then `verdant:onboarding:welcome_seen` is set
 * and the screen is skipped on future visits.
 */

import { useCallback } from "react";
import { scopedKey } from "@/lib/client-scope";

const WELCOME_SEEN_KEY = "verdant:onboarding:welcome_seen";

const STEPS = [
  { n: 1, icon: "family_restroom", label: "המשפחה שלכם", desc: "שמות, גילים, ילדים" },
  { n: 2, icon: "savings", label: "המצב הכספי", desc: "הכנסות, נכסים, חובות" },
  { n: 3, icon: "shield", label: "ביטוחים", desc: "מה כיסוי וכמה זה עולה" },
  { n: 4, icon: "flag", label: "היעדים", desc: "לאן אתם רוצים להגיע" },
  { n: 5, icon: "elderly", label: "פרישה", desc: "התמונה של עוד 20-30 שנה" },
];

export function shouldShowWelcome(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !localStorage.getItem(scopedKey(WELCOME_SEEN_KEY));
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(WELCOME_SEEN_KEY), new Date().toISOString());
  } catch {}
}

interface Props {
  onStart: () => void;
  advisorName?: string;
}

export function Step0Welcome({ onStart, advisorName }: Props) {
  const handleStart = useCallback(() => {
    markWelcomeSeen();
    onStart();
  }, [onStart]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12" dir="rtl">
      <div
        className="rounded-2xl p-6 md:p-10"
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--morning-leaf-tint, #e5e9dc)",
        }}
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
              waving_hand
            </span>
          </div>
          <h1
            className="mb-3 text-2xl font-extrabold md:text-3xl"
            style={{ color: "var(--morning-ink, #1a1a1a)" }}
          >
            ברוכים הבאים — בואו נכיר אתכם
          </h1>
          <p
            className="mx-auto max-w-xl text-[14px] leading-relaxed md:text-[15px]"
            style={{ color: "var(--morning-muted, #6b7b5e)" }}
          >
            כדי {advisorName ? `ש${advisorName}` : "שהיועץ שלכם"} יוכל לבנות לכם תוכנית
            פיננסית מותאמת, אנחנו צריכים להכיר אתכם. זה לוקח כ-5 דקות.
            <br />
            <span className="text-[13px]" style={{ color: "var(--morning-muted, #6b7b5e)" }}>
              הנתונים שלכם נשלחים רק ליועץ — לא לאף גורם אחר.
            </span>
          </p>
        </div>

        <ol className="mb-8 space-y-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "#FAFAF7" }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
                style={{
                  background: "var(--morning-leaf-tint, #e5e9dc)",
                  color: "var(--morning-forest, #2c7a5a)",
                }}
              >
                {s.n}
              </div>
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ color: "var(--morning-forest, #2c7a5a)" }}
              >
                {s.icon}
              </span>
              <div className="flex-1">
                <div
                  className="text-[14px] font-extrabold md:text-[15px]"
                  style={{ color: "var(--morning-ink, #1a1a1a)" }}
                >
                  {s.label}
                </div>
                <div
                  className="text-[12px] md:text-[13px]"
                  style={{ color: "var(--morning-muted, #6b7b5e)" }}
                >
                  {s.desc}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={handleStart}
          className="block w-full rounded-xl py-3.5 text-center text-[15px] font-extrabold transition-opacity hover:opacity-90 md:text-[16px]"
          style={{
            background: "var(--morning-forest, #2c7a5a)",
            color: "#FFFFFF",
            minHeight: 48,
          }}
        >
          בואו נתחיל
        </button>

        <button
          type="button"
          onClick={handleStart}
          className="mt-3 block w-full text-center text-[12px] font-bold underline-offset-2 hover:underline"
          style={{ color: "var(--morning-muted, #6b7b5e)" }}
        >
          אני מעדיף לדלג עכשיו
        </button>
      </div>
    </div>
  );
}
