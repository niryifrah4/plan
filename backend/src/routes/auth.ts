import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

/**
 * /api/auth/resolve-landing — ported from the role-routing half of
 * app/auth/callback/route.ts.
 *
 * Migration note: the OAuth *code exchange* now happens client-side (the SPA
 * Supabase client auto-detects ?code= in the URL). What remains server-side is
 * the role-based landing decision + pending-invite linking, which needs the
 * user's RLS client. The SPA calls this after login and navigates to `target`.
 */
export const authRouter = Router();

authRouter.use(requireUser);

authRouter.get(
  "/resolve-landing",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const user = req.user!;

    const { data: advisor, error: advError } = await sb.from("advisors").select("id").eq("id", user.id).maybeSingle();
    if (advisor) {
      res.json({ target: "/crm" });
      return;
    }

    let { data: client } = await sb
      .from("client_users")
      .select("household_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Link a pending invite matched by email (the DB trigger only fires on
    // user CREATE, so already-existing accounts get linked on first login).
    if (!client && user.email) {
      const { data: invite } = await sb
        .from("client_invites")
        .select("token, household_id")
        .eq("email", user.email.toLowerCase())
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invite) {
        await sb.from("client_users").insert({
          user_id: user.id,
          household_id: invite.household_id,
          email: user.email,
          full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
        });
        await sb
          .from("client_invites")
          .update({ consumed_at: new Date().toISOString() })
          .eq("token", invite.token);
        client = { household_id: invite.household_id };
      }
    }

    if (!client) {
      res.json({ target: "/login?error=missing_role" });
      return;
    }

    // Per Nir 2026-05-05: returning clients always land on /dashboard.
    res.json({ target: "/dashboard" });
  })
);
