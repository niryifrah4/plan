/**
 * DELETE /api/investments/reset
 *
 * Delete all investment data for the authenticated household:
 * - portfolio_positions and portfolio_accounts from client_state
 * - All investment_reports
 *
 * Used by the "reset" button on /investments page.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { getHouseholdId } from "@/lib/sync/remote-sync";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const hh = getHouseholdId();
    if (!hh) {
      return NextResponse.json(
        { error: "No active household" },
        { status: 400 }
      );
    }

    // Use server-side Supabase client (if available) or fetch via browser client
    const sb = getSupabaseBrowser();
    if (!sb) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 }
      );
    }

    // Delete from client_state (portfolio blobs)
    const { error: clientStateError } = await sb
      .from("client_state")
      .delete()
      .eq("household_id", hh)
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
      .eq("household_id", hh);

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
