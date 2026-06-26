import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../lib/validate.js";
import { assertHouseholdAccess } from "../lib/household-auth.js";

/**
 * POST /api/sync/blob — ported from app/api/sync/blob.
 * Atomic client_state upsert with optimistic concurrency via the
 * upsert_client_state RPC, with a legacy fallback for pre-migration DBs.
 */
export const syncRouter = Router();

syncRouter.use(requireUser);

const BodySchema = z.object({
  key: z.string().trim().min(1).max(200),
  householdId: z.string().uuid(),
  value: z.unknown().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

syncRouter.post(
  "/blob",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const parsed = validate(req.body, BodySchema, res);
    if (!parsed.ok) return;
    const { key, householdId, value, expectedVersion } = parsed.data;

    const allowed = await assertHouseholdAccess(sb, req.user!.id, householdId);
    if (!allowed) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    const { data, error } = await sb.rpc("upsert_client_state", {
      p_household: householdId,
      p_key: key,
      p_value: (value ?? null) as never,
      p_expected: expectedVersion ?? null,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "PGRST202" || code === "42883") {
        const { error: upErr } = await sb
          .from("client_state")
          .upsert(
            { household_id: householdId, state_key: key, state_value: (value ?? null) as never },
            { onConflict: "household_id,state_key" }
          );
        if (upErr) {
          res.status(500).json({ ok: false, error: "upsert_failed", detail: upErr.message });
          return;
        }
        res.json({ ok: true, version: null });
        return;
      }
      res.status(500).json({ ok: false, error: "upsert_failed", detail: error.message });
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.out_conflict) {
      res.status(409).json({
        ok: false,
        error: "version_conflict",
        serverVersion: row.out_version,
        serverValue: row.out_value,
      });
      return;
    }
    res.json({ ok: true, version: row?.out_version ?? null });
  })
);
