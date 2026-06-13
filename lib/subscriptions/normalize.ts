/**
 * ═══════════════════════════════════════════════════════════
 *  Subscriptions — merchant normalization
 * ═══════════════════════════════════════════════════════════
 *
 * A "subscription decision" (per-client or system catalog) is keyed by a
 * normalized merchant key, NOT the raw text. This collapses every variant of
 * a merchant ("שופרסל סניף 42", "שופרסל אקספרס") onto one decision.
 *
 * Per Nir's requirement: normalization must *remember* every raw name it ever
 * saw for a key (the `aliases`), and new variants that map to an existing key
 * simply join it. Both stores persist the alias list alongside the key.
 *
 * The key is built on top of the parser's existing `normalizeSupplier` (which
 * already merges known brand variants) plus a light cleanup of branch numbers
 * and reference digits, mirroring the recurring-radar normalization.
 */

import { normalizeSupplier } from "@/lib/doc-parser/normalizer";

/** Build the stable match key for a merchant description. */
export function subscriptionKey(description: string): string {
  const canonical = normalizeSupplier(description);
  return canonical
    .toLowerCase()
    .replace(/[‏‎"']/g, "")
    .replace(/\s*(סניף|branch|#|מס['']?|snif)\s*\d+.*$/i, "")
    .replace(/\s*\d{3,}.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Merge a new raw name into an existing alias list (dedup, capped, trimmed). */
export function mergeAlias(aliases: string[], rawName: string): string[] {
  const clean = rawName.trim();
  if (!clean) return aliases;
  if (aliases.some((a) => a.toLowerCase() === clean.toLowerCase())) return aliases;
  return [...aliases, clean].slice(0, 50);
}
