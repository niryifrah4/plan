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
import { z } from "zod";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import {
  categorizeWithAI,
  type TxToClassify,
  type PastCorrection,
} from "@/lib/doc-parser/ai-categorizer";
import { parseBody } from "@/lib/api/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Cap per request — 200 keeps the Haiku call under ~6K input tokens. */
const MAX_TXS = 200;

// סכימה מתירנית בכוונה — מאמתת מבנה (מערכים של אובייקטים) ומגבילה כמות/גודל
// בלי לכפות סכימה מדויקת על כל שדות התנועה, כדי לא לשבור קלט קיים.
const BodySchema = z.object({
  transactions: z.array(z.record(z.string(), z.unknown())).max(MAX_TXS).optional(),
  pastCorrections: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
});

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

    const parsed = await parseBody(req, BodySchema);
    if (!parsed.ok) return parsed.res;

    const txs = (parsed.data.transactions ?? []) as unknown as TxToClassify[];
    const corrections = (parsed.data.pastCorrections ?? []) as unknown as PastCorrection[];

    if (txs.length === 0) {
      return NextResponse.json({ suggestions: [] });
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
