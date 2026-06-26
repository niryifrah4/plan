import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { reportError } from "../lib/report-error.js";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { validate } from "../lib/validate.js";

/**
 * POST /api/crypto/binance/balances — ported from
 * app/api/crypto/binance/balances. Server-side Binance proxy (solves CORS,
 * keeps HMAC signing off the client). Read-only API keys only.
 */
export const cryptoRouter = Router();

cryptoRouter.use(requireUser);

const BINANCE_BASE = "https://api.binance.com";
const RECV_WINDOW = 10_000;

const BodySchema = z.object({
  apiKey: z.string().trim().min(1).max(256),
  secret: z.string().trim().min(1).max(256),
});

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

cryptoRouter.post(
  "/binance/balances",
  asyncHandler(async (req, res) => {
    const parsed = validate(req.body, BodySchema, res);
    if (!parsed.ok) return;
    const { apiKey, secret } = parsed.data;

    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}&recvWindow=${RECV_WINDOW}`;
    const signature = crypto.createHmac("sha256", secret).update(queryString).digest("hex");
    const url = `${BINANCE_BASE}/api/v3/account?${queryString}&signature=${signature}`;

    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(15_000),
      });

      if (!r.ok) {
        const text = await r.text();
        let detail: unknown = text;
        try {
          detail = JSON.parse(text);
        } catch (e) {
          reportError("api/crypto/binance/balances", e);
        }
        res
          .status(r.status === 401 || r.status === 403 ? 401 : 502)
          .json({ error: `Binance returned ${r.status}`, detail });
        return;
      }

      const data = (await r.json()) as { balances?: BinanceBalance[] };
      const balances = (data.balances ?? [])
        .map((b) => {
          const free = parseFloat(b.free) || 0;
          const locked = parseFloat(b.locked) || 0;
          return { asset: b.asset, free, locked, total: free + locked };
        })
        .filter((b) => b.total > 0);
      res.json({ balances });
    } catch (err) {
      res.status(502).json({
        error: "Failed to reach Binance",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })
);
