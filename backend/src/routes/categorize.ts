import { Router } from "express";
import { z } from "zod";
import {
  categorizeWithAI,
  interactiveCategorizeWithAI,
  type TxToClassify,
  type PastCorrection,
} from "@/lib/doc-parser/ai-categorizer";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../lib/validate.js";
import { rateLimit, getClientIp, RATE_LIMITS } from "../lib/rate-limit.js";

/**
 * /api/categorize + /api/categorize/interactive — ported from
 * app/api/categorize. Server-side wrappers around the AI categorizer
 * (ANTHROPIC_API_KEY is server-only). The model is chosen from the
 * ai_categorizer_model cookie (set by /api/settings/preferences).
 */
export const categorizeRouter = Router();

categorizeRouter.use(requireUser);

const MAX_TXS = 200;

const BodySchema = z.object({
  transactions: z.array(z.record(z.string(), z.unknown())).max(MAX_TXS).optional(),
  pastCorrections: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
});

function pickModel(cookie: string | undefined): "perplexity" | "haiku" {
  return cookie === "perplexity" ? "perplexity" : "haiku";
}

categorizeRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `categorize:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      res.status(429).json({ error: "יותר מדי בקשות סיווג. נסה שוב בעוד דקה." });
      return;
    }

    const parsed = validate(req.body, BodySchema, res);
    if (!parsed.ok) return;

    const txs = (parsed.data.transactions ?? []) as unknown as TxToClassify[];
    const corrections = (parsed.data.pastCorrections ?? []) as unknown as PastCorrection[];
    if (txs.length === 0) {
      res.json({ suggestions: [] });
      return;
    }

    const aiModel = pickModel(req.cookies?.ai_categorizer_model);
    const suggestions = await categorizeWithAI(txs, corrections, aiModel);
    res.json({ suggestions });
  })
);

const InteractiveSchema = z.object({
  merchantKey: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(2000),
});

categorizeRouter.post(
  "/interactive",
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `categorize-interactive:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      res.status(429).json({ error: "יותר מדי קריאות, נסה שוב בעוד דקה." });
      return;
    }

    const parsed = validate(req.body, InteractiveSchema, res);
    if (!parsed.ok) return;

    const aiModel = pickModel(req.cookies?.ai_categorizer_model);
    const result = await interactiveCategorizeWithAI(parsed.data.merchantKey, parsed.data.description, aiModel);
    if (!result) {
      res.status(500).json({ error: "שגיאה בקבלת תשובה מה-AI" });
      return;
    }
    res.json(result);
  })
);
