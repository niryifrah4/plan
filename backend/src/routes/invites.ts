import { Router } from "express";
import { randomBytes } from "node:crypto";
import { sendEmail } from "@/lib/email/resend";
import { inviteEmail } from "@/lib/email/templates";
import { createAdminClient } from "../supabase.js";
import { env } from "../env.js";
import { requireUser, requireAdvisor } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { rateLimit, RATE_LIMITS } from "../lib/rate-limit.js";

/**
 * /api/crm/invites — ported from app/api/crm/invites. Advisor invites a client
 * by email (or sets a password directly). Mounted separately from crmRouter
 * but with the same requireUser + requireAdvisor gate.
 *
 * Migration note: invite/redirect URLs now point at the SPA origin
 * (env.FRONTEND_URL) — /login?invite=<token> and /auth/callback.
 */
export const invitesRouter = Router();

invitesRouter.use(requireUser, requireAdvisor);

invitesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const user = req.user!;

    const { data: advisor } = await sb
      .from("advisors")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();
    // requireAdvisor already guaranteed advisor exists; keep full_name handy.

    const rl = rateLimit({ key: `invite:${user.id}`, ...RATE_LIMITS.INVITE });
    if (!rl.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      res.set({
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
      });
      res.status(429).json({ error: "rate_limited", retryAfter: retryAfterSec });
      return;
    }

    const body = (req.body || {}) as {
      email?: string;
      fullName?: string;
      familyName?: string;
      householdId?: string;
      password?: string;
    };

    const email = (body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }

    // Resolve target household — existing (verify ownership) or create new.
    let householdId = body.householdId?.trim() || "";
    if (householdId) {
      const { data: owned } = await sb
        .from("households")
        .select("id")
        .eq("id", householdId)
        .eq("advisor_id", user.id)
        .maybeSingle();
      if (!owned) {
        res.status(403).json({ error: "household_not_owned" });
        return;
      }
    } else {
      const familyName = (body.familyName || body.fullName || "משפחה חדשה").trim();
      const { data: created, error: hhErr } = await sb
        .from("households")
        .insert({ advisor_id: user.id, family_name: familyName, members_count: 1, stage: "onboarding" })
        .select("id")
        .single();
      if (hhErr || !created) {
        res.status(500).json({ error: "household_create_failed", detail: hhErr?.message || "Unknown error" });
        return;
      }
      householdId = created.id;
    }

    const token = randomBytes(32).toString("base64url");

    const { error: insErr } = await sb.from("client_invites").insert({
      token,
      advisor_id: user.id,
      household_id: householdId,
      email,
    });
    if (insErr) {
      res.status(500).json({
        error: "invite_create_failed",
        detail: insErr.message,
        hint: "ייתכן שמיגרציה 0011 עוד לא הורצה ב-Supabase (חסרה טבלת client_invites).",
      });
      return;
    }

    const origin = env.FRONTEND_URL;
    const inviteUrl = `${origin}/login?invite=${encodeURIComponent(token)}`;
    const directPassword = (body.password || "").trim();
    let emailSent = false;
    let emailError: string | undefined;
    let passwordCreated = false;

    try {
      const admin = createAdminClient();
      if (directPassword) {
        const { error: createErr } = await admin.auth.admin.createUser({
          email,
          password: directPassword,
          email_confirm: true,
          user_metadata: {
            invite_token: token,
            full_name: body.fullName || undefined,
            family_name: body.familyName || undefined,
            invited_by: advisor?.full_name || undefined,
          },
        });
        if (createErr) emailError = createErr.message;
        else passwordCreated = true;
      } else {
        const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: {
            invite_token: token,
            full_name: body.fullName || undefined,
            family_name: body.familyName || undefined,
            invited_by: advisor?.full_name || undefined,
          },
          redirectTo: `${origin}/auth/callback`,
        });
        if (mailErr) {
          if (/already been registered|already registered/i.test(mailErr.message)) {
            const tpl = inviteEmail({
              clientName: body.fullName || undefined,
              advisorName: advisor?.full_name || "המתכנן שלך",
              inviteUrl,
            });
            const r = await sendEmail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html });
            if (r.ok) emailSent = true;
            else emailError = `user_exists: ${r.error || "resend_failed"}`;
          } else {
            emailError = mailErr.message;
          }
        } else {
          emailSent = true;
        }
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : "send_failed";
    }

    res.json({ ok: true, token, inviteUrl, householdId, email, emailSent, emailError, passwordCreated });
  })
);

invitesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data: invites, error } = await req.sb!
      .from("client_invites")
      .select("token, email, household_id, created_at, consumed_at, expires_at")
      .eq("advisor_id", req.user!.id)
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ invites: invites || [] });
  })
);
