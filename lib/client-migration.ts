/**
 * One-time migration: if legacy global keys exist but no client registry,
 * create a default "משק בית ראשון" client (id=1) and move every
 * `verdant:<subkey>` key → `verdant:c:1:<subkey>`.
 *
 * Idempotent — safe to call on every app load.
 */

import {
  CLIENTS_REGISTRY_KEY,
  CURRENT_HH_KEY,
} from "./client-scope";

const UNSCOPED_BASE = new Set<string>([
  CURRENT_HH_KEY,
  CLIENTS_REGISTRY_KEY,
  "verdant:last_activity",
]);

interface LocalClientShape {
  id: number;
  family: string;
  step: number;
  totalSteps: number;
  netWorth: number;
  trend: string;
  members: number;
  joined: string;
  docsUploaded: number;
  docsTotal: number;
  monthlyRevenue: number;
  riskProfile: string;
}

function defaultClient(): LocalClientShape {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: 1,
    family: "ראשון",
    step: 1,
    totalSteps: 3,
    netWorth: 0,
    trend: "+0%",
    members: 1,
    joined: today,
    docsUploaded: 0,
    docsTotal: 0,
    monthlyRevenue: 0,
    riskProfile: "מאוזן",
  };
}

function readRegistry(): LocalClientShape[] {
  try {
    const raw = localStorage.getItem(CLIENTS_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeRegistry(list: LocalClientShape[]) {
  try {
    localStorage.setItem(CLIENTS_REGISTRY_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Runs migration. Safe to call on every mount.
 * Returns true if migration performed work (or created default client).
 */
export function runClientMigration(): void {
  if (typeof window === "undefined") return;

  try {
    const currentHH = localStorage.getItem(CURRENT_HH_KEY);

    // Already migrated — make sure registry has an entry for current client.
    if (currentHH) {
      const registry = readRegistry();
      if (registry.length === 0) {
        const c = defaultClient();
        c.id = Number(currentHH) || 1;
        writeRegistry([c]);
      }
      return;
    }

    // Collect legacy keys: verdant:* that are not c:*, not registry, not current_hh, not last_activity.
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith("verdant:")) continue;
      if (k.startsWith("verdant:c:")) continue;
      if (UNSCOPED_BASE.has(k)) continue;
      legacyKeys.push(k);
    }

    // Create or reuse registry
    let registry = readRegistry();
    if (registry.length === 0) {
      registry = [defaultClient()];
      writeRegistry(registry);
    }
    const targetId = registry[0]?.id ?? 1;

    // Copy each legacy key → scoped key, then delete legacy.
    for (const key of legacyKeys) {
      try {
        const value = localStorage.getItem(key);
        if (value == null) continue;
        const sub = key.slice("verdant:".length);
        const scoped = `verdant:c:${targetId}:${sub}`;
        // Don't clobber existing scoped value
        if (localStorage.getItem(scoped) == null) {
          localStorage.setItem(scoped, value);
        }
        localStorage.removeItem(key);
      } catch {
        // leave key in place on any failure
      }
    }

    // Finally, set active client.
    localStorage.setItem(CURRENT_HH_KEY, String(targetId));
  } catch (e) {
    console.warn("[client-migration] failed:", e);
  }
}
