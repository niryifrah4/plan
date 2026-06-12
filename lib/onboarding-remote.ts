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
import { reportError } from "@/lib/report-error";

const BLOB_KEY = "onboarding_snapshot";

/**
 * 2026-05-19: separate localStorage key tracking when the snapshot was last
 * pushed. The previous implementation set `savedAt = Date.now()` inside
 * `readLocalSnapshot()`, which broke multi-device sync — local was ALWAYS
 * "newer than" remote, so remote never won. The hydrate path silently lost.
 *
 * Now: this key is written by `pushOnboardingSnapshot()` with the actual push
 * time, and set to `remote.savedAt` after a successful hydrate. If the key
 * is absent (fresh browser), local has no provenance → remote wins.
 */
const SAVED_AT_KEY = "verdant:onboarding:savedAt";

/* Keys that make up the onboarding snapshot. */
const KEYS = [
  "verdant:onboarding:step",
  "verdant:onboarding:fields",
  "verdant:onboarding:children",
  "verdant:onboarding:assets",
  "verdant:onboarding:liabilities",
  "verdant:onboarding:insurance",
  "verdant:onboarding:goals",
  "verdant:onboarding:incomes",
  "verdant:onboarding:planner_notes",
] as const;

interface OnboardingBlob {
  savedAt: string;
  data: Record<string, string>; // raw stringified JSON per key
}

/** Read the persisted savedAt for this client. Null when never tracked. */
function readLocalSavedAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(scopedKey(SAVED_AT_KEY));
}

function writeLocalSavedAt(iso: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(SAVED_AT_KEY), iso);
  } catch (e) { reportError("onboarding-remote", e); }
}

function canReadLegacyOnboardingKeys(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Only actual client sessions use this rescue path. Advisor impersonation
    // must never fall back to unscoped keys because those may belong to a
    // previously viewed household.
    return (
      Boolean(localStorage.getItem("verdant:active_household_id")) &&
      !sessionStorage.getItem("verdant:last_impersonated")
    );
  } catch {
    return false;
  }
}

/**
 * Build a snapshot from localStorage. Returns null if no onboarding keys
 * are present at all. `savedAt` uses the persisted timestamp when known,
 * otherwise an empty string so the hydrate comparison treats local as
 * "no provenance" and lets remote win.
 */
function readLocalSnapshot(): OnboardingBlob | null {
  if (typeof window === "undefined") return null;
  const data: Record<string, string> = {};
  let hasAny = false;
  for (const k of KEYS) {
    // SECURITY: read STRICTLY from the tenant-scoped key. The previous
    // `?? localStorage.getItem(k)` fallback to the unscoped key was the
    // 2026-05-27 leak path: questionnaire data written under the unscoped
    // `verdant:onboarding:*` from pre-scoping code surfaced into every
    // tenant's view (family בסר saw family יפרח's children + assets).
    // Falling back to the unscoped key in any read path on a multi-tenant
    // surface is structurally a cross-tenant leak — never reintroduce it.
    const scoped = scopedKey(k);
    let raw = localStorage.getItem(scoped);
    if (raw === null && canReadLegacyOnboardingKeys()) {
      raw = localStorage.getItem(k);
      if (raw !== null && scoped !== k) {
        try {
          localStorage.setItem(scoped, raw);
        } catch (e) { reportError("onboarding-remote", e); }
      }
    }
    if (raw !== null) {
      data[k] = raw;
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return { savedAt: readLocalSavedAt() ?? "", data };
}

/** Fire-and-forget push of the current onboarding state to Supabase. */
export function pushOnboardingSnapshot(): void {
  const snap = readLocalSnapshot();
  if (!snap) return;
  // Stamp NOW as the canonical save time, both on the blob being pushed AND
  // on the localStorage key so future hydrate comparisons see the truth.
  const now = new Date().toISOString();
  snap.savedAt = now;
  writeLocalSavedAt(now);
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
  // If local exists and has a persisted savedAt that is newer or equal,
  // don't clobber in-flight edits and don't trigger a pointless reload loop.
  // Empty/missing local.savedAt means "no provenance" — let remote win,
  // even if local has stale data from a previous session.
  if (local && local.savedAt && local.savedAt >= remote.savedAt) return false;

  let wrote = false;
  for (const [k, v] of Object.entries(remote.data)) {
    try {
      localStorage.setItem(scopedKey(k), v);
      wrote = true;
    } catch (e) { reportError("onboarding-remote", e); }
  }
  // After successful hydrate, adopt the remote's savedAt so subsequent
  // comparisons reflect that local now matches remote.
  if (wrote) writeLocalSavedAt(remote.savedAt);
  return wrote;
}
