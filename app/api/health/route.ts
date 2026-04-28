import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Used by Render's healthCheckPath. Returns 200 + minimal payload.
 * Does NOT touch Supabase — this is a process-liveness check, not a
 * dependency check. If Supabase is down we still want Render to keep
 * the container alive so users see a helpful error instead of 502.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "plan-app",
    timestamp: new Date().toISOString(),
  });
}
