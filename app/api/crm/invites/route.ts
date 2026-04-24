/**
 * POST /api/crm/invites
 *
 * Advisor invites a new client by email.
 *
 * Body: { email: string; fullName?: string; familyName?: string; householdId?: string }
 *
 * Behavior:
 *   1. Verify caller is an advisor.
 *   2. Resolve target household — existing (verify ownership) or create new.
 *   3. Generate a secure invite token, insert into `client_invites`.
 *   4. Use Supabase admin API `inviteUserByEmail` to send the invite email.
 *      The email contains a magic link that lands on /auth/callback; our
 *      auth trigger reads `raw_user_meta_data.invite_token` and links the
 *      new user to the household as a client.
 *   5. If admin API fails (e.g. user already exists), return the link so
 *      the advisor can share it manually.
 *
 * GET /api/crm/invites — list this advisor's invites.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Must be an advisor
  const { data: advisor } = await sb
    .from("advisors")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!advisor) return NextResponse.json({ error: "not_advisor" }, { status: 403 });

  let body: { email?: string; fullName?: string; familyName?: string; householdId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Resolve target household
  let householdId = body.householdId?.trim() || "";
  if (householdId) {
    const { data: owned } = await sb
      .from("households")
      .select("id")
      .eq("id", householdId)
      .eq("advisor_id", user.id)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "household_not_owned" }, { status: 403 });
  } else {
    const familyName = (body.familyName || body.fullName || "משפחה חדשה").trim();
    const { data: created, error: hhErr } = await sb
      .from("households")
      .insert({
        advisor_id: user.id,
        family_name: familyName,
        members_count: 2,
        stage: "onboarding",
      })
      .select("id")
      .single();
    if (hhErr || !created) {
      return NextResponse.json(
        { error: "household_create_failed", detail: hhErr?.message || "Unknown error" },
        { status: 500 },
      );
    }
    householdId = created.id;
  }

  // Generate token
  const token = randomBytes(32).toString("base64url");

  // Insert invite row — this is what the auth trigger looks up later
  const { error: insErr } = await sb.from("client_invites").insert({
    token,
    advisor_id: user.id,
    household_id: householdId,
    email,
  });
  if (insErr) {
    return NextResponse.json(
      {
        error: "invite_create_failed",
        detail: insErr.message,
        hint: "ייתכן שמיגרציה 0011 עוד לא הורצה ב-Supabase (חסרה טבלת client_invites).",
      },
      { status: 500 },
    );
  }

  const origin = new URL(req.url).origin;
  const inviteUrl = `${origin}/login?invite=${encodeURIComponent(token)}`;

  // Try to send the invite email via Supabase admin API.
  // This also creates the auth.users row with invite_token in metadata, so
  // when the client sets their password our trigger links them correctly.
  let emailSent = false;
  let emailError: string | undefined;
  try {
    const admin = createAdminClient();
    const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        invite_token: token,
        full_name: body.fullName || undefined,
        family_name: body.familyName || undefined,
        invited_by: advisor.full_name || undefined,
      },
      redirectTo: `${origin}/auth/callback`,
    });
    if (mailErr) {
      emailError = mailErr.message;
      // If the user already has an auth account, inviteUserByEmail refuses.
      // Fall back to a magic-link email that lands on /auth/callback — our
      // callback will then link them via the pending invite (matched by email).
      if (/already been registered|already registered/i.test(mailErr.message)) {
        const { error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: `${origin}/auth/callback` },
        });
        if (!linkErr) {
          emailSent = true;
          emailError = undefined;
        } else {
          emailError = `user_exists: ${linkErr.message}`;
        }
      }
    } else {
      emailSent = true;
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : "email_send_failed";
  }

  return NextResponse.json({
    ok: true,
    token,
    inviteUrl,
    householdId,
    email,
    emailSent,
    emailError,
  });
  } catch (err) {
    console.error("[invites POST] unhandled error:", err);
    return NextResponse.json(
      { error: "server_error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: invites, error } = await sb
    .from("client_invites")
    .select("token, email, household_id, created_at, consumed_at, expires_at")
    .eq("advisor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: invites || [] });
}
