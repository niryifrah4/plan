"use client";

/**
 * useLiveMacro — fetches the live macro snapshot from /api/market?kind=macro.
 *
 * Refreshes on mount + every 30 minutes after that. The endpoint is server-
 * cached for 10 minutes, so this hook never hammers BoI/CBS directly.
 *
 * Built 2026-05-24 to give the dashboard a "live data" trust signal —
 * dynamic prime + inflation + USD instead of hardcoded numbers from
 * lib/assumptions.ts. The lib/assumptions.ts defaults remain the
 * authoritative fallback when offline or pre-hydrate.
 */

import { useEffect, useState } from "react";

export interface LiveMacro {
  boiRate: number;
  primeRate: number;
  inflationRate: number;
  usd: number | null;
  updatedAt: string;
  source: {
    boiRate: "live" | "fallback";
    inflation: "live" | "fallback";
    usd: "live" | "fallback";
  };
}

const REFRESH_MS = 30 * 60 * 1000;

export function useLiveMacro(): {
  data: LiveMacro | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<LiveMacro | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/market?kind=macro", { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) {
          setError(`http_${res.status}`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as LiveMacro;
        if (!alive) return;
        setData(json);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "fetch_failed");
        setLoading(false);
      }
    };

    fetchOnce();
    const id = setInterval(fetchOnce, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { data, loading, error };
}
