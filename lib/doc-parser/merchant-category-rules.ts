/**
 * Merchant Category Rules — persistent "same business name, same category"
 *
 * This stores the user's manual choice per normalized merchant name so future
 * uploads can inherit the same category automatically.
 */

import { scopedKey } from "../client-scope";
import { extractBitRecipient, normalizeSupplier } from "./normalizer";

const STORAGE_KEY = "verdant:merchant_category_rules";
export const MERCHANT_RULES_EVENT = "verdant:merchant_category_rules:updated";

export interface MerchantCategoryRule {
  merchantKey: string;
  categoryKey: string;
  count: number;
  updatedAt: string;
  sampleDescription?: string;
}

function cleanText(value: string): string {
  return value
    .replace(/["\u200F\u200E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalized merchant identity used for grouping and persistent mapping.
 * Bit/PayBox rows are keyed by recipient so "ביט - דנה כהן" and
 * "BIT דנה כהן" collapse into one merchant.
 */
export function getMerchantKey(description: string): string {
  const raw = cleanText(description || "");
  if (!raw) return "_unknown_";

  const bitRecipient = extractBitRecipient(raw);
  if (bitRecipient) {
    const recipient = cleanText(bitRecipient).toLowerCase();
    return recipient ? `bit:${recipient}` : "_unknown_";
  }

  const normalized = cleanText(normalizeSupplier(raw)).toLowerCase();
  return normalized || "_unknown_";
}

export function getMerchantLabel(description: string): string {
  const key = getMerchantKey(description);
  if (key.startsWith("bit:")) {
    return `ביט · ${key.slice(4)}`;
  }
  return cleanText(normalizeSupplier(description || "")) || cleanText(description || "") || "—";
}

function readRules(): MerchantCategoryRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        merchantKey: typeof item?.merchantKey === "string" ? item.merchantKey : "",
        categoryKey: typeof item?.categoryKey === "string" ? item.categoryKey : "",
        count: typeof item?.count === "number" ? item.count : 0,
        updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : new Date(0).toISOString(),
        sampleDescription:
          typeof item?.sampleDescription === "string" ? item.sampleDescription : undefined,
      }))
      .filter((item) => item.merchantKey && item.categoryKey);
  } catch {
    return [];
  }
}

function writeRules(rules: MerchantCategoryRule[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(rules));
    window.dispatchEvent(new Event(MERCHANT_RULES_EVENT));
  } catch {}
}

export function loadMerchantCategoryRules(): MerchantCategoryRule[] {
  return readRules();
}

export function findMerchantCategoryRule(
  description: string,
  rules = readRules()
): MerchantCategoryRule | null {
  const merchantKey = getMerchantKey(description);
  return rules.find((rule) => rule.merchantKey === merchantKey) || null;
}

export function matchMerchantCategoryRule(
  description: string,
  rules: MerchantCategoryRule[]
): MerchantCategoryRule | null {
  const merchantKey = getMerchantKey(description);
  return rules.find((rule) => rule.merchantKey === merchantKey) || null;
}

export function learnMerchantCategory(description: string, categoryKey: string): MerchantCategoryRule | null {
  return learnMerchantCategoryByKey(getMerchantKey(description), categoryKey, description);
}

export function learnMerchantCategoryByKey(
  merchantKey: string,
  categoryKey: string,
  sampleDescription?: string
): MerchantCategoryRule | null {
  const key = cleanText(merchantKey).toLowerCase();
  const cat = cleanText(categoryKey).toLowerCase();
  if (!key || !cat) return null;

  const rules = readRules();
  const now = new Date().toISOString();
  const existing = rules.find((rule) => rule.merchantKey === key);
  if (existing) {
    if (existing.categoryKey === cat) {
      existing.count += 1;
    } else {
      existing.categoryKey = cat;
      existing.count = 1;
    }
    existing.updatedAt = now;
    if (sampleDescription) existing.sampleDescription = sampleDescription;
    writeRules(rules);
    return existing;
  }

  const next: MerchantCategoryRule = {
    merchantKey: key,
    categoryKey: cat,
    count: 1,
    updatedAt: now,
    sampleDescription,
  };
  rules.push(next);
  if (rules.length > 1000) {
    rules.sort((a, b) => b.count - a.count || b.updatedAt.localeCompare(a.updatedAt));
    rules.length = 1000;
  }
  writeRules(rules);
  return next;
}

export function getMerchantCategoryKey(description: string): string | null {
  return findMerchantCategoryRule(description)?.categoryKey || null;
}

