import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { interactiveCategorizeWithAI } from "@/lib/doc-parser/ai-categorizer";
import { parseBody } from "@/lib/api/validate";
import { z } from "zod";

const BodySchema = z.object({
  merchantKey: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(2000),
});

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const ip = getClientIp(req.headers);
    const rl = rateLimit({ key: `categorize-interactive:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי קריאות, נסה שוב בעוד דקה." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      );
    }

    const parsed = await parseBody(req, BodySchema);
    if (!parsed.ok) return parsed.res;
    const { merchantKey, description } = parsed.data;

    const cookieStore = await cookies();
    const aiModel = cookieStore.get("ai_categorizer_model")?.value === "perplexity" ? "perplexity" : "haiku";

    const result = await interactiveCategorizeWithAI(merchantKey, description, aiModel);
    
    if (!result) {
      return NextResponse.json({ error: "שגיאה בקבלת תשובה מה-AI" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("/api/categorize/interactive error:", err);
    return NextResponse.json(
      { error: "שגיאה כללית בקריאה ל-AI", code: "UNEXPECTED" },
      { status: 500 }
    );
  }
}
