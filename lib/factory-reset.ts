/**
 * One-shot factory reset.
 *
 * When FACTORY_RESET_VERSION is bumped, the next page load wipes every
 * localStorage key that starts with "verdant:" and then writes the new
 * version marker, so it only happens once per version.
 *
 * Also exposes a manual wipe + "soft reset" (keeps clients registry, wipes
 * all client data) for future UI use.
 */

const VERSION_KEY = "verdant:factory_reset_version";
/**
 * Bump this string to trigger a clean wipe on every browser on next load.
 * Previous: 2026-04-15-launch-clean → initial launch-readiness wipe.
 * Current:  2026-04-19-fresh-client → full wipe + seed one empty client.
 */
export const FACTORY_RESET_VERSION = "2026-04-19-zero-defaults";

export const FACTORY_RESET_EVENT = "verdant:factory-reset";

/** Seed a single empty client after a wipe so the user lands ready to work. */
function seedFreshClient(): void {
  if (typeof window === "undefined") return;
  try {
    const fresh = {
      id: 1,
      family: "לקוח חדש",
      step: 1,
      totalSteps: 3,
      netWorth: 0,
      trend: "+0%",
      members: 1,
      joined: new Date().toISOString().slice(0, 10),
      docsUploaded: 0,
      docsTotal: 0,
      monthlyRevenue: 0,
      riskProfile: "מאוזן",
    };
    localStorage.setItem("verdant:clients", JSON.stringify([fresh]));
    localStorage.setItem("verdant:current_hh", "1");
  } catch {}
}

/** Remove every verdant:* key from localStorage. Returns # of keys removed. */
export function wipeAllVerdantKeys(): number {
  if (typeof window === "undefined") return 0;
  let n = 0;
  try {
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("verdant:")) toDelete.push(k);
    }
    for (const k of toDelete) {
      localStorage.removeItem(k);
      n++;
    }
  } catch {}
  return n;
}

/**
 * Manual on-demand reset: wipes everything + seeds a fresh empty client.
 * Use from a UI button. Fires FACTORY_RESET_EVENT so every live page reloads
 * its state, and also dispatches a `storage` event for good measure.
 */
export function manualFactoryReset(): { wiped: number } {
  if (typeof window === "undefined") return { wiped: 0 };
  const n = wipeAllVerdantKeys();
  seedFreshClient();
  try {
    localStorage.setItem(VERSION_KEY, FACTORY_RESET_VERSION);
  } catch {}
  try {
    window.dispatchEvent(new Event(FACTORY_RESET_EVENT));
    window.dispatchEvent(new Event("storage"));
  } catch {}
  return { wiped: n };
}

/**
 * Called from the root layout on first client mount.
 * No-op unless the stored version differs from FACTORY_RESET_VERSION.
 */
export function runFactoryResetIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    // Check both global and scoped version keys (avoid double-wipe)
    const current = localStorage.getItem(VERSION_KEY);
    const scopedCurrent = (() => {
      // Check if any scoped key has the version
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.endsWith(":factory_reset_version")) {
          const v = localStorage.getItem(k);
          if (v === FACTORY_RESET_VERSION) return v;
        }
      }
      return null;
    })();
    if (current === FACTORY_RESET_VERSION || scopedCurrent === FACTORY_RESET_VERSION) {
      // Ensure global key exists (may have been wiped by previous bug)
      if (!current) localStorage.setItem(VERSION_KEY, FACTORY_RESET_VERSION);
      return;
    }
    wipeAllVerdantKeys();
    seedFreshClient();
    localStorage.setItem(VERSION_KEY, FACTORY_RESET_VERSION);
    // eslint-disable-next-line no-console
    console.info("[factory-reset] wiped all verdant:* keys + seeded fresh client →", FACTORY_RESET_VERSION);
  } catch {}
}
