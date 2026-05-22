"use client";

import { Suspense, useEffect } from "react";
import { ClientProvider } from "@/lib/client-context";
import { ClientShell } from "./ClientShell";
import { runFactoryResetIfNeeded } from "@/lib/factory-reset";
import { bootstrapSessionOnce } from "@/lib/sync/bootstrap";
import { CURRENT_HH_KEY, dispatchAllRefreshEvents } from "@/lib/client-scope";

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
  useEffect(() => {
    runFactoryResetIfNeeded();
  }, []);

  useEffect(() => {
    // When impersonating, override the active-household cache with the target
    // household BEFORE bootstrap hydrates stores. Also clear the bootstrap
    // flag so hydrate re-runs for the new household.
    //
    // 2026-05-20: dual-key bug fix. The codebase has TWO active-household
    // keys: `verdant:active_household_id` (UUID, written by bootstrap/remote-
    // sync) and `verdant:current_hh` (numeric, read by scopedKey()). If a
    // numeric current_hh is left over from a prior multi-client local session,
    // scopedKey returns scoped paths like `verdant:c:5:pension_funds` — but
    // hydrate writes to UNSCOPED `verdant:pension_funds`. Pages then read the
    // wrong (stale) data. Symptom: advisor enters client's tab and sees their
    // own/previous household data.
    //
    // Fix: clear current_hh whenever impersonating so scopedKey falls back to
    // the unscoped paths where bootstrap actually writes. Then fire the
    // global ACTIVE_CLIENT_CHANGED event chain so every open store re-reads.
    if (impersonation) {
      localStorage.setItem("verdant:active_household_id", impersonation.householdId);
      const last = sessionStorage.getItem("verdant:last_impersonated");
      if (last !== impersonation.householdId) {
        sessionStorage.removeItem("verdant:bootstrap_done");
        sessionStorage.setItem("verdant:last_impersonated", impersonation.householdId);
        // Force scope alignment + cascade refresh on every household switch.
        localStorage.removeItem(CURRENT_HH_KEY);
        dispatchAllRefreshEvents();
      }
    }
    bootstrapSessionOnce().catch(() => {});
  }, [impersonation]);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-verdant-muted">
          טוען...
        </div>
      }
    >
      <ClientProvider>
        {/* `impersonation !== null` ↔ logged-in user is the advisor. Pass
            it through so the sidebar can hide CRM-only affordances for
            actual clients, and so the impersonation banner can render with
            the actual family name. (2026-04-29 per Nir.) */}
        <ClientShell isAdvisor={impersonation !== null} impersonation={impersonation}>
          {children}
        </ClientShell>
      </ClientProvider>
    </Suspense>
  );
}
