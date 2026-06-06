"use client";

import { Suspense, useEffect, useState } from "react";
import { ClientProvider } from "@/lib/client-context";
import { ImpersonationProvider } from "@/lib/impersonation-context";
import { ClientShell } from "./ClientShell";
import { runFactoryResetIfNeeded } from "@/lib/factory-reset";
import {
  bootstrapSessionOnce,
  watchRemoteHouseholdChanges,
  watchBootstrapAuthState,
} from "@/lib/sync/bootstrap";
import {
  CURRENT_HH_KEY,
  dispatchAllRefreshEvents,
  purgeLegacyScopedKeys,
  wipeForTenantSwitch,
} from "@/lib/client-scope";

interface Impersonation {
  householdId: string;
  familyName: string;
}

/**
 * Client-side wrapper — one-shot bootstrap + session sync.
 * When `impersonation` is set, we force the active household before
 * bootstrap runs so the advisor sees the client's data (not their own).
 */
export default function ClientLayoutInner({
  children,
  impersonation,
}: {
  children: React.ReactNode;
  impersonation: Impersonation | null;
}) {
  const [bootstrapReady, setBootstrapReady] = useState(false);
  // ═══════════════════════════════════════════════════════════
  // CRITICAL — RENDER-TIME SCOPE SYNC (2026-05-28)
  // ═══════════════════════════════════════════════════════════
  // React runs useEffect children-first. That means the Dashboard's
  // effects (which call `scopedKey()` to load debt/budget/pension data)
  // fire BEFORE this component's effects. If `verdant:active_household_id`
  // is stale (e.g. holds the previous tenant's UUID from yesterday's
  // session), the Dashboard reads that stale scope and renders the wrong
  // tenant's data — the exact "click yifrah, see beser" bug.
  //
  // Fix: plant the correct UUID in localStorage during render, before
  // children mount. Yes, side-effects in render are normally a smell.
  // This one is idempotent (only writes when current !== expected) and
  // required for correctness; nothing else satisfies the ordering
  // constraint that children's first read must see the new tenant.
  if (typeof window !== "undefined" && impersonation) {
    try {
      const current = localStorage.getItem("verdant:active_household_id");
      if (current !== impersonation.householdId) {
        localStorage.setItem("verdant:active_household_id", impersonation.householdId);
        // Defensive: kill any numeric current_hh that could route scopedKey
        // back through the legacy `verdant:c:<digit>:*` namespace.
        localStorage.removeItem(CURRENT_HH_KEY);
      }
    } catch {}
  }

  useEffect(() => {
    runFactoryResetIfNeeded();
    // One-time legacy purge per browser tab. Catches the case where the
    // user lands on the dashboard with active_household_id already set
    // (e.g. via a deep link) — the impersonation-switch effect below
    // would skip its purge because last === current, leaving legacy
    // `verdant:c:<digit>:*` keys in place.
    try {
      const PURGE_FLAG = "verdant:legacy_purge_done";
      if (sessionStorage.getItem(PURGE_FLAG) !== "1") {
        const removed = purgeLegacyScopedKeys();
        if (removed > 0) {
          // eslint-disable-next-line no-console
          console.info(`[bootstrap] purged ${removed} legacy-scope keys on mount`);
          // Tell every store to re-read in case it cached the stale data.
          dispatchAllRefreshEvents();
        }
        sessionStorage.setItem(PURGE_FLAG, "1");
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Tenant isolation. The previous "purge legacy + clear current_hh" fix
    // turned out to be a partial mitigation: hydrate*FromRemote functions
    // (debt-store, accounts-store, onboarding-remote, etc.) silently skip
    // when the new tenant's Supabase blob/table is empty, so the prior
    // tenant's data sat in localStorage and leaked into the new view
    // (symptom 2026-05-26: household בסר saw household יפרח's mortgage and
    // children-from-questionnaire). Half-measures kept reproducing the bug.
    //
    // The only safe architecture: on every tenant switch, wipe ALL local
    // `verdant:*` keys (preserving CRM cache + factory-reset version), then
    // re-plant the new household UUID and let bootstrap re-hydrate from
    // Supabase. Supabase is source of truth — every write path already pushes
    // there in the background, so local is purely a cache.
    if (impersonation) {
      const last = sessionStorage.getItem("verdant:last_impersonated");
      if (last !== impersonation.householdId) {
        const removed = wipeForTenantSwitch(impersonation.householdId);
        // eslint-disable-next-line no-console
        console.info(
          `[impersonation] tenant switch → ${impersonation.householdId.slice(0, 8)}…, wiped ${removed} keys`
        );
        sessionStorage.removeItem("verdant:bootstrap_done");
        sessionStorage.setItem("verdant:last_impersonated", impersonation.householdId);
        // Defensive: scopedKey checks UUID first now, but if a stale numeric
        // current_hh somehow reappears it would route reads to the legacy
        // namespace. Force it gone on every switch.
        localStorage.removeItem(CURRENT_HH_KEY);
        dispatchAllRefreshEvents();
      } else {
        // Same tenant as last mount (page reload / client-side nav) — just
        // keep the active-household pointer current. No wipe needed.
        try {
          localStorage.setItem("verdant:active_household_id", impersonation.householdId);
        } catch {}
      }
    } else {
      // Exiting impersonation (advisor went back to /crm and re-entered a
      // session without a client cookie). If we were impersonating, wipe so
      // the next bootstrap resolves the advisor's own household from scratch.
      const last = sessionStorage.getItem("verdant:last_impersonated");
      if (last) {
        const removed = wipeForTenantSwitch(null);
        // eslint-disable-next-line no-console
        console.info(`[impersonation] exited impersonation, wiped ${removed} keys`);
        sessionStorage.removeItem("verdant:last_impersonated");
        sessionStorage.removeItem("verdant:bootstrap_done");
        localStorage.removeItem(CURRENT_HH_KEY);
        dispatchAllRefreshEvents();
      }
    }
    void bootstrapSessionOnce("desktop-mount").finally(() => {
      setBootstrapReady(true);
    });
    const stopAuthWatch = watchBootstrapAuthState("desktop", setBootstrapReady);
    return () => {
      stopAuthWatch?.();
    };
  }, [impersonation]);

  useEffect(() => {
    if (!bootstrapReady) return;
    const stopRemoteWatch = watchRemoteHouseholdChanges("desktop", (ready) => {
      if (ready) setBootstrapReady(true);
    });
    return () => {
      stopRemoteWatch?.();
    };
  }, [bootstrapReady, impersonation?.householdId ?? null]);

  const loadingScreen = (
    <div className="flex min-h-screen items-center justify-center text-verdant-muted">
      טוען...
    </div>
  );

  return (
    <Suspense
      fallback={loadingScreen}
    >
      {!bootstrapReady ? (
        loadingScreen
      ) : (
        <ImpersonationProvider value={impersonation}>
        <ClientProvider>
          {/* `impersonation !== null` ↔ logged-in user is the advisor. Pass
              it through so the sidebar can hide CRM-only affordances for
              actual clients, and so the impersonation banner can render with
              the actual family name. (2026-04-29 per Nir.)
              ImpersonationProvider above gives any descendant component
              access to the same { householdId, familyName } via
              useImpersonation() — no more prop-drilling. */}
          <ClientShell isAdvisor={impersonation !== null} impersonation={impersonation}>
            {children}
          </ClientShell>
        </ClientProvider>
        </ImpersonationProvider>
      )}
    </Suspense>
  );
}
