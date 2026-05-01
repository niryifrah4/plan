/**
 * ═══════════════════════════════════════════════════════════
 *  shared — pure TS core shared between plan-app (web) and mobile
 * ═══════════════════════════════════════════════════════════
 *
 * This is the brain of Plan. No React, no window, no storage.
 * Adapters for localStorage (web) and AsyncStorage (mobile) live
 * in each app and wrap these pure functions.
 */

export * from "./buckets-core";
export * from "./buckets-rebalancing";
export * from "./financial-math";
export * from "./format";
