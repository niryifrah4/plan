/**
 * ═══════════════════════════════════════════════════════════
 *  Buckets Store — web (plan-app) storage adapter
 * ═══════════════════════════════════════════════════════════
 *
 * The actual Bucket types, math, and CRUD helpers live in
 * `shared/buckets-core.ts` — shared with the mobile app.
 *
 * This file only handles the WEB-specific side:
 *   - localStorage load/save
 *   - window-event sync (verdant:goals:updated)
 *   - Legacy migration from old storage keys
 *
 * When Supabase comes online, `loadBuckets`/`saveBuckets` become
 * thin wrappers around supabase-js and everything else stays identical.
 */

import { safeSetItem } from "@/lib/safe-storage";
import {
  type Bucket,
  type BucketContribution,
  type BucketStatus,
  type BucketPriority,
  type BucketSnapshot,
  type LegacyVisionGoal,
  type OnboardingGoalRow,
  BUCKET_COLORS,
  BUCKETS_STORAGE_KEY,
  BUCKETS_LEGACY_KEY,
  BUCKETS_EVENT_NAME,
  pickColor,
  generateBucketId,
  migrateLegacyVisionGoals,
  migrateOnboardingGoals,
  createBucket,
  updateBucket,
  removeBucket,
  recordCheckIn,
  recordSnapshot,
  totalBucketBalance,
  totalBucketTarget,
  totalMonthlyContributions,
} from "@shared/buckets-core";
import { fireSync } from "./sync-engine";
import { scopedKey } from "./client-scope";
import { reportError } from "@/lib/report-error";

const ONBOARDING_GOALS_KEY = "verdant:onboarding:goals";

/**
 * Collapse duplicate buckets that share the same (name, targetDate).
 * Background: in May 2026 we saw a household with 4,745 auto-generated kids
 * goals — and even after the safety cap was added, some households still load
 * with 10+ identical "בר מצווה לX" entries when onboarding fan-out runs more
 * than once before refId dedup catches up. This collapses them on every load
 * so the UI never shows the duplicates, regardless of what's in storage.
 *
 * Dedupe rule: same `name.trim().toLowerCase()` + same `targetDate` → keep
 * the one with the highest `currentAmount` (preserves user progress), then
 * the most recent `updatedAt`. Other entries are dropped.
 */
function dedupeBuckets(buckets: Bucket[]): Bucket[] {
  const byKey = new Map<string, Bucket>();
  for (const b of buckets) {
    const key = `${(b.name || "").trim().toLowerCase()}|${b.targetDate || ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, b);
      continue;
    }
    const a = existing.currentAmount ?? 0;
    const c = b.currentAmount ?? 0;
    if (c > a) {
      byKey.set(key, b);
    } else if (c === a) {
      const aT = existing.updatedAt || existing.createdAt || "";
      const bT = b.updatedAt || b.createdAt || "";
      if (bT > aT) byKey.set(key, b);
    }
  }
  return Array.from(byKey.values());
}

/* ─── Re-export everything so existing `@/lib/buckets-store` imports keep working ─── */
export {
  BUCKET_COLORS,
  pickColor,
  createBucket,
  updateBucket,
  removeBucket,
  recordCheckIn,
  recordSnapshot,
  totalBucketBalance,
  totalBucketTarget,
  totalMonthlyContributions,
  migrateOnboardingGoals,
};
export type {
  Bucket,
  BucketContribution,
  BucketStatus,
  BucketPriority,
  BucketSnapshot,
  OnboardingGoalRow,
};
export const BUCKETS_EVENT = BUCKETS_EVENT_NAME;

/* ═══════════════════════════════════════════════════════════ */
/* Storage adapter — web-only                                    */
/* ═══════════════════════════════════════════════════════════ */

/** Load buckets from storage. Migrates from legacy on first read. */
export function loadBuckets(): Bucket[] {
  if (typeof window === "undefined") return [];

  // Try the new key first
  try {
    const raw = localStorage.getItem(scopedKey(BUCKETS_STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as Bucket[];
      if (Array.isArray(parsed)) {
        const active = parsed.filter((b) => !b.archived);
        const deduped = dedupeBuckets(active);
        // Self-heal: if dedup removed entries, re-save the clean list so
        // future reads (and downstream consumers like dashboard / forecast)
        // see the truth, not the dirty copy.
        if (deduped.length < active.length) {
          try {
            safeSetItem(scopedKey(BUCKETS_STORAGE_KEY), JSON.stringify(deduped));
          } catch (e) { reportError("buckets-store", e); }
        }
        return deduped;
      }
    }
  } catch (e) { reportError("buckets-store", e); }

  // Fall back to legacy and migrate
  try {
    const legacyRaw = localStorage.getItem(scopedKey(BUCKETS_LEGACY_KEY));
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as LegacyVisionGoal[];
      if (Array.isArray(legacy) && legacy.length > 0) {
        const migrated = migrateLegacyVisionGoals(legacy);
        saveBuckets(migrated);
        return migrated;
      }
    }
  } catch (e) { reportError("buckets-store", e); }

  // Try onboarding goals as last resort
  try {
    const onbRaw = localStorage.getItem(scopedKey(ONBOARDING_GOALS_KEY));
    if (onbRaw) {
      const rows = JSON.parse(onbRaw) as OnboardingGoalRow[];
      const mapped = migrateOnboardingGoals(rows);
      if (mapped.length > 0) {
        saveBuckets(mapped);
        return mapped;
      }
    }
  } catch (e) { reportError("buckets-store", e); }

  return [];
}

/** Save buckets to storage and fire sync event */
export function saveBuckets(buckets: Bucket[]): void {
  if (typeof window === "undefined") return;
  try {
    // Defense in depth: never persist duplicates, even if a caller passes a
    // dirty list. Paired with the dedup in `loadBuckets`, this guarantees the
    // storage never accumulates duplicate goals across sync runs.
    const clean = dedupeBuckets(buckets);
    safeSetItem(scopedKey(BUCKETS_STORAGE_KEY), JSON.stringify(clean));
    fireSync(BUCKETS_EVENT_NAME);
  } catch (err) {
    console.error("[buckets-store] save failed:", err);
  }
}

/** Check if we have any buckets at all (empty-state detection) */
export function hasBuckets(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(scopedKey(BUCKETS_STORAGE_KEY));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Bucket[];
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
