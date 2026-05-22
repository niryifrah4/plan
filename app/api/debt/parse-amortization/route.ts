/**
 * POST /api/debt/parse-amortization
 *
 * Accepts a single Israeli bank "לוח סילוקין" PDF, extracts the text, and
 * returns a structured list of probable mortgage tracks. The client renders
 * a preview-and-confirm modal — the user can edit any field before the
 * tracks are saved into debt-store. Auth-required, household-scoped via RLS.
 *
 * Phase 4 (2026-05-21) — first iteration of bank-statement → mortgage tracks.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseAmortizationText } from "@/lib/doc-parser/amortization-pdf-parser";
import { requireUser } from "@/lib/supabase/require-user";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
/** A typical Israeli "לוח סילוקין" is 2-5 pages. Anything beyond 30 is
 *  either junk or a PDF-bomb attempt — pdf-parse loads every page's text
 *  into memory, so we cap. */
const PDF_PAGE_CAP = 30;

function errJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

/** Strip control chars + length-cap a filename so it can't break the UI when
 *  we echo it back to the client. React already escapes JSX text, so this is
 *  defense-in-depth rather than an XSS fix. */
function sanitizeFilename(raw: string): string {
  const cleaned = raw.replace(/[^\w֐-׿\s\-_.()]/g, "").slice(0, 120).trim();
  return cleaned || "amortization.pdf";
}

export async function POST(req: NextRequest) {
  try {
    // Auth guard — same pattern as the pension PDF route.
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    // Rate limit — keyed per authenticated user. Parsing a 20MB PDF is
    // expensive (Node memory + CPU), so we cap at the existing UPLOAD preset
    // of 10/min. Returns 429 with Retry-After header.
    const rl = rateLimit({ key: `amort-parse:${auth.user.id}`, ...RATE_LIMITS.UPLOAD });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי בקשות. נסה שוב בעוד דקה.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
        }
      );
    }

    const formData = await req.formData();
    const entry = formData.get("file");

    if (!(entry instanceof File)) {
      return errJson("לא הועלה קובץ. צרף לוח סילוקין בפורמט PDF.", "NO_FILE", 400);
    }

    const name = entry.name || "amortization.pdf";

    if (entry.size > MAX_FILE_BYTES) {
      return errJson("הקובץ גדול מדי, עד 20MB", "FILE_TOO_LARGE", 413);
    }
    if (!/\.pdf$/i.test(name)) {
      return errJson(`הקובץ ${name} אינו PDF — בדוק את סוג הקובץ`, "INVALID_EXTENSION", 400);
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    if (buffer.length < 4 || !buffer.subarray(0, 4).equals(PDF_MAGIC)) {
      return errJson("הקובץ אינו PDF תקין — בדוק את המקור", "INVALID_PDF", 400);
    }

    // Extract text via pdf-parse. Encrypted / corrupted PDFs surface a sharp
    // Hebrew error so the user knows what to fix. Cap pages to prevent a
    // PDF-bomb (small file → huge text expansion) from OOMing Render.
    // @ts-ignore — pdf-parse has no proper types
    const pdfParse = (await import("pdf-parse")).default;
    let text: string;
    try {
      const result = await pdfParse(buffer, { max: PDF_PAGE_CAP });
      text = result.text || "";
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[parse-amortization] pdf-parse failed:", reason);
      if (/password|encrypt/i.test(reason)) {
        return errJson("הקובץ מוגן בסיסמה — הסר את ההגנה ונסה שוב", "ENCRYPTED_PDF", 422);
      }
      return errJson(
        `לא ניתן לקרוא את הקובץ (${reason.slice(0, 120)})`,
        "CORRUPT_PDF",
        422
      );
    }

    if (!text || text.trim().length < 50) {
      return errJson(
        "לא נמצא טקסט קריא ב-PDF — ייתכן שהקובץ סרוק. נסו לייצא PDF טקסטואלי מהאתר של הבנק.",
        "TEXT_LAYER_EMPTY",
        422
      );
    }

    const parsed = parseAmortizationText(text);

    return NextResponse.json({
      filename: sanitizeFilename(name),
      ...parsed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא צפויה בעיבוד הקובץ";
    console.error("[parse-amortization] unexpected:", e);
    return NextResponse.json({ error: message, code: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}
