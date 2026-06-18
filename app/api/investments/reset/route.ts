/**
 * DELETE /api/investments/reset?householdId=<uuid>
 *
 * Delete all investment data for the authenticated household:
 * - portfolio_positions and portfolio_accounts from client_state
 * - All investment_reports
 *
 * Used by the "reset" button on /investments page.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { assertHouseholdAccess } from "@/lib/api/household-auth";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;
    const { user, sb } = auth;

    // Get household ID from query parameters
    const householdId = new URL(req.url).searchParams.get("householdId");
    if (!householdId) {
      return NextResponse.json(
        { error: "Missing household ID" },
        { status: 400 }
      );
    }

    // Verify user has access to this household
    const allowed = await assertHouseholdAccess(sb, user.id, householdId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete from client_state (portfolio blobs)
    const { error: clientStateError } = await sb
      .from("client_state")
      .delete()
      .eq("household_id", householdId)
      .in("state_key", ["portfolio_positions", "portfolio_accounts"]);

    if (clientStateError) {
      console.error("[investments/reset] client_state delete failed:", clientStateError.message);
      return NextResponse.json(
        { error: "Failed to delete portfolio data" },
        { status: 500 }
      );
    }

    // Delete from investment_reports
    const { error: reportsError } = await sb
      .from("investment_reports")
      .delete()
      .eq("household_id", householdId);

    if (reportsError) {
      console.error("[investments/reset] investment_reports delete failed:", reportsError.message);
      return NextResponse.json(
        { error: "Failed to delete investment reports" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Investment data reset successfully" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    console.error("[investments/reset] error:", message);
    return NextResponse.json(
      { error: message, code: "UNEXPECTED_ERROR" },
      { status: 500 }
    );
  }
}
