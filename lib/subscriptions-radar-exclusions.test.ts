import {
  buildSubscriptionRadarSignature,
  excludeSubscriptionRadarGroup,
  isSubscriptionRadarExcluded,
  loadSubscriptionRadarExclusions,
  saveSubscriptionRadarExclusions,
  type SubscriptionRadarExclusion,
} from "./subscriptions-radar-exclusions";
import type { RecurringGroup } from "./doc-parser/recurring";

const store = new Map<string, string>();

const localStorageStub = {
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string) {
    store.set(key, String(value));
  },
  removeItem(key: string) {
    store.delete(key);
  },
  clear() {
    store.clear();
  },
  key(index: number) {
    return Array.from(store.keys())[index] ?? null;
  },
  get length() {
    return store.size;
  },
};

// Minimal browser shims for the store helpers.
(globalThis as any).window = { dispatchEvent() {} };
(globalThis as any).localStorage = localStorageStub;

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

console.log("\n═══ Subscriptions Radar Exclusions ═══");

const sigA = buildSubscriptionRadarSignature("Netflix 123", 49.9);
const sigB = buildSubscriptionRadarSignature("Netflix 999", 50.1);
assert("normalizes description", sigA.normalizedDescription, "netflix");
assert("stable signature bucket", sigA.signature, sigB.signature);

const sampleGroup: RecurringGroup = {
  description: "Netflix",
  amount: 49.9,
  category: "leisure",
  categoryLabel: "פנאי",
  frequency: "monthly",
  dayOfMonth: 15,
  matchCount: 3,
  occurrences: ["2024-01-15", "2024-02-15", "2024-03-15"],
};
const altGroup: RecurringGroup = {
  ...sampleGroup,
  description: "Netflix 987654",
  amount: 50.2,
};
const unrelatedGroup: RecurringGroup = {
  ...sampleGroup,
  description: "Spotify",
  amount: 49.9,
};

const seeded: SubscriptionRadarExclusion[] = saveSubscriptionRadarExclusions([sigA]);
assert("saved exclusion round-trips", loadSubscriptionRadarExclusions(), seeded);
assert("excluded group matches", isSubscriptionRadarExcluded(sampleGroup, seeded), true);
assert("future variant still matches", isSubscriptionRadarExcluded(altGroup, seeded), true);
assert("unrelated group stays visible", isSubscriptionRadarExcluded(unrelatedGroup, seeded), false);

const afterDedup = excludeSubscriptionRadarGroup(sampleGroup);
assert("duplicate click does not add another row", afterDedup.length, 1);

if (failed > 0) process.exit(1);

console.log(`\nPassed: ${passed}  Failed: ${failed}`);
