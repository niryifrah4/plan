"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { Household, Profile } from "@/types/db";
import { runClientMigration } from "@/lib/client-migration";
import { ACTIVE_CLIENT_CHANGED, dispatchAllRefreshEvents } from "@/lib/client-scope";

/* ───── localStorage keys ───── */
const LS_CLIENTS = "verdant:clients";
const LS_CURRENT = "verdant:current_hh";

/* ───── Shape of a locally-stored client (mirrors CRM Client type) ───── */
export interface LocalClient {
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
  convertedFromLead?: string;
  email?: string;
  phone?: string;
}

/* ───── Context value ───── */
interface ClientContextValue {
  /** The numeric local ID from CRM (localStorage) */
  clientId: number | null;
  /** Display family name */
  familyName: string;
  /** Number of family members */
  membersCount: number;
  /** The full local client record */
  client: LocalClient | null;
  /** Supabase household (if connected) */
  household: Household | null;
  /** Supabase profile (if connected) */
  profile: Profile | null;
  /** Update a field on the current client and auto-save */
  updateClient: (patch: Partial<LocalClient>) => void;
  /** Is data loading? */
  loading: boolean;
}

const ClientContext = createContext<ClientContextValue>({
  clientId: null,
  familyName: "לקוח חדש",
  membersCount: 1,
  client: null,
  household: null,
  profile: null,
  updateClient: () => {},
  loading: true,
});

export function useClient() {
  return useContext(ClientContext);
}

/* ───── Provider ───── */
export function ClientProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [client, setClient] = useState<LocalClient | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Read client ID from URL (?hh=<id>) or fallback to last used
  const hhParam = searchParams.get("hh");
  const [switchTick, setSwitchTick] = useState(0);

  // Run one-time migration on mount
  useEffect(() => {
    try {
      runClientMigration();
    } catch (e) {
      console.warn("[client-migration] failed:", e);
    }
  }, []);

  // Re-run load on active-client-changed events
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setSwitchTick((t) => t + 1);
    window.addEventListener(ACTIVE_CLIENT_CHANGED, handler);
    return () => window.removeEventListener(ACTIVE_CLIENT_CHANGED, handler);
  }, []);

  useEffect(() => {
    setLoading(true);

    const clientId = hhParam ? Number(hhParam) : getLastUsedClientId();
    if (!clientId && clientId !== 0) {
      setLoading(false);
      return;
    }

    // Save as last used & detect if scope changed
    const prevId = localStorage.getItem(LS_CURRENT);
    const scopeChanged = prevId !== String(clientId);
    try {
      localStorage.setItem(LS_CURRENT, String(clientId));
    } catch {}

    // 1. Load from localStorage
    const localClient = getLocalClient(clientId);
    if (localClient) {
      setClient(localClient);
    }

    // 2. Try Supabase (async, non-blocking)
    const sb = getSupabaseBrowser();
    if (sb) {
      // In the future when households are in Supabase, fetch here
      // For now Supabase is not configured, so we skip
    }

    setLoading(false);

    // Fire refresh events so child components re-read from the correct scope.
    // On first load, child useEffects may have already run with null scope,
    // so we always fire when scope was just set (prevId was null or different).
    if (scopeChanged) {
      // Use microtask to ensure state updates flush first
      queueMicrotask(() => dispatchAllRefreshEvents());
    }
  }, [hhParam, switchTick]);

  const updateClient = useCallback((patch: Partial<LocalClient>) => {
    setClient((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      // Persist to localStorage
      saveLocalClient(updated);
      return updated;
    });
  }, []);

  const value: ClientContextValue = {
    clientId: client?.id ?? null,
    familyName: client ? client.family : "לקוח חדש",
    membersCount: client?.members ?? 1,
    client,
    household,
    profile,
    updateClient,
    loading,
  };

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

/* ───── localStorage helpers ───── */
function getLocalClients(): LocalClient[] {
  try {
    const raw = localStorage.getItem(LS_CLIENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getLocalClient(id: number): LocalClient | null {
  return getLocalClients().find((c) => c.id === id) ?? null;
}

function saveLocalClient(client: LocalClient) {
  try {
    const all = getLocalClients();
    const idx = all.findIndex((c) => c.id === client.id);
    if (idx >= 0) {
      all[idx] = client;
    } else {
      all.push(client);
    }
    localStorage.setItem(LS_CLIENTS, JSON.stringify(all));
  } catch (e) {
    console.warn("[ClientContext] localStorage write failed:", e);
  }
}

function getLastUsedClientId(): number | null {
  try {
    const raw = localStorage.getItem(LS_CURRENT);
    if (raw) return Number(raw);
    // No current_hh set — auto-select first client from registry
    const clients = getLocalClients();
    if (clients.length > 0) {
      const firstId = clients[0].id;
      localStorage.setItem(LS_CURRENT, String(firstId));
      return firstId;
    }
    return null;
  } catch {
    return null;
  }
}
