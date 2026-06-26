import { Router } from "express";

/**
 * GET /api/health
 * Process-liveness check. Does NOT touch Supabase (mirrors the old
 * app/api/health/route.ts rationale: keep the container alive even if
 * Supabase is down so users see a helpful error, not a 502).
 */
export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "plan-backend",
    timestamp: new Date().toISOString(),
  });
});
