import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";

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

  try {
    const { preferences } = await req.json();

    if (preferences && preferences.ai_categorizer) {
      const cookieStore = await cookies();
      cookieStore.set("ai_categorizer_model", preferences.ai_categorizer, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }

    return NextResponse.json({ success: true, preferences });
  } catch (err) {
    console.error("[preferences PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Invalid request body or unexpected error" }, { status: 500 });
  }
}
