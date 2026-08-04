import { Router } from "express";
import { parseDocument } from "@/lib/doc-parser";
import { deduplicateTransactions } from "@/lib/doc-parser/dedup";
import { primeMerchantCategoryRulesCacheFromDb } from "@/lib/doc-parser/merchant-category-rules.server";
import type { ParsedDocument } from "@/lib/doc-parser/types";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { upload } from "../lib/upload.js";
import { rateLimit, getClientIp, RATE_LIMITS } from "../lib/rate-limit.js";
import { isSafeXlsxContainer } from "../lib/safe-zip.js";

/**
 * POST /api/documents/parse — ported from app/api/documents/parse.
 * multipart/form-data (field "file" or "files"), returns ParsedDocument JSON.
 * Multi-file bulk upload with dedup. Reuses the doc-parser lib verbatim.
 */
export const documentsRouter = Router();

const ALLOWED_EXTS = ["pdf", "xlsx", "xls", "csv"];
const MAX_SIZE = 10 * 1024 * 1024;
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

documentsRouter.post(
  "/parse",
  requireUser,
  upload.any(),
  asyncHandler(async (req, res) => {
    const sb = req.sb!;

    await primeMerchantCategoryRulesCacheFromDb(sb).catch((error) => {
      console.warn("[documents/parse] merchant-category cache prime failed:", error);
    });

    const ip = getClientIp(req);
    const rl = rateLimit({ key: `parse:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      res.status(429).json({ error: "יותר מדי בקשות. נסה שוב בעוד דקה." });
      return;
    }

    const files = ((req.files as Express.Multer.File[]) || []).filter((f) => f.size > 0);
    if (files.length === 0) {
      res.status(400).json({ error: "לא צורפו קבצים" });
      return;
    }

    for (const file of files) {
      const ext = file.originalname.toLowerCase().split(".").pop();
      if (!ALLOWED_EXTS.includes(ext || "")) {
        res.status(400).json({ error: `סוג קובץ לא נתמך: ${file.originalname}. העלה PDF או Excel.` });
        return;
      }
      if (file.size > MAX_SIZE) {
        res.status(400).json({ error: `הקובץ ${file.originalname} גדול מדי (מקסימום 10MB)` });
        return;
      }
    }

    // Magic-byte validation (defense-in-depth vs CVE-2023-30533).
    for (const file of files) {
      const ext = file.originalname.toLowerCase().split(".").pop();
      const header = file.buffer.subarray(0, 8);
      if (ext === "pdf") {
        if (header.length < 4 || !header.subarray(0, 4).equals(PDF_MAGIC)) {
          res.status(400).json({ error: `הקובץ ${file.originalname} אינו PDF תקין — בדוק את המקור`, code: "INVALID_PDF" });
          return;
        }
      } else if (ext === "xlsx") {
        if (header.length < 4 || header[0] !== 0x50 || header[1] !== 0x4b) {
          res.status(400).json({ error: `הקובץ ${file.originalname} אינו Excel תקין (.xlsx)`, code: "INVALID_XLSX" });
          return;
        }
        if (!isSafeXlsxContainer(file.buffer)) {
          res.status(400).json({ error: `הקובץ ${file.originalname} גדול או מורכב מדי`, code: "UNSAFE_XLSX" });
          return;
        }
      } else if (ext === "xls") {
        if (header.length < 4 || header[0] !== 0xd0 || header[1] !== 0xcf || header[2] !== 0x11 || header[3] !== 0xe0) {
          res.status(400).json({ error: `הקובץ ${file.originalname} אינו Excel תקין (.xls)`, code: "INVALID_XLS" });
          return;
        }
      }
    }

    const parsedDocs: ParsedDocument[] = [];
    for (const file of files) {
      let result: ParsedDocument;
      try {
        result = await parseDocument(file.buffer, file.originalname);
      } catch {
        res.status(422).json({
          error: `לא ניתן לקרוא את הקובץ ${file.originalname} — ייתכן שהוא פגום או מוצפן`,
          code: "CORRUPT_FILE",
        });
        return;
      }
      parsedDocs.push(result);
    }

    if (parsedDocs.length === 1) {
      res.json(parsedDocs[0]);
      return;
    }

    const txArrays = parsedDocs.map((d) => ({ transactions: d.transactions, sourceFile: d.filename }));
    const { merged, duplicatesRemoved, sourceFiles } = deduplicateTransactions(txArrays);

    const allWarnings = parsedDocs.flatMap((d) => d.warnings.map((w) => `[${d.filename}] ${w}`));
    if (duplicatesRemoved > 0) {
      allWarnings.push(`זוהו ${duplicatesRemoved} תנועות כפולות בין הקבצים — הוסרו אוטומטית`);
    }

    const bankHints = [...new Set(parsedDocs.map((d) => d.bankHint).filter((h) => h !== "לא זוהה"))];
    const bankHint = bankHints.length > 0 ? bankHints.join(" + ") : "לא זוהה";

    const seenInst = new Set<string>();
    const allInstruments: NonNullable<ParsedDocument["instruments"]> = [];
    for (const doc of parsedDocs) {
      for (const inst of doc.instruments || []) {
        const key = `${inst.type}::${inst.institution}::${inst.identifier}`;
        if (!seenInst.has(key)) {
          seenInst.add(key);
          allInstruments.push(inst);
        }
      }
    }

    const totalDebit = merged.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalCredit = merged.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const dates = merged.map((t) => t.date).filter(Boolean).sort();

    res.json({
      filename: sourceFiles.join(" + "),
      type: parsedDocs[0].type,
      bankHint,
      transactions: merged,
      totalDebit,
      totalCredit,
      dateRange: { from: dates[0] || "", to: dates[dates.length - 1] || "" },
      warnings: allWarnings,
      instruments: allInstruments,
      sourceFiles,
      duplicatesRemoved,
    });
  })
);
