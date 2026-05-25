/**
 * ═══════════════════════════════════════════════════════════
 *  Correction History — every category change as a record
 * ═══════════════════════════════════════════════════════════
 *
 * Inspired by Spent's `category_corrections` table. Our existing
 * `learnOverride()` in categorizer.ts only stores `{pattern, category, count}`
 * — useful for the keyword matcher but we lose every other dimension:
 *   - which transaction caused the correction
 *   - when it happened
 *   - what the original guess was
 *   - was it the user or the AI re-categorizer
 *
 * This module keeps a proper audit trail. Two consumers:
 *   1. The AI categorizer — feeds the most recent corrections as learning
 *      examples in its prompt ("when you see X, the user has been saying Y")
 *   2. The advisor — can browse "what did the user change recently" to
 *      debug a sudden mis-categorization or roll one back.
 *
 * Storage: localStorage, scoped per household. Capped at 500 entries
 * (oldest dropped) so it doesn't grow unbounded.
 */

import { scopedKey } from "../client-scope";

const STORAGE_KEY = "verdant:category_corrections";
const MAX_ENTRIES = 500;

export type CorrectionSource = "user" | "ai_bulk" | "ai_auto";

export interface CategoryCorrection {
  /** ISO timestamp. */
  at: string;
  /** Transaction description that was corrected. */
  description: string;
  /** Category the system had before. */
  oldCategory: string;
  /** Category after correction. */
  newCategory: string;
  /** Who/what triggered the change. */
  source: CorrectionSource;
}

export function loadCorrections(): CategoryCorrection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCorrections(items: CategoryCorrection[]): void {
  if (typeof window === "undefined") return;
  try {
    // Cap from the newest end — drop oldest entries first.
    const trimmed = items.slice(-MAX_ENTRIES);
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(trimmed));
  } catch {}
}

/**
 * Record a correction. Idempotent for same-description + same-pair within
 * the last 5 seconds (prevents duplicate writes when both the keyword
 * matcher's `learnOverride` and the queue handler fire).
 */
export function recordCorrection(
  description: string,
  oldCategory: string,
  newCategory: string,
  source: CorrectionSource = "user"
): void {
  if (!description || oldCategory === newCategory) return;
  const existing = loadCorrections();

  // Dedupe: skip if the same transition was just recorded in the last 5s.
  const last = existing[existing.length - 1];
  if (
    last &&
    last.description === description &&
    last.oldCategory === oldCategory &&
    last.newCategory === newCategory &&
    Date.now() - new Date(last.at).getTime() < 5000
  ) {
    return;
  }

  existing.push({
    at: new Date().toISOString(),
    description,
    oldCategory,
    newCategory,
    source,
  });
  saveCorrections(existing);
}

/**
 * Returns the most recent N corrections, newest first.
 * Used by the AI categorizer prompt as learning examples.
 */
export function getRecentCorrections(limit = 30): CategoryCorrection[] {
  return loadCorrections().slice(-limit).reverse();
}

/** Wipe all correction history. Surfaced in settings as a "reset learning" action. */
export function clearCorrections(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopedKey(STORAGE_KEY));
  } catch {}
}
