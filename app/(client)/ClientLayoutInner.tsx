"use client";

import { Suspense, useEffect } from "react";
import { ClientProvider } from "@/lib/client-context";
import { ClientShell } from "./ClientShell";
import { runFactoryResetIfNeeded } from "@/lib/factory-reset";
import { bootstrapSessionOnce } from "@/lib/sync/bootstrap";

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
  useEffect(() => { runFactoryResetIfNeeded(); }, []);

  useEffect(() => {
    // When impersonating, override the active-household cache with the target
    // household BEFORE bootstrap hydrates stores. Also clear the bootstrap
    // flag so hydrate re-runs for the new household.
    if (impersonation) {
      localStorage.setItem("verdant:active_household_id", impersonation.householdId);
      const last = sessionStorage.getItem("verdant:last_impersonated");
      if (last !== impersonation.householdId) {
        sessionStorage.removeItem("verdant:bootstrap_done");
        sessionStorage.setItem("verdant:last_impersonated", impersonation.householdId);
      }
    }
    bootstrapSessionOnce().catch(() => {});
  }, [impersonation]);

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-verdant-muted">טוען...</div>}>
      <ClientProvider>
        {/* `impersonation !== null` ↔ logged-in user is the advisor. Pass
            it through so the sidebar can hide CRM-only affordances for
            actual clients. (2026-04-29 per Nir.) */}
        <ClientShell isAdvisor={impersonation !== null}>{children}</ClientShell>
      </ClientProvider>
    </Suspense>
  );
}
