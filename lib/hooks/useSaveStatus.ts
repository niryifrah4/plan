"use client";

import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved";

/**
 * useSaveStatus — shared hook for "saving / saved ✓" feedback across the app.
 *
 * Usage:
 *   const { status, pulse } = useSaveStatus();
 *   // on every user change:
 *   pulse();  // triggers "saving" → "saved" → "idle" sequence
 *   // render <SaveStatus status={status} /> somewhere in the header
 *
 * The pulse() function is idempotent and debounce-friendly — rapid calls
 * keep the indicator in "saving" state until input settles, then briefly
 * show "saved" before returning to idle.
 */
export function useSaveStatus(options?: { savedMs?: number }) {
  const savedMs = options?.savedMs ?? 1500;
  const [status, setStatus] = useState<SaveStatus>("idle");
  const savingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pulse = useCallback(() => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (savingTimer.current) clearTimeout(savingTimer.current);
    setStatus("saving");
    // short delay to show the "saving" state; actual localStorage write
    // should happen synchronously in the caller — this is purely visual.
    savingTimer.current = setTimeout(() => {
      setStatus("saved");
      savedTimer.current = setTimeout(() => setStatus("idle"), savedMs);
    }, 250);
  }, [savedMs]);

  return { status, pulse };
}
