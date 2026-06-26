import { Router } from "express";
import {
  insertMerchantCategoryVotes,
  loadMerchantCategoryRulesFromDb,
  primeMerchantCategoryRulesCacheFromDb,
  deleteMerchantCategoryVotes,
} from "@/lib/doc-parser/merchant-category-rules.server";
import { safeParse } from "../lib/safe-json.js";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

/**
 * /api/merchant-category-rules — ported from app/api/merchant-category-rules.
 * Shared merchant→category learning votes. Reuses the server lib verbatim.
 */
export const merchantCategoryRulesRouter = Router();

merchantCategoryRulesRouter.use(requireUser);

const MAX_BULK_VOTES = 1000;

type VoteInput = {
  merchantKey?: unknown;
  categoryKey?: unknown;
  txCount?: unknown;
  sampleDescription?: unknown;
  sourceFile?: unknown;
};

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/["‏‎]/g, "").replace(/\s+/g, " ").trim().toLowerCase()
    : "";
}

function normalizeVote(input: VoteInput) {
  const merchantKey = cleanText(input?.merchantKey);
  const categoryKey = cleanText(input?.categoryKey);
  const txCount = Math.max(1, Math.floor(Number(input?.txCount) || 1));
  const sampleDescription =
    typeof input?.sampleDescription === "string" ? input.sampleDescription.trim() : undefined;
  const sourceFile = typeof input?.sourceFile === "string" ? input.sourceFile.trim() : undefined;
  if (!merchantKey || !categoryKey) return null;
  return { merchantKey, categoryKey, txCount, sampleDescription, sourceFile };
}

merchantCategoryRulesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rules = await loadMerchantCategoryRulesFromDb(req.sb!);
    res.json({ rules });
  })
);

merchantCategoryRulesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body as { vote?: VoteInput; votes?: VoteInput[] } | null;
    const votes = Array.isArray(body?.votes)
      ? body!.votes.map(normalizeVote).filter(Boolean)
      : body?.vote
        ? [normalizeVote(body.vote)].filter(Boolean)
        : [];

    if (votes.length === 0) {
      res.json({ ok: true, inserted: 0 });
      return;
    }
    if (votes.length > MAX_BULK_VOTES) {
      res.status(413).json({ ok: false, error: "too_many_votes" });
      return;
    }

    try {
      const { inserted } = await insertMerchantCategoryVotes(
        req.sb!,
        req.user!.id,
        votes as never
      );
      const rules = await primeMerchantCategoryRulesCacheFromDb(req.sb!);
      res.json({ ok: true, inserted, rules });
    } catch (error) {
      console.error("[merchant-category-rules] write failed:", error);
      res.status(500).json({ ok: false, error: "write_failed" });
    }
  })
);

merchantCategoryRulesRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    try {
      const merchantKey = typeof req.query.merchantKey === "string" ? req.query.merchantKey : null;
      const merchantKeysRaw = typeof req.query.merchantKeys === "string" ? req.query.merchantKeys : null;

      let keysToDelete: string[] = [];
      if (merchantKey) {
        keysToDelete.push(merchantKey);
      } else if (merchantKeysRaw) {
        const parsed = safeParse<unknown>(merchantKeysRaw, null, "merchant-rules:DELETE");
        if (Array.isArray(parsed)) {
          keysToDelete = parsed.filter((k): k is string => typeof k === "string");
        }
      }

      if (keysToDelete.length === 0) {
        res.status(400).json({ ok: false, error: "missing_keys" });
        return;
      }

      await deleteMerchantCategoryVotes(req.sb!, keysToDelete);
      const rules = await primeMerchantCategoryRulesCacheFromDb(req.sb!);
      res.json({ ok: true, deleted: true, rules });
    } catch (error) {
      console.error("[merchant-category-rules] delete failed:", error);
      res.status(500).json({ ok: false, error: "delete_failed" });
    }
  })
);
