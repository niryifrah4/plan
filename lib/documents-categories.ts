/**
 * Category options + triage thresholds for the document mapping UI.
 *
 * Derived from the canonical CATEGORIES list in `doc-parser/categorizer.ts`,
 * so adding a new category there flows automatically into the dropdown.
 * "other" is appended manually — it's the fallback for unrecognized merchants
 * and doesn't live in CATEGORIES.
 *
 * Shared by `DocumentsTab` (mapping station) and `UnmappedQueueTab` (triage queue).
 */

import { CATEGORIES } from "./doc-parser/categorizer";
import { normalizeSupplier } from "./doc-parser/normalizer";
import type { ParsedTransaction } from "./doc-parser/types";

export interface CatOption {
  key: string;
  label: string;
}

export const CAT_OPTIONS: CatOption[] = [
  ...CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
  { key: "other", label: "אחר" },
];

/** Categories considered "unmapped" — need manual triage. */
export const UNMAPPED_KEYS = new Set(["other", "transfers"]);

/** Transactions below this confidence get surfaced for review. */
export const CONFIDENCE_THRESHOLD = 0.7;

export function getMappingExcludeKey(description: string): string {
  return normalizeSupplier(description || "")
    .toLowerCase()
    .replace(/["\u200F\u200E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function needsMappingAttention(
  tx: ParsedTransaction,
  excludedSet?: Set<string>
): boolean {
  const isUnmapped = UNMAPPED_KEYS.has(tx.category);
  const isLowConfidence =
    typeof tx.confidence === "number" && tx.confidence < CONFIDENCE_THRESHOLD && !isUnmapped;
  if (!isUnmapped && !isLowConfidence) return false;

  if (excludedSet && excludedSet.has(getMappingExcludeKey(tx.description || ""))) {
    return false;
  }

  return true;
}
