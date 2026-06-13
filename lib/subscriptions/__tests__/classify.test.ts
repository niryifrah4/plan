/**
 * Subscriptions — precedence + normalization tests.
 * Run: npx tsx lib/subscriptions/__tests__/classify.test.ts
 */

import { subscriptionKey, mergeAlias } from "../normalize";
import {
  classifySubscription,
  classifySubscriptionForTransaction,
} from "../classify";
import type { CatalogMerchant, SubscriptionOverride } from "../types";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(
      `  ❌ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

const override = (
  key: string,
  decision: "subscription" | "not_subscription",
  appliesToPast = true,
  updatedAt = "2026-06-01T00:00:00.000Z"
): SubscriptionOverride => ({
  normalizedKey: key,
  aliases: [key],
  decision,
  label: key,
  appliesToPast,
  updatedAt,
});

const catalog = (key: string, isSub = true): CatalogMerchant => ({
  normalizedKey: key,
  aliases: [key],
  isSubscription: isSub,
  label: key,
});

console.log("\n═══ 1. Normalization key ═══");
assert(
  "branch variants collapse to same key",
  subscriptionKey("שופרסל סניף 42") === subscriptionKey("שופרסל אקספרס"),
  true
);
assert("empty stays empty", subscriptionKey("   "), "");

console.log("\n═══ 2. mergeAlias remembers names ═══");
assert(
  "adds new alias",
  mergeAlias(["שופרסל אקספרס"], "שופרסל סניף 42"),
  ["שופרסל אקספרס", "שופרסל סניף 42"]
);
assert(
  "dedups case-insensitively",
  mergeAlias(["Netflix"], "netflix"),
  ["Netflix"]
);

console.log("\n═══ 3. Precedence: client > catalog > auto ═══");
const key = subscriptionKey("נטפליקס");

assert(
  "client 'not' beats catalog 'yes'",
  classifySubscription("נטפליקס", {
    overrides: [override(key, "not_subscription")],
    catalog: [catalog(key, true)],
  }),
  false
);
assert(
  "catalog decides when no override",
  classifySubscription("נטפליקס", {
    overrides: [],
    catalog: [catalog(key, true)],
  }),
  true
);
assert(
  "unknown → null (auto-detect)",
  classifySubscription("נטפליקס", { overrides: [], catalog: [] }),
  null
);
assert(
  "client 'yes' beats catalog absence",
  classifySubscription("נטפליקס", {
    overrides: [override(key, "subscription")],
    catalog: [],
  }),
  true
);

console.log("\n═══ 4. appliesToPast against tx date ═══");
const ov = [override(key, "subscription", false, "2026-06-01T00:00:00.000Z")];
assert(
  "past tx ignored when appliesToPast=false → falls to catalog",
  classifySubscriptionForTransaction("נטפליקס", "2026-05-15", {
    overrides: ov,
    catalog: [catalog(key, true)],
  }),
  true // catalog says yes
);
assert(
  "past tx with no catalog → null",
  classifySubscriptionForTransaction("נטפליקס", "2026-05-15", {
    overrides: ov,
    catalog: [],
  }),
  null
);
assert(
  "future tx honoured when appliesToPast=false",
  classifySubscriptionForTransaction("נטפליקס", "2026-06-10", {
    overrides: ov,
    catalog: [],
  }),
  true
);
assert(
  "appliesToPast=true covers old tx",
  classifySubscriptionForTransaction("נטפליקס", "2020-01-01", {
    overrides: [override(key, "subscription", true)],
    catalog: [],
  }),
  true
);

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) process.exit(1);
