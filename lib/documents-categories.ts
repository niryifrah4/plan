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
