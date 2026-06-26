import { Router } from "express";
import { z } from "zod";
import { ISSUER_STATUS_IDS } from "@/lib/doc-parser/issuer-registry";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../lib/validate.js";

/**
 * /api/settings/* — ported from app/api/settings/preferences + issuer-status.
 *
 * Migration note: preferences used a Next.js cookie (ai_categorizer_model).
 * Here we use an Express cookie (cookie-parser + res.cookie). The Vite dev
 * proxy keeps it same-origin; in prod the SPA must fetch with credentials so
 * the cookie round-trips. The categorize route reads the same cookie.
 */
export const settingsRouter = Router();

settingsRouter.use(requireUser);

const PrefsSchema = z.object({
  preferences: z.object({
    ai_categorizer: z.enum(["haiku", "perplexity"]).optional(),
  }),
});

settingsRouter.get("/preferences", (req, res) => {
  const aiModel = req.cookies?.ai_categorizer_model || "haiku";
  res.json({ preferences: { ai_categorizer: aiModel } });
});

settingsRouter.patch("/preferences", (req, res) => {
  const parsed = validate(req.body, PrefsSchema, res);
  if (!parsed.ok) return;
  const model = parsed.data.preferences.ai_categorizer;
  if (model) {
    res.cookie("ai_categorizer_model", model, {
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 365,
      httpOnly: false,
      sameSite: "lax",
    });
  }
  res.json({ success: true, preferences: parsed.data.preferences });
});

const PatchIssuerStatusSchema = z.object({
  issuerId: z.string().min(1),
  verified: z.boolean(),
  notes: z.string().max(1000).nullable().optional(),
});

settingsRouter.get(
  "/issuer-status",
  asyncHandler(async (req, res) => {
    const { data, error } = await req.sb!
      .from("issuer_mapping_status")
      .select("issuer_id, verified, notes, updated_at, updated_by")
      .order("issuer_id");
    if (error) {
      console.error("[issuer-status] read failed:", error);
      res.status(500).json({ ok: false, error: "read_failed" });
      return;
    }
    res.json({ ok: true, statuses: data ?? [] });
  })
);

settingsRouter.patch(
  "/issuer-status",
  asyncHandler(async (req, res) => {
    const parsed = validate(req.body, PatchIssuerStatusSchema, res);
    if (!parsed.ok) return;

    const issuerId = parsed.data.issuerId.trim();
    if (!ISSUER_STATUS_IDS.has(issuerId)) {
      res.status(400).json({ ok: false, error: "unknown_issuer" });
      return;
    }
    const notes = parsed.data.notes?.trim() || null;
    const { data, error } = await req.sb!
      .from("issuer_mapping_status")
      .upsert(
        {
          issuer_id: issuerId,
          verified: parsed.data.verified,
          notes,
          updated_by: req.user!.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "issuer_id" }
      )
      .select("issuer_id, verified, notes, updated_at, updated_by")
      .single();
    if (error) {
      console.error("[issuer-status] write failed:", error);
      res.status(500).json({ ok: false, error: "write_failed" });
      return;
    }
    res.json({ ok: true, status: data });
  })
);
