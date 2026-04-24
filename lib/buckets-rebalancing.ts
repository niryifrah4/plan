/**
 * Re-export from shared/ so existing `@/lib/buckets-rebalancing` imports
 * keep working. The real engine lives in shared/buckets-rebalancing.ts
 * and is reused by the mobile app.
 */
export * from "@shared/buckets-rebalancing";
