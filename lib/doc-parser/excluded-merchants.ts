/**
 * ═══════════════════════════════════════════════════════════
 *  Excluded Merchants — "always ignore X" registry
 * ═══════════════════════════════════════════════════════════
 *
 * Inspired by Spent's `excluded_merchants` table. The user marks a merchant
 * once (e.g. Bit, PayBox, "העברה בית-לבית"); from then on, transactions from
 * that merchant are filtered out of the cashflow + the unmapped queue, but
 * kept in storage for full provenance.
 *
 * Use cases for Nir's typical client:
 *   - Bit / PayBox / Pepper transfers between family members
 *   - Loan repayments back to a parent
 *   - Specific spouse-to-spouse pocket transfers
 *
 * Storage: localStorage, scoped per household. Match logic uses the same
 * `normalizeSupplier()` normalization the rest of the parser uses so a
 * single click covers all variants of the merchant name.
 */

import { scopedKey } from "../client-scope";
import { normalizeSupplier } from "./normalizer";

const STORAGE_KEY = "verdant:excluded_merchants";
export const EXCLUDED_EVENT = "verdant:excluded_merchants:updated";

export interface ExcludedMerchant {
  /** Normalized supplier key — what we match against. */
  normalizedKey: string;
  /** A descriptive sample so the user knows what they excluded. */
  displaySample: string;
  /** ISO timestamp of the exclusion. */
  addedAt: string;
  /** Free-text reason (optional). */
  reason?: string;
}

function normalize(desc: string): string {
  return normalizeSupplier(desc)
    .toLowerCase()
    .replace(/["\u200F\u200E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadExcludedMerchants(): ExcludedMerchant[] {
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

function saveExcludedMerchants(items: ExcludedMerchant[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(items));
    window.dispatchEvent(new Event(EXCLUDED_EVENT));
  } catch {}
}

/**
 * Add a merchant to the exclude list. Uses the normalized form as the key,
 * so "שופרסל סניף 42" and "שופרסל אקספרס" collapse into one entry.
 */
export function excludeMerchant(description: string, reason?: string): void {
  const key = normalize(description);
  if (!key) return;
  const current = loadExcludedMerchants();
  if (current.some((m) => m.normalizedKey === key)) return; // already excluded
  current.push({
    normalizedKey: key,
    displaySample: description.trim().slice(0, 60),
    addedAt: new Date().toISOString(),
    reason,
  });
  saveExcludedMerchants(current);
}

export function unexcludeMerchant(normalizedKey: string): void {
  const current = loadExcludedMerchants();
  const filtered = current.filter((m) => m.normalizedKey !== normalizedKey);
  if (filtered.length !== current.length) saveExcludedMerchants(filtered);
}

/** Returns true if the given description matches any excluded merchant. */
export function isExcluded(description: string): boolean {
  const key = normalize(description);
  if (!key) return false;
  const set = new Set(loadExcludedMerchants().map((m) => m.normalizedKey));
  return set.has(key);
}

/** Build a Set once per render for cheap repeated lookups. */
export function buildExcludedSet(): Set<string> {
  return new Set(loadExcludedMerchants().map((m) => m.normalizedKey));
}

/** Test a description against a pre-built Set. */
export function isExcludedIn(set: Set<string>, description: string): boolean {
  return set.has(normalize(description));
}
