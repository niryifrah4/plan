import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../lib/validate.js";
import { assertHouseholdAccess } from "../lib/household-auth.js";

/**
 * POST /api/sync/blob — ported from app/api/sync/blob.
 * Atomic client_state upsert with optimistic concurrency via the
 * upsert_client_state RPC. There is one write command and one transaction
 * boundary; legacy direct table writes are intentionally not supported.
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
      console.error("[sync/blob] canonical RPC failed", error.message);
      res.status(500).json({ ok: false, error: "upsert_failed" });
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

syncRouter.get(
  "/blob",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const parsed = validate(req.query, z.object({
      key: z.string().trim().min(1).max(200),
      householdId: z.string().uuid(),
    }), res);
    if (!parsed.ok) return;
    const { key, householdId } = parsed.data;
    const allowed = await assertHouseholdAccess(sb, req.user!.id, householdId);
    if (!allowed) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const { data, error } = await sb
      .from("client_state")
      .select("state_value, version")
      .eq("household_id", householdId)
      .eq("state_key", key)
      .maybeSingle();
    if (error) {
      console.error("[sync/blob] read failed", error.message);
      res.status(500).json({ ok: false, error: "read_failed" });
      return;
    }
    res.json({ ok: true, value: data?.state_value ?? null, version: data?.version ?? null });
  })
);
