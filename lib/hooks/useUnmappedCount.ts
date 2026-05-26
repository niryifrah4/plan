"use client";

/**
 * useUnmappedCount — counts parsed transactions that need user attention.
 *
 * "Needs attention" matches the UnmappedQueueTab definition:
 *   - category is "other" or "transfers" (strict unmapped)
 *   - confidence < 0.7 (soft — keyword guess wasn't confident)
 *
 * Reads from `loadParsedTransactions()` on mount + on `verdant:docs:updated`.
 * Cheap — runs over the in-memory array, no API calls.
 */

import { useEffect, useState } from "react";
import { loadParsedTransactions } from "@/lib/budget-import";
import { UNMAPPED_KEYS, CONFIDENCE_THRESHOLD } from "@/lib/documents-categories";
import { onSync } from "@/lib/sync-engine";

export function useUnmappedCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const compute = () => {
      try {
        const txs = loadParsedTransactions();
        let n = 0;
        for (const t of txs) {
          if (UNMAPPED_KEYS.has(t.category)) {
            n++;
          } else if (typeof t.confidence === "number" && t.confidence < CONFIDENCE_THRESHOLD) {
            n++;
          }
        }
        setCount(n);
      } catch {
        setCount(0);
      }
    };
    compute();
    const unsub = onSync("verdant:docs:updated", compute);
    window.addEventListener("storage", compute);
    return () => {
      unsub();
      window.removeEventListener("storage", compute);
    };
  }, []);

  return count;
}
