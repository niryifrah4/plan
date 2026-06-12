/**
 * Merchant-key exclusion registry.
 *
 * Stores normalized merchant keys so a user can say "never show this business
 * again" and the choice applies to future variations of the same merchant.
 */

import { scopedKey } from "../client-scope";
import { reportError } from "@/lib/report-error";

const STORAGE_KEY = "verdant:excluded_merchant_keys";
export const EXCLUDED_MERCHANT_KEYS_EVENT = "verdant:excluded_merchant_keys:updated";

function cleanKey(value: string): string {
  return value
    .replace(/["\u200F\u200E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeKeys(keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(keys));
    window.dispatchEvent(new Event(EXCLUDED_MERCHANT_KEYS_EVENT));
  } catch (e) { reportError("doc-parser/excluded-merchant-keys", e); }
}

export function loadExcludedMerchantKeys(): Set<string> {
  return new Set(readKeys().map(cleanKey));
}

export function excludeMerchantKey(merchantKey: string): void {
  const key = cleanKey(merchantKey);
  if (!key) return;
  const current = readKeys().map(cleanKey);
  if (current.includes(key)) return;
  current.push(key);
  writeKeys(current);
}

export function unexcludeMerchantKey(merchantKey: string): void {
  const key = cleanKey(merchantKey);
  if (!key) return;
  const current = readKeys().map(cleanKey);
  const filtered = current.filter((item) => item !== key);
  if (filtered.length !== current.length) writeKeys(filtered);
}

export function isMerchantKeyExcluded(merchantKey: string, set?: Set<string>): boolean {
  const key = cleanKey(merchantKey);
  if (!key) return false;
  const source = set || loadExcludedMerchantKeys();
  return source.has(key);
}

