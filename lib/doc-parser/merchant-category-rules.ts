/**
 * Merchant Category Rules — shared "same business name, same category" cache.
 *
 * Source of truth: Supabase `merchant_category_votes` + `v_merchant_category_rules`.
 * This module keeps a fast local cache and syncs it from the server.
 */

import { scopedKey } from "../client-scope";
import { extractBitRecipient, normalizeSupplier } from "./normalizer";
import { reportError } from "@/lib/report-error";

const STORAGE_KEY = "verdant:merchant_category_rules";
const MIGRATED_KEY = "verdant:merchant_category_rules_migrated";
const API_PATH = "/api/merchant-category-rules";
export const MERCHANT_RULES_EVENT = "verdant:merchant_category_rules:updated";

export interface MerchantCategoryRule {
  merchantKey: string;
  categoryKey: string;
  count: number;
  firstSeenAt?: string;
  updatedAt: string;
  sampleDescription?: string;
}

let merchantRulesCache: MerchantCategoryRule[] | null = null;

function cleanText(value: string): string {
  return value
    .replace(/["\u200F\u200E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRule(item: unknown): MerchantCategoryRule | null {
  if (typeof item !== "object" || item === null) return null;
  const row = item as Record<string, unknown>;
  const merchantKey = cleanText(typeof row.merchantKey === "string" ? row.merchantKey : String(row.merchant_key || ""));
  const categoryKey = cleanText(typeof row.categoryKey === "string" ? row.categoryKey : String(row.category_key || ""));
  const count = Number(row.count);
  const updatedAt = typeof row.updatedAt === "string"
    ? row.updatedAt
    : typeof row.updated_at === "string"
      ? row.updated_at
      : new Date(0).toISOString();
  const firstSeenAt = typeof row.firstSeenAt === "string"
    ? row.firstSeenAt
    : typeof row.first_seen_at === "string"
      ? row.first_seen_at
      : undefined;
  const sampleDescription =
    typeof row.sampleDescription === "string"
      ? row.sampleDescription
      : typeof row.sample_description === "string"
        ? row.sample_description
        : undefined;

  if (!merchantKey || !categoryKey || !Number.isFinite(count)) return null;
  return {
    merchantKey: merchantKey.toLowerCase(),
    categoryKey: categoryKey.toLowerCase(),
    count,
    firstSeenAt,
    updatedAt,
    sampleDescription,
  };
}

function cloneRules(rules: MerchantCategoryRule[]): MerchantCategoryRule[] {
  return rules.map((rule) => ({ ...rule }));
}

function readRulesFromStorage(): MerchantCategoryRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRule).filter(Boolean) as MerchantCategoryRule[];
  } catch {
    return [];
  }
}

function writeRulesToStorage(rules: MerchantCategoryRule[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(rules));
  } catch (e) { reportError("doc-parser/merchant-category-rules", e); }
}

function dispatchRulesUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MERCHANT_RULES_EVENT));
}

function setCache(rules: MerchantCategoryRule[], persist = true): MerchantCategoryRule[] {
  const normalized = rules
    .map(normalizeRule)
    .filter(Boolean) as MerchantCategoryRule[];
  merchantRulesCache = cloneRules(normalized);
  if (persist) writeRulesToStorage(merchantRulesCache);
  dispatchRulesUpdated();
  return cloneRules(merchantRulesCache);
}

function getCachedRules(): MerchantCategoryRule[] {
  if (merchantRulesCache) return cloneRules(merchantRulesCache);
  const stored = readRulesFromStorage();
  merchantRulesCache = cloneRules(stored);
  return cloneRules(merchantRulesCache);
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
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

export function loadMerchantCategoryRules(): MerchantCategoryRule[] {
  return getCachedRules();
}

export function setMerchantCategoryRulesCache(rules: MerchantCategoryRule[], persist = true): MerchantCategoryRule[] {
  return setCache(rules, persist);
}

export function clearMerchantCategoryRulesCache(): void {
  merchantRulesCache = null;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopedKey(STORAGE_KEY));
  } catch (e) { reportError("doc-parser/merchant-category-rules", e); }
}

