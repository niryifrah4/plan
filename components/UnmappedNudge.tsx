"use client";

/**
 * UnmappedNudge — dashboard widget that surfaces uncategorized transactions
 * and one-click routes the user to the AI categorizer at /files.
 *
 * Hidden when count is 0 (nothing to do — no point cluttering the dashboard).
 * Threshold isn't tunable — even 1 unmapped tx is worth surfacing because
 * cashflow totals are skewed until it's categorized.
 *
 * Built 2026-05-25 to make the AI categorization feature discoverable.
 * Before this, the only entry-point was a tab inside /files that most
 * users never opened.
 */

import Link from "next/link";
import { useUnmappedCount } from "@/lib/hooks/useUnmappedCount";

export function UnmappedNudge() {
  const count = useUnmappedCount();

  if (count === 0) return null;

  return (
    <Link
      href="/files"
      dir="rtl"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition-opacity hover:opacity-90"
      style={{
        background: "linear-gradient(90deg, #7C3AED10, #7C3AED05)",
        border: "1px solid #7C3AED40",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "#7C3AED" }}
        >
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ color: "#FFFFFF" }}
            aria-hidden
          >
            auto_awesome
          </span>
        </div>
        <div>
          <div
            className="text-[14px] font-extrabold"
            style={{ color: "#5B21B6" }}
          >
            {count.toLocaleString("he-IL")} {count === 1 ? "תנועה ממתינה" : "תנועות ממתינות"} לסיווג
          </div>
          <div className="text-[12px]" style={{ color: "#7C3AED" }}>
            Claude יקטלג אותן אוטומטית — לחץ כדי לעבור לתור הפענוח
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1" style={{ color: "#5B21B6" }}>
        <span className="text-[12px] font-extrabold">סווג ב-AI</span>
        <span className="material-symbols-outlined text-[18px]" aria-hidden>
          arrow_back
        </span>
      </div>
    </Link>
  );
}
