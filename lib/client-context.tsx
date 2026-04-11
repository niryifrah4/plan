"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { Household, Profile } from "@/types/db";

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

  useEffect(() => {
    setLoading(true);

    const clientId = hhParam ? Number(hhParam) : getLastUsedClientId();
    if (!clientId && clientId !== 0) {
      setLoading(false);
      return;
    }

    // Save as last used
    try { localStorage.setItem(LS_CURRENT, String(clientId)); } catch {}

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
  }, [hhParam]);

  const updateClient = useCallback(
    (patch: Partial<LocalClient>) => {
      setClient((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...patch };
        // Persist to localStorage
        saveLocalClient(updated);
        return updated;
      });
    },
    [],
  );

  const value: ClientContextValue = {
    clientId: client?.id ?? null,
    familyName: client ? `משפחת ${client.family}` : "לקוח חדש",
    membersCount: client?.members ?? 1,
    client,
    household,
    profile,
    updateClient,
    loading,
  };

  return (
    <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
  );
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
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}
