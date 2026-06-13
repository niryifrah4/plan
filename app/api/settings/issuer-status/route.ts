import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ISSUER_STATUS_IDS } from "@/lib/doc-parser/issuer-registry";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/supabase/require-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const PatchIssuerStatusSchema = z.object({
  issuerId: z.string().min(1),
  verified: z.boolean(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.sb
    .from("issuer_mapping_status")
    .select("issuer_id, verified, notes, updated_at, updated_by")
    .order("issuer_id");

  if (error) {
    console.error("[issuer-status] read failed:", error);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, statuses: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const parsed = await parseBody(req, PatchIssuerStatusSchema);
  if (!parsed.ok) return parsed.res;

  const issuerId = parsed.data.issuerId.trim();
  if (!ISSUER_STATUS_IDS.has(issuerId)) {
    return NextResponse.json({ ok: false, error: "unknown_issuer" }, { status: 400 });
  }

  const notes = parsed.data.notes?.trim() || null;
  const { data, error } = await auth.sb
    .from("issuer_mapping_status")
    .upsert(
      {
        issuer_id: issuerId,
        verified: parsed.data.verified,
        notes,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "issuer_id" }
    )
    .select("issuer_id, verified, notes, updated_at, updated_by")
    .single();

  if (error) {
    console.error("[issuer-status] write failed:", error);
    return NextResponse.json({ ok: false, error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: data });
}
