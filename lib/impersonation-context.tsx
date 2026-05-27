"use client";

/**
 * ImpersonationContext — single source of truth for "who is the active household"
 * across every component in the (client) route group.
 *
 * Built 2026-05-27 to fix a class of bugs where the sidebar, the dashboard
 * greeting, and the onboarding pre-fill could each display a DIFFERENT
 * client identity because each was reading from a different cache:
 *   - Sidebar       → useClient() local-client registry (numeric ID)
 *   - Dashboard     → useClient() familyName
 *   - Onboarding    → useClient() client object (used to pre-fill the form)
 *   - Banner        → impersonation prop (server-resolved from cookie)
 *
 * When the advisor switched households in CRM, the cookie/impersonation
 * prop updated but the local-client cache didn't — so the four surfaces
 * disagreed, and worst-case the pre-fill wrote one household's name into
 * another household's questionnaire.
 *
 * Now the (client)/layout.tsx feeds the cookie-resolved
 * { householdId, familyName } into this context, and every consumer can
 * call `useImpersonation()` to read it. The impersonation cookie is the
 * canonical source — same data the scopedKey() namespace is built from.
 *
 * Returns `null` when no impersonation is active (a real client_user is
 * logged in directly, no advisor is impersonating them). In that case,
 * fall back to whatever local-client info the consumer was using before.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface Impersonation {
  /** Household UUID. Same value as verdant:active_household_id in localStorage. */
  householdId: string;
  /** Family name as resolved from the households table at request time. */
  familyName: string;
}

const ImpersonationContext = createContext<Impersonation | null>(null);

export function ImpersonationProvider({
  value,
  children,
}: {
  value: Impersonation | null;
  children: ReactNode;
}) {
  return <ImpersonationContext.Provider value={value}>{children}</ImpersonationContext.Provider>;
}

export function useImpersonation(): Impersonation | null {
  return useContext(ImpersonationContext);
}
