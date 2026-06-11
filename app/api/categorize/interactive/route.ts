import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { interactiveCategorizeWithAI } from "@/lib/doc-parser/ai-categorizer";

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

    let body: { merchantKey?: string; description?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.merchantKey || !body.description) {
      return NextResponse.json({ error: "Missing merchantKey or description" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const aiModel = cookieStore.get("ai_categorizer_model")?.value === "perplexity" ? "perplexity" : "haiku";

    const result = await interactiveCategorizeWithAI(body.merchantKey, body.description, aiModel);
    
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
