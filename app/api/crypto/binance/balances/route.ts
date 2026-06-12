/**
 * POST /api/crypto/binance/balances
 *
 * Server-side proxy to Binance — solves CORS and keeps the HMAC signing
 * code off the client.
 *
 * Request body: { apiKey: string, secret: string }
 * Response:     { balances: [{ asset, free, locked, total }] }
 *
 * The Binance API key should be created with the "Enable Reading" permission
 * ONLY. We never need trading or withdrawal scopes. The UI warns the user
 * about this before they enter credentials.
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/report-error";

const BINANCE_BASE = "https://api.binance.com";
const RECV_WINDOW = 10_000;

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export async function POST(req: Request) {
  // Defense in depth: middleware already blocks unauthenticated /api/* by
  // default (this route is not in PUBLIC_API_ROUTES). The explicit check
  // here prevents proxy abuse if the middleware whitelist ever changes.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: { apiKey?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { apiKey, secret } = body;
  if (!apiKey || !secret) {
    return NextResponse.json(
      { error: "Missing apiKey or secret" },
      { status: 400 }
    );
  }

  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=${RECV_WINDOW}`;
  const signature = crypto.createHmac("sha256", secret).update(queryString).digest("hex");

  const url = `${BINANCE_BASE}/api/v3/account?${queryString}&signature=${signature}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
      // 15s timeout via AbortSignal
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch (e) { reportError("api/crypto/binance/balances/route", e); }
      return NextResponse.json(
        {
          error: `Binance returned ${res.status}`,
          detail: parsed,
        },
        { status: res.status === 401 || res.status === 403 ? 401 : 502 }
      );
    }

    const data = (await res.json()) as { balances?: BinanceBalance[] };
    const balances = (data.balances ?? [])
      .map((b) => {
        const free = parseFloat(b.free) || 0;
        const locked = parseFloat(b.locked) || 0;
        return { asset: b.asset, free, locked, total: free + locked };
      })
      .filter((b) => b.total > 0);

    return NextResponse.json({ balances });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to reach Binance",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
