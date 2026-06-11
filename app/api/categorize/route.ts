/**
 * POST /api/categorize
 *
 * Server-side wrapper around `lib/doc-parser/ai-categorizer.ts`. The browser
 * cannot call Claude directly — ANTHROPIC_API_KEY is server-only.
 *
 * Request:
 *   { transactions: TxToClassify[], pastCorrections?: PastCorrection[] }
 *
 * Response:
 *   { suggestions: AISuggestion[] }   (always 200 — empty array on failure)
 *
 * Used by:
 *   - UnmappedQueueTab "סווג מחדש עם AI" button (bulk re-classify)
 *   - DocumentsTab preview (optional auto-AI for low-confidence rows)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import {
  categorizeWithAI,
  type TxToClassify,
  type PastCorrection,
} from "@/lib/doc-parser/ai-categorizer";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Cap per request — 200 keeps the Haiku call under ~6K input tokens. */
const MAX_TXS = 200;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;
    const { sb, user } = auth;

    const ip = getClientIp(req.headers);
    const rl = rateLimit({ key: `categorize:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי בקשות סיווג. נסה שוב בעוד דקה." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      );
    }

    let body: { transactions?: TxToClassify[]; pastCorrections?: PastCorrection[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const txs = Array.isArray(body.transactions) ? body.transactions : [];
    const corrections = Array.isArray(body.pastCorrections) ? body.pastCorrections : [];

    if (txs.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }
    if (txs.length > MAX_TXS) {
      return NextResponse.json(
        { error: `Max ${MAX_TXS} transactions per request` },
        { status: 413 }
      );
    }

    const cookieStore = await cookies();
    const aiModel = cookieStore.get("ai_categorizer_model")?.value === "perplexity" ? "perplexity" : "haiku";

    const suggestions = await categorizeWithAI(txs, corrections, aiModel);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("/api/categorize error:", err);
    return NextResponse.json(
      { error: "שגיאה בקריאה ל-AI", code: "UNEXPECTED" },
      { status: 500 }
    );
  }
}
