import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

/**
 * POST /api/onboarding/complete — ported from app/api/onboarding/complete.
 * Flips the caller's household stage onboarding -> active. RLS ensures the
 * UPDATE only touches rows the user owns.
 */
export const onboardingRouter = Router();

onboardingRouter.use(requireUser);

onboardingRouter.post(
  "/complete",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const { data: client } = await sb
      .from("client_users")
      .select("household_id")
      .eq("user_id", req.user!.id)
      .maybeSingle();
    if (!client) {
      res.status(404).json({ error: "not_a_client" });
      return;
    }
    const { error } = await sb
      .from("households")
      .update({ stage: "active" })
      .eq("id", client.household_id);
    if (error) {
      res.status(500).json({ error: "update_failed", detail: error.message });
      return;
    }
    res.json({ ok: true });
  })
);
