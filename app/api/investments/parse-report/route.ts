/**
 * POST /api/investments/parse-report
 *
 * Accepts a multipart upload of one investment-house statement PDF (e.g. IBI),
 * decrypts it if it is password-protected (the `password` field), extracts a
 * position-ordered text layer, and runs it through Claude to return a
 * structured holdings + transactions bundle the client can preview and save.
 *
 * Does NOT persist anything — saving goes through POST /api/investments/reports
 * (and the client also merges the holdings into its local portfolio).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import {
  analyzeBrokerReport,
  extractBrokerPdf,
  tryDeterministicParse,
  extractTransactionsAi,
  PdfPasswordRequiredError,
  PdfPasswordWrongError,
  type ExtractedPdf,
} from "@/lib/doc-parser/broker-pdf-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

function errJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const formData = await req.formData();
    const entry = formData.getAll("files").find((e) => e instanceof File) as File | undefined;
    const password = (formData.get("password") as string | null)?.trim() || undefined;

    if (!entry) {
      return errJson("לא הועלה קובץ. צרף דוח PDF מבית ההשקעות.", "NO_FILES", 400);
    }
    if (entry.size > MAX_FILE_BYTES) {
      return errJson("הקובץ גדול מדי, עד 20MB", "FILE_TOO_LARGE", 413);
    }

    const name = entry.name || "report.pdf";
    const buffer = Buffer.from(await entry.arrayBuffer());
    if (!buffer.subarray(0, 4).equals(PDF_MAGIC)) {
      return errJson(`הקובץ ${name} אינו PDF תקין`, "INVALID_FILE_TYPE", 400);
    }

    // ── Decrypt + extract text ──
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
      return errJson(
        "לא נמצא טקסט בקובץ — ייתכן שהוא סרוק כתמונה. נסה קובץ אחר.",
        "EMPTY_PDF",
        422
      );
    }

    // ── Tier 1: deterministic parse (only succeeds when it reconciles) ──
    let report = tryDeterministicParse(extracted);
    let method: "deterministic" | "ai" = "deterministic";

    // ── Tier 2: Claude fallback when deterministic can't parse the layout ──
    if (!report) {
      method = "ai";
      report = await analyzeBrokerReport(extracted.text, name);
    } else if (report.transactions.length === 0 && report.holdings.length > 0) {
      // ── Tier 2b: If deterministic found holdings but no transactions, run AI for transactions ──
      const aiTransactions = await extractTransactionsAi(extracted.text);
      if (aiTransactions.length > 0) {
        report.transactions = aiTransactions;
      }
    }

    return NextResponse.json({ report, method });
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא צפויה בעיבוד הקובץ";
    return NextResponse.json({ error: message, code: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}
