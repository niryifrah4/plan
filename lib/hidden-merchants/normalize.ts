/**
 * ═══════════════════════════════════════════════════════════
 *  Hidden merchants — normalization
 * ═══════════════════════════════════════════════════════════
 *
 * The match key MUST equal the transform the unmapped queue and the legacy
 * `excluded-merchants` registry already use, so a decision made in either place
 * matches the same transactions:
 *
 *   normalizeSupplier(desc).toLowerCase()
 *     .replace(/["‏‎]/g, "")     // strip quotes + RTL/LTR marks
 *     .replace(/\s+/g, " ").trim()
 *
 * (No branch-number stripping here — unlike subscriptions — to stay byte-for-byte
 * compatible with the queue's existing `supplierKeyForExclude`.)
 *
 * Like subscriptions, every decision remembers the raw names it ever saw
 * (`aliases`), and new variants mapping to an existing key join it.
 */

import { normalizeSupplier } from "@/lib/doc-parser/normalizer";

export function hiddenMerchantKey(description: string): string {
  return normalizeSupplier(description || "")
    .toLowerCase()
    .replace(/["‏‎]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mergeAlias(aliases: string[], rawName: string): string[] {
  const clean = rawName.trim();
  if (!clean) return aliases;
  if (aliases.some((a) => a.toLowerCase() === clean.toLowerCase())) return aliases;
  return [...aliases, clean].slice(0, 50);
}
