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
import { needsMappingAttention } from "@/lib/documents-categories";
import { buildExcludedSet, EXCLUDED_EVENT } from "@/lib/doc-parser/excluded-merchants";
import { onSync } from "@/lib/sync-engine";

export function useUnmappedCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const compute = () => {
      try {
        const txs = loadParsedTransactions();
        const excludedSet = buildExcludedSet();
        setCount(txs.filter((t) => needsMappingAttention(t, excludedSet)).length);
      } catch {
        setCount(0);
      }
    };
    compute();
    const unsub = onSync("verdant:docs:updated", compute);
    window.addEventListener("verdant:parsed_transactions:updated", compute);
    window.addEventListener(EXCLUDED_EVENT, compute);
    window.addEventListener("storage", compute);
    return () => {
      unsub();
      window.removeEventListener("verdant:parsed_transactions:updated", compute);
      window.removeEventListener(EXCLUDED_EVENT, compute);
      window.removeEventListener("storage", compute);
    };
  }, []);

  return count;
}
