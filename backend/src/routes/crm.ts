import { Router } from "express";
import { z } from "zod";
import { requireUser, requireAdvisor } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../lib/validate.js";

/**
 * /api/crm/* — advisor-only surfaces.
 * Ported from app/api/crm/clients/route.ts. The proxy.ts edge-level advisor
 * gate is now requireAdvisor middleware mounted on the whole router.
 */
export const crmRouter = Router();

crmRouter.use(requireUser, requireAdvisor);

/**
 * GET /api/crm/clients
 * Returns the advisor's real client households, filtering orphaned
 * self-signup households (auth-trigger ghosts with zero linked client_users).
 */
crmRouter.get(
  "/clients",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const user = req.user!;

    const { data: households, error } = await sb
      .from("households")
      .select(
        "id, family_name, members_count, stage, created_at, signup_source, client_users(count)"
      )
      .eq("advisor_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    type Row = {
      id: string;
      family_name: string;
      members_count: number;
      stage: string;
      created_at: string;
      signup_source: string;
      client_users: { count: number }[];
    };

    const rows = (households || []) as Row[];
    const visible = rows.filter((h) => {
      const linked = h.client_users?.[0]?.count ?? 0;
      if (h.signup_source === "self_signup" && linked === 0) return false;
      return true;
    });

    const householdIds = visible.map((h) => h.id);

    const [netWorthRes, docHistoryRes] = await Promise.all([
      sb.from("v_net_worth").select("household_id, net_worth").in("household_id", householdIds),
      sb
        .from("client_state")
        .select("household_id, state_value")
        .eq("state_key", "doc_history")
        .in("household_id", householdIds),
    ]);

    const netWorthMap = Object.fromEntries(
      (netWorthRes.data ?? []).map((r) => [r.household_id, r.net_worth as number])
    );
    type DocEntry = { filename: string; uploadedAt: string; bankHint?: string };
    const docDataMap = Object.fromEntries(
      (docHistoryRes.data ?? []).map((r) => {
        const arr = Array.isArray(r.state_value) ? (r.state_value as DocEntry[]) : [];
        return [r.household_id, arr];
      })
    );

    const cleaned = visible.map(({ client_users, ...rest }) => {
      void client_users;
      const docs = docDataMap[rest.id] ?? [];
      return {
        ...rest,
        net_worth: netWorthMap[rest.id] ?? null,
        docs_uploaded: docs.length,
        docs_list: docs.map((d: DocEntry) => ({
          filename: d.filename,
          uploadedAt: d.uploadedAt,
          bankHint: d.bankHint ?? null,
        })),
      };
    });

    res.json({ households: cleaned });
  })
);

/**
 * POST /api/crm/households — ported from app/api/crm/households.
 * Creates a household owned by the calling advisor (lead-conversion flow).
 */
const CreateHouseholdSchema = z.object({
  familyName: z.string().trim().min(1).max(200),
  membersCount: z.number().int().positive().max(20).optional(),
});

crmRouter.post(
  "/households",
  asyncHandler(async (req, res) => {
    const parsed = validate(req.body, CreateHouseholdSchema, res);
    if (!parsed.ok) return;

    const { data: created, error } = await req.sb!
      .from("households")
      .insert({
        advisor_id: req.user!.id,
        family_name: parsed.data.familyName.trim(),
        members_count: parsed.data.membersCount ?? 1,
        stage: "onboarding",
        signup_source: "lead_conversion",
      })
      .select("id, family_name, members_count, stage, created_at")
      .single();

    if (error || !created) {
      res.status(500).json({ error: "household_create_failed", detail: error?.message ?? "unknown" });
      return;
    }
    res.json({ ok: true, household: created });
  })
);

/**
 * POST /api/crm/clients/:id/stage — ported from
 * app/api/crm/clients/[id]/stage. Updates a household's stage.
 */
const ALLOWED_STAGES = new Set(["onboarding", "active", "review", "archived"]);

crmRouter.post(
  "/clients/:id/stage",
  asyncHandler(async (req, res) => {
    const householdId = req.params.id;
    const stage = String((req.body as { stage?: string })?.stage || "");
    if (!ALLOWED_STAGES.has(stage)) {
      res.status(400).json({ error: "invalid stage" });
      return;
    }
    const { error } = await req.sb!.from("households").update({ stage }).eq("id", householdId);
    if (error) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    res.json({ ok: true, stage });
  })
);
