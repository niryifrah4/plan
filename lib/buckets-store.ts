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

const ONBOARDING_GOALS_KEY = "verdant:onboarding:goals";

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
      if (Array.isArray(parsed)) return parsed.filter((b) => !b.archived);
    }
  } catch {}

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
  } catch {}

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
  } catch {}

  return [];
}

/** Save buckets to storage and fire sync event */
export function saveBuckets(buckets: Bucket[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(BUCKETS_STORAGE_KEY), JSON.stringify(buckets));
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
