/**
 * ═══════════════════════════════════════════════════════════
 *  Onboarding → Supabase persistence
 * ═══════════════════════════════════════════════════════════
 *
 * The onboarding questionnaire is the single richest piece of
 * raw data the advisor collects about a household. Keeping it
 * localStorage-only means switching browsers wipes everything —
 * unacceptable for an advisor-led workflow where the CRM user
 * opens the client's screens from a different machine.
 *
 * Strategy: snapshot ALL onboarding keys into one JSONB blob
 * under `client_state.state_key = 'onboarding_snapshot'`. One
 * row per household, overwritten on every save. Simpler than
 * one row per key, and atomic.
 *
 * Hydrate runs ONCE at onboarding page mount: pulls the blob,
 * writes each key to localStorage BEFORE usePersistedState
 * initializes. If there's a pending local version (savedAt
 * newer than remote), local wins — protects against stomping
 * in-progress edits when the page re-hydrates.
 */

import { pullBlob, pushBlobInBackground } from "./sync/blob-sync";
import { scopedKey } from "./client-scope";

const BLOB_KEY = "onboarding_snapshot";

/* Keys that make up the onboarding snapshot. */
const KEYS = [
  "verdant:onboarding:step",
  "verdant:onboarding:fields",
  "verdant:onboarding:children",
  "verdant:onboarding:assets",
  "verdant:onboarding:liabilities",
  "verdant:onboarding:insurance",
  "verdant:onboarding:goals",
  "verdant:onboarding:planner_notes",
] as const;

interface OnboardingBlob {
  savedAt: string;
  data: Record<string, string>; // raw stringified JSON per key
}

/** Build a snapshot from localStorage. Returns null if nothing exists. */
function readLocalSnapshot(): OnboardingBlob | null {
  if (typeof window === "undefined") return null;
  const data: Record<string, string> = {};
  let hasAny = false;
  for (const k of KEYS) {
    const raw = localStorage.getItem(scopedKey(k)) ?? localStorage.getItem(k);
    if (raw !== null) {
      data[k] = raw;
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return { savedAt: new Date().toISOString(), data };
}

/** Fire-and-forget push of the current onboarding state to Supabase. */
export function pushOnboardingSnapshot(): void {
  const snap = readLocalSnapshot();
  if (!snap) return;
  pushBlobInBackground(BLOB_KEY, snap);
}

/**
 * Hydrate localStorage from Supabase, if remote exists and local is empty
 * or older. Must be awaited BEFORE `usePersistedState` reads localStorage,
 * so call it from a guard effect that blocks rendering of the form.
 *
 * Returns `true` if any keys were written (caller may want to force a reload
 * so usePersistedState re-reads), `false` otherwise.
 */
export async function hydrateOnboardingFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const remote = await pullBlob<OnboardingBlob>(BLOB_KEY);
  if (!remote || !remote.data) return false;

  const local = readLocalSnapshot();
  // If local exists and is newer, don't clobber in-flight edits.
  if (local && local.savedAt > remote.savedAt) return false;

  let wrote = false;
  for (const [k, v] of Object.entries(remote.data)) {
    try {
      localStorage.setItem(scopedKey(k), v);
      wrote = true;
    } catch {}
  }
  return wrote;
}
