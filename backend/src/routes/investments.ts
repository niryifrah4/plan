import { Router } from "express";
import { z } from "zod";
import {
  analyzeBrokerReport,
  extractBrokerPdf,
  tryDeterministicParse,
  extractTransactionsAi,
  PdfPasswordRequiredError,
  PdfPasswordWrongError,
  type ExtractedPdf,
} from "@/lib/doc-parser/broker-pdf-parser";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { upload } from "../lib/upload.js";
import { assertHouseholdAccess } from "../lib/household-auth.js";

/**
 * /api/investments/* — ported from app/api/investments (reset, parse-report,
 * reports). Household-scoped via assertHouseholdAccess (defense-in-depth
 * beyond RLS). parse-report reuses the broker-pdf-parser lib.
 */
export const investmentsRouter = Router();

investmentsRouter.use(requireUser);

// DELETE /api/investments/reset?householdId=<uuid>
investmentsRouter.delete(
  "/reset",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const householdId = typeof req.query.householdId === "string" ? req.query.householdId : null;
    if (!householdId) {
      res.status(400).json({ error: "Missing household ID" });
      return;
    }
    if (!(await assertHouseholdAccess(sb, req.user!.id, householdId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { error: clientStateError } = await sb
      .from("client_state")
      .delete()
      .eq("household_id", householdId)
      .in("state_key", ["portfolio_positions", "portfolio_accounts"]);
    if (clientStateError) {
      console.error("[investments/reset] client_state delete failed:", clientStateError.message);
      res.status(500).json({ error: "Failed to delete portfolio data" });
      return;
    }

    const { error: reportsError } = await sb
      .from("investment_reports")
      .delete()
      .eq("household_id", householdId);
    if (reportsError) {
      console.error("[investments/reset] investment_reports delete failed:", reportsError.message);
      res.status(500).json({ error: "Failed to delete investment reports" });
      return;
    }

    res.json({ ok: true, message: "Investment data reset successfully" });
  })
);

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

// POST /api/investments/parse-report
investmentsRouter.post(
  "/parse-report",
  upload.any(),
  asyncHandler(async (req, res) => {
    const errJson = (message: string, code: string, status: number) =>
      res.status(status).json({ error: message, code });

    const entry = ((req.files as Express.Multer.File[]) || [])[0];
    const password = (req.body?.password as string | undefined)?.trim() || undefined;

    if (!entry) return errJson("לא הועלה קובץ. צרף דוח PDF מבית ההשקעות.", "NO_FILES", 400);
    if (entry.size > MAX_FILE_BYTES) return errJson("הקובץ גדול מדי, עד 20MB", "FILE_TOO_LARGE", 413);

    const name = entry.originalname || "report.pdf";
    const buffer = entry.buffer;
    if (!buffer.subarray(0, 4).equals(PDF_MAGIC)) {
      return errJson(`הקובץ ${name} אינו PDF תקין`, "INVALID_FILE_TYPE", 400);
    }

    let extracted: ExtractedPdf;
    try {
      extracted = await extractBrokerPdf(buffer, password);
    } catch (err) {
      if (err instanceof PdfPasswordRequiredError) {
        return errJson("הקובץ מוגן בסיסמה — הזן את הסיסמה כדי לנתח אותו", "PASSWORD_REQUIRED", 422);
      }
      if (err instanceof PdfPasswordWrongError) {
        return errJson("הסיסמה שגויה — נסה שוב", "PASSWORD_WRONG", 422);
      }
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[parse-report] extraction failed:", reason);
      return errJson(`לא ניתן לקרוא את הקובץ (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
    }

    if (!extracted.text.trim()) {
      return errJson("לא נמצא טקסט בקובץ — ייתכן שהוא סרוק כתמונה. נסה קובץ אחר.", "EMPTY_PDF", 422);
    }

    let report = tryDeterministicParse(extracted);
    let method: "deterministic" | "ai" = "deterministic";
    if (!report) {
      method = "ai";
      report = await analyzeBrokerReport(extracted.text, name);
    } else if (report.transactions.length === 0 && report.holdings.length > 0) {
      const aiTransactions = await extractTransactionsAi(extracted.text);
      if (aiTransactions.length > 0) report.transactions = aiTransactions;
    }

    res.json({ report, method });
  })
);

const HoldingSchema = z.object({
  securityNumber: z.string().default(""),
  name: z.string().default(""),
  symbol: z.string().default(""),
  assetKind: z.enum(["stock", "etf", "crypto", "bond", "fund", "cash"]).default("stock"),
  quantity: z.number().default(0),
  priceCurrent: z.number().default(0),
  valueIls: z.number().default(0),
  costIls: z.number().default(0),
  pctOfPortfolio: z.number().default(0),
});

const TransactionSchema = z.object({
  date: z.string().default(""),
  type: z.string().default(""),
  name: z.string().default(""),
  quantity: z.number().default(0),
  amount: z.number().default(0),
});

const ReportSchema = z.object({
  broker: z.string().default("לא זוהה"),
  accountNumber: z.string().default(""),
  reportDate: z.string().default(""),
  currency: z.string().default("ILS"),
  totalValueIls: z.number().default(0),
  holdings: z.array(HoldingSchema).default([]),
  transactions: z.array(TransactionSchema).default([]),
  warnings: z.array(z.string()).optional(),
});

const BodySchema = z.object({
  householdId: z.string().uuid(),
  report: ReportSchema,
});

// POST /api/investments/reports
investmentsRouter.post(
  "/reports",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const user = req.user!;

    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(req.body);
    } catch (e) {
      const detail = e instanceof z.ZodError ? e.issues.map((i) => i.message).join(", ") : "invalid body";
      res.status(400).json({ ok: false, error: "invalid_body", detail });
      return;
    }

    const { householdId, report } = body;
    if (!(await assertHouseholdAccess(sb, user.id, householdId))) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    const broker = report.broker || "";
    const accountNumber = report.accountNumber || "";
    const reportDate = report.reportDate || null;

    const { data: existing } = await sb
      .from("investment_reports")
      .select("id, report_date")
      .eq("household_id", householdId)
      .eq("broker", broker)
      .eq("account_number", accountNumber)
      .eq("report_date", reportDate || "1970-01-01")
      .maybeSingle();

    const row = {
      household_id: householdId,
      broker,
      account_number: accountNumber,
      report_date: reportDate,
      currency: report.currency,
      total_value_ils: report.totalValueIls,
      holdings: report.holdings,
      transactions: report.transactions,
      summary: {
        holdingCount: report.holdings.length,
        transactionCount: report.transactions.length,
      },
      created_by: user.id,
      created_at: new Date().toISOString(),
    };

    let data: { id: string } | null = null;
    let error = null as { message: string } | null;
    let replaced = !!existing;

    if (existing) {
      const result = await sb.from("investment_reports").update(row).eq("id", existing.id).select("id").single();
      data = result.data;
      error = result.error;
    } else {
      const result = await sb.from("investment_reports").insert(row).select("id").single();
      data = result.data;
      error = result.error;
      if (error && /duplicate key value/i.test(error.message)) {
        const retry = await sb
          .from("investment_reports")
          .update(row)
          .eq("household_id", householdId)
          .eq("broker", broker)
          .eq("account_number", accountNumber)
          .eq("report_date", reportDate || "1970-01-01")
          .select("id")
          .single();
        data = retry.data;
        error = retry.error;
        replaced = !retry.error;
      }
    }

    if (error || !data) {
      const detail = error?.message || "no_saved_row";
      console.error("[investments/reports] save failed:", detail);
      res.status(500).json({ ok: false, error: "save_failed", detail });
      return;
    }

    const { data: newer } = await sb
      .from("investment_reports")
      .select("id")
      .eq("household_id", householdId)
      .eq("broker", broker)
      .eq("account_number", accountNumber)
      .gt("report_date", reportDate || "1970-01-01")
      .limit(1)
      .maybeSingle();

    res.json({ ok: true, id: data.id, replaced, isLatest: !newer });
  })
);

// GET /api/investments/reports?householdId=<uuid>
investmentsRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const householdId = typeof req.query.householdId === "string" ? req.query.householdId : null;
    if (!householdId) {
      res.status(400).json({ ok: false, error: "missing_household" });
      return;
    }
    if (!(await assertHouseholdAccess(sb, req.user!.id, householdId))) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    const { data, error } = await sb
      .from("investment_reports")
      .select(
        "id, broker, account_number, report_date, currency, total_value_ils, holdings, transactions, summary, created_at"
      )
      .eq("household_id", householdId)
      .order("report_date", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      res.status(500).json({ ok: false, error: "query_failed", detail: error.message });
      return;
    }
    res.json({ ok: true, reports: data ?? [] });
  })
);

// DELETE /api/investments/reports?householdId=<uuid>&reportId=<uuid>
investmentsRouter.delete(
  "/reports",
  asyncHandler(async (req, res) => {
    const sb = req.sb!;
    const householdId = typeof req.query.householdId === "string" ? req.query.householdId : null;
    const reportId = typeof req.query.reportId === "string" ? req.query.reportId : null;
    if (!householdId || !reportId) {
      res.status(400).json({ ok: false, error: "missing_params" });
      return;
    }
    if (!(await assertHouseholdAccess(sb, req.user!.id, householdId))) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    const { error } = await sb
      .from("investment_reports")
      .delete()
      .eq("id", reportId)
      .eq("household_id", householdId);
    if (error) {
      console.error("[investments/reports] delete failed:", error.message);
      res.status(500).json({ ok: false, error: "delete_failed", detail: error.message });
      return;
    }
    res.json({ ok: true });
  })
);
