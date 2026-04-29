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
 * Wipe non-localStorage browser data that might still hold prior-client
 * state — sessionStorage entries, Supabase auth tokens (IndexedDB), and
 * any non-essential cookies. Per 2026-04-28 security audit: shared advisor
 * tablets must not leak a previous client's session into the next one.
 */
async function wipeBrowserState(): Promise<void> {
  if (typeof window === "undefined") return;

  // sessionStorage — drop everything (we don't rely on session-scoped state).
  try { sessionStorage.clear(); } catch {}

  // IndexedDB — Supabase auth caches its session there. Best-effort.
  try {
    if ("indexedDB" in window && (indexedDB as any).databases) {
      const dbs = await (indexedDB as any).databases();
      for (const db of dbs || []) {
        if (db?.name) {
          try { indexedDB.deleteDatabase(db.name); } catch {}
        }
      }
    } else {
      // Older browsers — known names only.
      ["supabase-auth-token", "verdant-cache"].forEach(name => {
        try { indexedDB.deleteDatabase(name); } catch {}
      });
    }
  } catch {}

  // Supabase explicit sign-out (also kills the auth cookie).
  try {
    const { getSupabaseBrowser, isSupabaseConfigured } = await import("./supabase/browser");
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseBrowser();
      if (supabase) await supabase.auth.signOut();
    }
  } catch {}
}

/**
 * Manual on-demand reset: wipes everything + seeds a fresh empty client.
 * Use from a UI button. Fires FACTORY_RESET_EVENT so every live page reloads
 * its state, and also dispatches a `storage` event for good measure.
 */
/**
 * Synchronous reset — kept for back-compat with existing callers. Internally
 * delegates to manualFactoryResetAsync but returns immediately. Use the async
 * variant when you need to know the wipe finished before reloading.
 */
export function manualFactoryReset(): { wiped: number } {
  void manualFactoryResetAsync();
  // Best-effort sync count — counts what's already gone right now.
  return { wiped: 0 };
}

/**
 * Full reset 2026-04-29 — local + remote + auth.
 *
 * Sequence matters:
 *  1. Wipe Supabase blobs FIRST so any in-flight hydrate that fires during
 *     the wipe pulls "nothing" (vs. pulling stale data from server).
 *  2. Wipe localStorage (verdant:* keys).
 *  3. Wipe sessionStorage + IndexedDB + sign out.
 *  4. Seed a fresh empty client.
 *  5. Fire events for any live page that hasn't yet been navigated.
 *
 * Caller should `await` this and then reload the window so step 1's effect
 * (no remote rows for the household) takes hold on the next bootstrap.
 */
export async function manualFactoryResetAsync(): Promise<{ wiped: number; remoteDeleted: number }> {
  if (typeof window === "undefined") return { wiped: 0, remoteDeleted: 0 };

  // Step 1: wipe remote blobs BEFORE clearing local pointers to household.
  let remoteDeleted = 0;
  try {
    const { wipeAllBlobsForHousehold } = await import("./sync/blob-sync");
    const r = await wipeAllBlobsForHousehold();
    remoteDeleted = r.deleted;
  } catch (e) {
    console.warn("[factory-reset] remote blob wipe failed:", e);
  }

  // Step 2: wipe local
  const wiped = wipeAllVerdantKeys();

  // Step 3: wipe browser state + signOut (await — must finish before reload)
  await wipeBrowserState();

  // Step 4: seed a fresh empty client
  seedFreshClient();
  try {
    localStorage.setItem(VERSION_KEY, FACTORY_RESET_VERSION);
  } catch {}

  // Step 5: notify any live React tree
  try {
    window.dispatchEvent(new Event(FACTORY_RESET_EVENT));
    window.dispatchEvent(new Event("storage"));
  } catch {}

  return { wiped, remoteDeleted };
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
