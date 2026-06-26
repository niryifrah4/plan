import { Router } from "express";
import { env } from "../env.js";
import { requireUser, requireAdvisor } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

/**
 * /api/crm/impersonate/* — advisor "view as client". Ported from
 * app/api/crm/impersonate (route, enter, debug).
 *
 * Security model preserved 1:1: the cookie value is just a householdId, and
 * EVERY consumer re-verifies households.advisor_id = auth.uid() before trusting
 * it (see /status + /debug). A copied cookie is useless to another advisor.
 *
 * Migration adaptations (transport only, behavior identical):
 *  - cookies() -> Express res.cookie / req.cookies.
 *  - The old (client) RSC layout read the httpOnly cookie server-side. The SPA
 *    can't read httpOnly cookies in JS, so GET /status returns the resolved
 *    impersonation {householdId, familyName} (re-verifying ownership) for the
 *    client-area guard to consume.
 *  - GET /enter solved a Set-Cookie/navigation race specific to full-page
 *    fetch-then-navigate. The SPA navigates client-side, so /enter now returns
 *    JSON { ok, next } (after the same ownership check) and the SPA routes
 *    there itself; POST still sets the cookie.
 */
export const impersonateRouter = Router();

const COOKIE = "plan_impersonate_hh";
const MAX_AGE_MS = 60 * 60 * 8 * 1000; // 8 hours

function cookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeMs,
  };
}

impersonateRouter.use(requireUser, requireAdvisor);

// POST /api/crm/impersonate  body: { householdId }
impersonateRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const householdId = String((req.body as { householdId?: string })?.householdId || "").trim();
    if (!householdId) {
      res.status(400).json({ error: "missing_household_id" });
      return;
    }

    const { data: owned } = await sb
      .from("households")
      .select("id, family_name")
      .eq("id", householdId)
      .eq("advisor_id", req.user!.id)
      .maybeSingle();
    if (!owned) {
      res.status(403).json({ error: "household_not_owned" });
      return;
    }

    res.cookie(COOKIE, householdId, cookieOpts(MAX_AGE_MS));
    res.json({ ok: true, householdId, familyName: owned.family_name });
  })
);

// DELETE /api/crm/impersonate — stop impersonating.
impersonateRouter.delete("/", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

const ALLOWED_NEXT = ["/dashboard", "/onboarding"];
function safeNextPath(value: unknown): string {
  const next = (typeof value === "string" ? value : "/dashboard").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  if (!ALLOWED_NEXT.some((p) => next === p || next.startsWith(p + "?"))) return "/dashboard";
  return next;
}

// GET /api/crm/impersonate/enter?household_id=&next= — verify ownership, set
// cookie, and return the client-side route to navigate to.
impersonateRouter.get(
  "/enter",
  asyncHandler(async (req, res) => {
    const householdId = String(req.query.household_id || "").trim();
    const nextPath = safeNextPath(req.query.next);
    if (!householdId) {
      res.status(400).json({ ok: false, error: "missing household_id" });
      return;
    }
    const { data: owned } = await req.sb!
      .from("households")
      .select("id")
      .eq("id", householdId)
      .eq("advisor_id", req.user!.id)
      .maybeSingle();
    if (!owned) {
      res.status(403).json({ ok: false, error: "not_owned" });
      return;
    }
    res.cookie(COOKIE, householdId, cookieOpts(MAX_AGE_MS));
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ ok: true, next: nextPath, householdId });
  })
);

// GET /api/crm/impersonate/status — resolve the current impersonation cookie
// (re-verifying ownership). Replaces the RSC layout's server-side cookie read.
impersonateRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const cookieValue = req.cookies?.[COOKIE] ?? null;
    if (!cookieValue) {
      res.json({ impersonating: false });
      return;
    }
    const { data: owned } = await req.sb!
      .from("households")
      .select("id, family_name")
      .eq("id", cookieValue)
      .eq("advisor_id", req.user!.id)
      .maybeSingle();
    if (!owned) {
      res.json({ impersonating: false });
      return;
    }
    res.json({ impersonating: true, householdId: owned.id, familyName: owned.family_name });
  })
);

// GET /api/crm/impersonate/debug — diagnostic snapshot (ported 1:1).
impersonateRouter.get(
  "/debug",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const user = req.user!;
    const cookieValue = req.cookies?.[COOKIE] ?? null;

    const { data: advisor } = await sb.from("advisors").select("id").eq("id", user.id).maybeSingle();

    let cookieResolves: { id: string; family_name: string } | null = null;
    let cookieResolveError: string | null = null;
    if (cookieValue) {
      const { data, error } = await sb
        .from("households")
        .select("id, family_name")
        .eq("id", cookieValue)
        .eq("advisor_id", user.id)
        .maybeSingle();
      if (error) cookieResolveError = error.message;
      else cookieResolves = data;
    }

    const { data: ownedHouseholds } = await sb
      .from("households")
      .select("id, family_name, created_at")
      .eq("advisor_id", user.id)
      .order("created_at", { ascending: false });

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({
      ok: true,
      user_id: user.id,
      is_advisor: !!advisor,
      cookie: { name: COOKIE, value: cookieValue, present: !!cookieValue },
      cookie_resolves_to: cookieResolves,
      cookie_resolve_error: cookieResolveError,
      owned_households: ownedHouseholds || [],
      timestamp: new Date().toISOString(),
    });
  })
);
