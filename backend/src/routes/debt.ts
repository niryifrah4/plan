import { Router } from "express";
import { parseAmortizationText } from "@/lib/doc-parser/amortization-pdf-parser";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { upload } from "../lib/upload.js";
import { rateLimit, RATE_LIMITS } from "../lib/rate-limit.js";

/**
 * POST /api/debt/parse-amortization — ported from app/api/debt/parse-amortization.
 * Single Israeli "לוח סילוקין" PDF -> structured mortgage tracks.
 */
export const debtRouter = Router();

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);
const PDF_PAGE_CAP = 30;

function sanitizeFilename(raw: string): string {
  const cleaned = raw.replace(/[^\w֐-׿\s\-_.()]/g, "").slice(0, 120).trim();
  return cleaned || "amortization.pdf";
}

debtRouter.post(
  "/parse-amortization",
  requireUser,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const errJson = (message: string, code: string, status: number) =>
      res.status(status).json({ error: message, code });

    const rl = rateLimit({ key: `amort-parse:${req.user!.id}`, ...RATE_LIMITS.UPLOAD });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
      res.status(429).json({ error: "יותר מדי בקשות. נסה שוב בעוד דקה.", code: "RATE_LIMITED" });
      return;
    }

    const file = req.file;
    if (!file) return errJson("לא הועלה קובץ. צרף לוח סילוקין בפורמט PDF.", "NO_FILE", 400);

    const name = file.originalname || "amortization.pdf";
    if (file.size > MAX_FILE_BYTES) return errJson("הקובץ גדול מדי, עד 20MB", "FILE_TOO_LARGE", 413);
    if (!/\.pdf$/i.test(name)) return errJson(`הקובץ ${name} אינו PDF — בדוק את סוג הקובץ`, "INVALID_EXTENSION", 400);

    const buffer = file.buffer;
    if (buffer.length < 4 || !buffer.subarray(0, 4).equals(PDF_MAGIC)) {
      return errJson("הקובץ אינו PDF תקין — בדוק את המקור", "INVALID_PDF", 400);
    }

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
      return errJson(`לא ניתן לקרוא את הקובץ (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
    }

    if (!text || text.trim().length < 50) {
      return errJson(
        "לא נמצא טקסט קריא ב-PDF — ייתכן שהקובץ סרוק. נסו לייצא PDF טקסטואלי מהאתר של הבנק.",
        "TEXT_LAYER_EMPTY",
        422
      );
    }

    const parsed = parseAmortizationText(text);
    res.json({ filename: sanitizeFilename(name), ...parsed });
  })
);
