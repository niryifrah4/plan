import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env, assertSupabaseEnv } from "./env.js";
import { healthRouter } from "./routes/health.js";
import { crmRouter } from "./routes/crm.js";
import { settingsRouter } from "./routes/settings.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { syncRouter } from "./routes/sync.js";
import { gcalRouter } from "./routes/gcal.js";
import { documentsRouter } from "./routes/documents.js";
import { debtRouter } from "./routes/debt.js";
import { categorizeRouter } from "./routes/categorize.js";
import { merchantCategoryRulesRouter } from "./routes/merchant-category-rules.js";
import { authRouter } from "./routes/auth.js";
import { cryptoRouter } from "./routes/crypto.js";
import { invitesRouter } from "./routes/invites.js";
import { impersonateRouter } from "./routes/impersonate.js";
import { pensionRouter } from "./routes/pension.js";
import { securitiesRouter } from "./routes/securities.js";
import { investmentsRouter } from "./routes/investments.js";
import { marketRouter } from "./routes/market.js";

const app = express();

// --- Global middleware ---
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// --- Routes ---
// Mirrors the old app/api/* tree. Each router that needs auth mounts
// requireUser internally (see routes/crm.ts).
app.use("/api/health", healthRouter);
// Mount the more specific /api/crm/invites before /api/crm so it isn't
// shadowed by crmRouter's prefix-matched auth middleware.
app.use("/api/crm/invites", invitesRouter);
app.use("/api/crm/impersonate", impersonateRouter);
app.use("/api/crm", crmRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/sync", syncRouter);
app.use("/api/gcal", gcalRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/debt", debtRouter);
app.use("/api/categorize", categorizeRouter);
app.use("/api/merchant-category-rules", merchantCategoryRulesRouter);
app.use("/api/auth", authRouter);
app.use("/api/crypto", cryptoRouter);
app.use("/api/pension", pensionRouter);
app.use("/api/securities", securitiesRouter);
app.use("/api/investments", investmentsRouter);
app.use("/api/market", marketRouter);

// --- 404 ---
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// --- Error handler ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "internal_error";
  console.error("[error]", err);
  res.status(500).json({ error: message });
});

// --- Boot ---
// Fail loud if Supabase env is missing in production (mirrors proxy.ts
// fail-closed behavior). In dev we warn but still boot so /api/health works.
try {
  assertSupabaseEnv();
} catch (e) {
  if (env.NODE_ENV === "production") throw e;
  console.warn(`[boot] ⚠️ ${(e as Error).message} — auth routes will 401 until set.`);
}

app.listen(env.PORT, () => {
  console.log(`[plan-backend] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`[plan-backend] CORS origins: ${env.CORS_ORIGINS.join(", ")}`);
});

export { app };
