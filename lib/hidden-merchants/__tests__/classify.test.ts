/**
 * Hidden merchants — precedence + effective-set tests.
 * Run: npx tsx lib/hidden-merchants/__tests__/classify.test.ts
 */

import { hiddenMerchantKey, mergeAlias } from "../normalize";
import { classifyHidden, buildEffectiveHiddenSet } from "../classify";
import type { HiddenCatalogMerchant, HiddenOverride } from "../types";

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

const ov = (key: string, decision: "hidden" | "visible"): HiddenOverride => ({
  normalizedKey: key,
  aliases: [key],
  decision,
  label: key,
  updatedAt: "2026-06-13T00:00:00.000Z",
});

const cat = (key: string, isHidden = true): HiddenCatalogMerchant => ({
  normalizedKey: key,
  aliases: [key],
  isHidden,
  label: key,
});

console.log("\n═══ 1. Normalization key ═══");
assert("non-empty produces key", hiddenMerchantKey("העברה עצמית") !== "", true);
assert("blank → empty", hiddenMerchantKey("   "), "");

console.log("\n═══ 2. mergeAlias ═══");
assert("adds alias", mergeAlias(["ביט"], "ביט העברה"), ["ביט", "ביט העברה"]);
assert("dedup case-insensitive", mergeAlias(["Bit"], "bit"), ["Bit"]);

console.log("\n═══ 3. Precedence: client > catalog > default ═══");
const k = hiddenMerchantKey("העברה עצמית");
assert(
  "client 'visible' beats catalog 'hidden'",
  classifyHidden("העברה עצמית", { overrides: [ov(k, "visible")], catalog: [cat(k, true)] }),
  false
);
assert(
  "catalog hides when no override",
  classifyHidden("העברה עצמית", { overrides: [], catalog: [cat(k, true)] }),
  true
);
assert(
  "unknown → null (visible)",
  classifyHidden("העברה עצמית", { overrides: [], catalog: [] }),
  null
);
assert(
  "client 'hidden' beats absence",
  classifyHidden("העברה עצמית", { overrides: [ov(k, "hidden")], catalog: [] }),
  true
);

console.log("\n═══ 4. buildEffectiveHiddenSet ═══");
const effA = buildEffectiveHiddenSet(
  { overrides: [], catalog: [cat(k, true)] },
  ["legacykey"]
);
assert("includes legacy extra key", effA.has("legacykey"), true);
assert("includes catalog hidden key", effA.has(k), true);

const effB = buildEffectiveHiddenSet(
  { overrides: [ov(k, "visible")], catalog: [cat(k, true)] },
  [k]
);
assert("client 'visible' removes key even if legacy+catalog hide it", effB.has(k), false);

const effC = buildEffectiveHiddenSet(
  { overrides: [ov("xkey", "hidden")], catalog: [] },
  []
);
assert("client 'hidden' adds key", effC.has("xkey"), true);

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) process.exit(1);
