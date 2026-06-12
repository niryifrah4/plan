import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { parseBody } from "@/lib/api/validate";

// רשימת מודלים מותרת — ערך חופשי ב-cookie היה יכול להישמר ולהישלח חזרה
// ל-Anthropic כשם מודל לא תקין.
const PrefsSchema = z.object({
  preferences: z.object({
    ai_categorizer: z.enum(["haiku", "perplexity"]).optional(),
  }),
});

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const cookieStore = await cookies();
  const aiModel = cookieStore.get("ai_categorizer_model")?.value || "haiku";

  return NextResponse.json({ preferences: { ai_categorizer: aiModel } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const parsed = await parseBody(req, PrefsSchema);
  if (!parsed.ok) return parsed.res;

  const model = parsed.data.preferences.ai_categorizer;
  if (model) {
    const cookieStore = await cookies();
    cookieStore.set("ai_categorizer_model", model, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return NextResponse.json({ success: true, preferences: parsed.data.preferences });
}
