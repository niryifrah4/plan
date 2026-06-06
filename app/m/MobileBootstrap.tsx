"use client";

/**
 * /m bootstrap wrapper — runs once per session.
 *
 * Mirrors what `(client)/ClientLayoutInner` does for the desktop:
 *   1. Writes the active household_id to localStorage so scopedKey() picks
 *      up the right namespace for all subsequent reads/writes.
 *   2. Calls `bootstrapSessionOnce()` which pulls every blob from Supabase
 *      (budgets, debt, pension, real estate, balance history, transactions
 *      — including the new mobile-logged ones).
 *
 * Without this wrapper, /m mounts with empty localStorage and the user
 * sees zero data even when they have a fully populated household on the
 * dashboard. This was the silent gap surfaced by Nir's question on
 * 2026-05-23: "איך הוא יודע שהאפליקציה שלי משוייכת אליי".
 *
 * Phase 1 (this commit) supports the advisor logging into their own
 * household. Impersonation flow (advisor viewing a client's data) and
 * client-only login will plug in here in later iterations.
 */

import { useEffect, useState } from "react";
import {
  bootstrapSessionOnce,
  watchRemoteHouseholdChanges,
  watchBootstrapAuthState,
} from "@/lib/sync/bootstrap";

interface Props {
  householdId: string | null;
  children: React.ReactNode;
}

export function MobileBootstrap({ householdId, children }: Props) {
  const [bootstrapReady, setBootstrapReady] = useState(false);

  const loadingScreen = (
    <div className="flex min-h-screen items-center justify-center text-verdant-muted">
      טוען...
    </div>
  );

  useEffect(() => {
    // Match the desktop's storage key so scopedKey() + bootstrap agree.
    if (householdId) {
      try {
        localStorage.setItem("verdant:active_household_id", householdId);
      } catch {}
    }
    void bootstrapSessionOnce("mobile-mount").finally(() => {
      setBootstrapReady(true);
    });
    const stopAuthWatch = watchBootstrapAuthState("mobile", setBootstrapReady);
    return () => {
      stopAuthWatch?.();
    };
  }, [householdId]);

  useEffect(() => {
    if (!bootstrapReady) return;
    const stopRemoteWatch = watchRemoteHouseholdChanges("mobile", (ready) => {
      if (ready) setBootstrapReady(true);
    });
    return () => {
      stopRemoteWatch?.();
    };
  }, [bootstrapReady, householdId]);

  if (!bootstrapReady) {
    return loadingScreen;
  }

  return <>{children}</>;
}
