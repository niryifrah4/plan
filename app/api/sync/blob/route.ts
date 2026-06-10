import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export async function POST(req: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { key?: unknown; value?: unknown; householdId?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const householdId = body?.householdId;

  if (!key) {
    return NextResponse.json({ ok: false, error: "missing_key" }, { status: 400 });
  }

  if (!isUuid(householdId)) {
    return NextResponse.json({ ok: false, error: "missing_household_id" }, { status: 400 });
  }

  const { error } = await sb
    .from("client_state")
    .upsert(
      {
        household_id: householdId,
        state_key: key,
        state_value: (body?.value ?? null) as never,
      },
      { onConflict: "household_id,state_key" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: "upsert_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
