import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  getAuthUrl,
  exchangeCode,
  fetchUpcomingEvents,
  createCalendarEvent,
} from "@/lib/google-calendar";
import { env, crossSiteCookie } from "../env.js";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../lib/validate.js";

/**
 * /api/gcal/* — Google Calendar OAuth + events. Ported from app/api/gcal/*.
 *
 * Migration notes:
 *  - cookies() -> Express req.cookies / res.cookie (cookie-parser).
 *  - OAuth redirects now target the SPA origin (env.FRONTEND_URL), since the
 *    backend and frontend are separate hosts.
 *  - /auth + /callback are full-page navigations (set cookies on the backend
 *    origin). /status, /events, /disconnect are credentialed XHRs — the SPA's
 *    apiFetch sends credentials so the cookies round-trip (SameSite=None in
 *    prod, lax via the Vite proxy in dev).
 *  - /callback is public (validates the state cookie itself); the rest require
 *    an authenticated user.
 */
export const gcalRouter = Router();

const OAUTH_STATE_COOKIE = "gcal_oauth_state";
const crmUrl = (qs: string) => `${env.FRONTEND_URL}/crm${qs}`;

// GET /api/gcal/auth — redirect to Google consent (requires auth).
gcalRouter.get(
  "/auth",
  requireUser,
  (req, res) => {
    try {
      const state = randomBytes(16).toString("base64url");
      const url = getAuthUrl(state);
      res.cookie(OAUTH_STATE_COOKIE, state, crossSiteCookie(60 * 10 * 1000));
      res.redirect(url);
    } catch {
      res.redirect(crmUrl("?gcal=error&reason=not_configured"));
    }
  }
);

// GET /api/gcal/callback — Google redirects here (public; validates state).
gcalRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] || null;

    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

    if (!code) return res.redirect(crmUrl("?gcal=error&reason=no_code"));
    if (!state || !expectedState || state !== expectedState) {
      return res.redirect(crmUrl("?gcal=error&reason=invalid_state"));
    }

    try {
      const tokens = await exchangeCode(code);
      if (tokens.access_token) {
        res.cookie("gcal_access_token", tokens.access_token, crossSiteCookie(60 * 60 * 1000));
      }
      if (tokens.refresh_token) {
        res.cookie("gcal_refresh_token", tokens.refresh_token, crossSiteCookie(60 * 60 * 24 * 365 * 1000));
      }
      res.cookie("gcal_connected", "true", crossSiteCookie(60 * 60 * 24 * 365 * 1000, false));
      res.redirect(crmUrl("?gcal=connected"));
    } catch (e) {
      console.error("[gcal/callback] Token exchange failed:", e);
      const msg = e instanceof Error ? e.message : "exchange_failed";
      res.redirect(crmUrl(`?gcal=error&reason=${encodeURIComponent(msg)}`));
    }
  })
);

// The remaining endpoints require an authenticated user.
gcalRouter.use(requireUser);

// GET /api/gcal/status
gcalRouter.get("/status", (req, res) => {
  const connected = req.cookies?.gcal_connected === "true";
  const hasToken = !!req.cookies?.gcal_access_token;
  res.json({
    connected: connected && hasToken,
    hasRefreshToken: !!req.cookies?.gcal_refresh_token,
  });
});

const EventSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  description: z.string().max(5000).optional(),
  startDateTime: z.string().min(1),
  endDateTime: z.string().min(1),
});

// GET /api/gcal/events
gcalRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    const accessToken = req.cookies?.gcal_access_token;
    const refreshToken = req.cookies?.gcal_refresh_token;
    if (!accessToken) {
      res.status(401).json({ error: "Not connected to Google Calendar" });
      return;
    }
    try {
      const events = await fetchUpcomingEvents(accessToken, refreshToken);
      res.json({ events });
    } catch (e) {
      console.error("[gcal/events] Fetch failed:", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "fetch_failed" });
    }
  })
);

// POST /api/gcal/events
gcalRouter.post(
  "/events",
  asyncHandler(async (req, res) => {
    const accessToken = req.cookies?.gcal_access_token;
    const refreshToken = req.cookies?.gcal_refresh_token;
    if (!accessToken) {
      res.status(401).json({ error: "Not connected to Google Calendar" });
      return;
    }
    const parsed = validate(req.body, EventSchema, res);
    if (!parsed.ok) return;
    try {
      const event = await createCalendarEvent(accessToken, refreshToken, {
        summary: parsed.data.summary,
        description: parsed.data.description || "",
        startDateTime: parsed.data.startDateTime,
        endDateTime: parsed.data.endDateTime,
      });
      res.json({ event });
    } catch (e) {
      console.error("[gcal/events] Create failed:", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "create_failed" });
    }
  })
);

// POST /api/gcal/disconnect
gcalRouter.post("/disconnect", (req, res) => {
  res.clearCookie("gcal_access_token", { path: "/" });
  res.clearCookie("gcal_refresh_token", { path: "/" });
  res.clearCookie("gcal_connected", { path: "/" });
  res.json({ disconnected: true });
});