export function findMerchantCategoryRule(
  description: string,
  rules = getCachedRules()
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

async function refreshMerchantCategoryRulesFromServer(
  force = false
): Promise<MerchantCategoryRule[]> {
  if (typeof window === "undefined") {
    return getCachedRules();
  }
  if (!force && merchantRulesCache) {
    return cloneRules(merchantRulesCache);
  }

  try {
    const response = await fetch(API_PATH, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !Array.isArray(payload.rules)) {
      return getCachedRules();
    }
    return setCache(payload.rules as MerchantCategoryRule[]);
  } catch {
    return getCachedRules();
  }
}

async function migrateLegacyLocalRulesToRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const migrated = localStorage.getItem(scopedKey(MIGRATED_KEY)) === "true";
  if (migrated) return false;

  const localRules = readRulesFromStorage();
  if (localRules.length === 0) {
    try {
      localStorage.setItem(scopedKey(MIGRATED_KEY), "true");
    } catch (e) { reportError("doc-parser/merchant-category-rules", e); }
    return false;
  }

  const votes = localRules.map((rule) => ({
    merchantKey: rule.merchantKey,
    categoryKey: rule.categoryKey,
    txCount: rule.count,
    sampleDescription: rule.sampleDescription,
  }));

  try {
    const result = await postJson(API_PATH, { votes, migrateLegacy: true });
    if (!result.ok) return false;
    try {
      localStorage.setItem(scopedKey(MIGRATED_KEY), "true");
    } catch (e) { reportError("doc-parser/merchant-category-rules", e); }
    await refreshMerchantCategoryRulesFromServer(true);
    return true;
  } catch {
    return false;
  }
}

export async function refreshMerchantCategoryRules(force = false): Promise<MerchantCategoryRule[]> {
  return refreshMerchantCategoryRulesFromServer(force);
}

export async function migrateLocalMerchantCategoryRulesToRemote(): Promise<boolean> {
  return migrateLegacyLocalRulesToRemote();
}

export async function learnMerchantCategory(
  description: string,
  categoryKey: string,
  txCount = 1
): Promise<MerchantCategoryRule | null> {
  return learnMerchantCategoryByKey(getMerchantKey(description), categoryKey, description, txCount);
}

export async function learnMerchantCategoryVotes(
  votes: Array<{
    merchantKey: string;
    categoryKey: string;
    sampleDescription?: string;
    txCount?: number;
  }>
): Promise<MerchantCategoryRule[]> {
  const normalizedVotes = votes
    .map((vote) => {
      const merchantKey = cleanText(vote.merchantKey).toLowerCase();
      const categoryKey = cleanText(vote.categoryKey).toLowerCase();
      const txCount = Math.max(1, Math.floor(Number(vote.txCount) || 1));
      if (!merchantKey || !categoryKey) return null;
      return {
        merchantKey,
        categoryKey,
        txCount,
        sampleDescription: vote.sampleDescription,
      };
    })
    .filter(Boolean) as Array<{
    merchantKey: string;
    categoryKey: string;
    txCount: number;
    sampleDescription?: string;
  }>;

  if (normalizedVotes.length === 0) {
    return getCachedRules();
  }

  await migrateLegacyLocalRulesToRemote();

  const result = await postJson(API_PATH, {
    votes: normalizedVotes,
  });

  if (!result.ok) {
    console.warn("[merchant-category-rules] bulk write failed:", result.status, result.data?.error ?? result.data);
    return getCachedRules();
  }

  return refreshMerchantCategoryRulesFromServer(true);
}

export async function learnMerchantCategoryByKey(
  merchantKey: string,
  categoryKey: string,
  sampleDescription?: string,
  txCount = 1
): Promise<MerchantCategoryRule | null> {
  const key = cleanText(merchantKey).toLowerCase();
  const cat = cleanText(categoryKey).toLowerCase();
  if (!key || !cat) return null;

  const refreshed = await learnMerchantCategoryVotes([
    { merchantKey: key, categoryKey: cat, txCount, sampleDescription },
  ]);
  return refreshed.find((rule) => rule.merchantKey === key) || null;
}

export function getMerchantCategoryKey(description: string): string | null {
  return findMerchantCategoryRule(description)?.categoryKey || null;
}
