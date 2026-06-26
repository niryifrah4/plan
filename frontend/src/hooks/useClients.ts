import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api";

export interface Household {
  id: string;
  family_name: string;
  members_count: number;
  stage: string;
  created_at: string;
  net_worth: number | null;
  docs_uploaded: number;
}

/**
 * Lovable-idiomatic data hook. Wraps the authed apiFetch in TanStack Query so
 * components get caching, loading/error states, and refetch for free.
 * Backs GET /api/crm/clients.
 */
export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<{ households: Household[] }>("/api/crm/clients"),
    select: (d) => d.households,
  });
}
