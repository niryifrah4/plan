"use client";

/**
 * useAssumptions — reactive hook that returns the current global assumptions
 * and re-renders whenever they change (cross-tab via `storage` event, same-tab
 * via the custom `verdant:assumptions` event dispatched by saveAssumptions).
 *
 * SSR-safe: initial value is the default-merged snapshot from loadAssumptions
 * (which itself guards typeof window).
 */

import { useEffect, useState } from "react";
import { loadAssumptions, type Assumptions } from "@/lib/assumptions";

export function useAssumptions(): Assumptions {
  const [a, setA] = useState<Assumptions>(() => loadAssumptions());

  useEffect(() => {
    const reload = () => setA(loadAssumptions());
    // Same-tab updates
    window.addEventListener("verdant:assumptions", reload);
    // Cross-tab updates
    window.addEventListener("storage", reload);
    // Re-read once on mount in case localStorage changed before hydration
    reload();
    return () => {
      window.removeEventListener("verdant:assumptions", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  return a;
}
