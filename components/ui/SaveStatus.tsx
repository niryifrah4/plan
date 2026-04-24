"use client";

import type { SaveStatus as SaveStatusValue } from "@/lib/hooks/useSaveStatus";

/**
 * Tiny visual indicator: "שומר..." (grey, pulsing) → "נשמר" (green ✓) → hidden.
 * Pair with `useSaveStatus()` hook. Matches the existing budget-page style.
 */
export function SaveStatus({ status }: { status: SaveStatusValue }) {
  if (status === "idle") return null;
  const isSaving = status === "saving";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold ${isSaving ? "text-botanical-sage" : "text-botanical-forest"}`}
      aria-live="polite"
    >
      <span
        className={`material-symbols-outlined text-[14px] ${isSaving ? "animate-pulse" : ""}`}
      >
        {isSaving ? "cloud_sync" : "cloud_done"}
      </span>
      {isSaving ? "שומר..." : "נשמר"}
    </span>
  );
}
