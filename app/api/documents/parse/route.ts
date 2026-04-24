/**
 * POST /api/documents/parse
 * Accepts multipart/form-data with one or more files, returns ParsedDocument JSON.
 * Supports multi-file bulk upload with deduplication.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/doc-parser";
import { deduplicateTransactions } from "@/lib/doc-parser/dedup";
import type { ParsedDocument } from "@/lib/doc-parser/types";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/supabase/require-user";

const ALLOWED_EXTS = ["pdf", "xlsx", "xls", "csv"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB per file
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

export async function POST(req: NextRequest) {
  try {
    // ── Auth guard ──
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    // ── Rate limit ──
    const ip = getClientIp(req.headers);
    const rl = rateLimit({ key: `parse:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי בקשות. נסה שוב בעוד דקה." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const formData = await req.formData();

    // Collect all files (support both "file" and "files" field names)
    const files: File[] = [];
    for (const [, value] of formData.entries()) {
      if (value instanceof File && value.size > 0) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "לא צורפו קבצים" }, { status: 400 });
    }

    // Validate all files
    for (const file of files) {
      const ext = file.name.toLowerCase().split(".").pop();
      if (!ALLOWED_EXTS.includes(ext || "")) {
        return NextResponse.json(
          { error: `סוג קובץ לא נתמך: ${file.name}. העלה PDF או Excel.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `הקובץ ${file.name} גדול מדי (מקסימום 10MB)` },
          { status: 400 }
        );
      }
    }

    // Validate PDF magic bytes for PDF files
    for (const file of files) {
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext === "pdf") {
        const header = Buffer.from(await file.slice(0, 4).arrayBuffer());
        if (header.length < 4 || !header.equals(PDF_MAGIC)) {
          return NextResponse.json(
            { error: `הקובץ ${file.name} אינו PDF תקין — בדוק את המקור`, code: "INVALID_PDF" },
            { status: 400 }
          );
        }
      }
    }

    // Parse all files
    const parsedDocs: ParsedDocument[] = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      let result: ParsedDocument;
      try {
        result = await parseDocument(buffer, file.name);
      } catch {
        return NextResponse.json(
          { error: `לא ניתן לקרוא את הקובץ ${file.name} — ייתכן שהוא פגום או מוצפן`, code: "CORRUPT_FILE" },
          { status: 422 }
        );
      }
      parsedDocs.push(result);
    }

    // Single file — return as before (backward compatible)
    if (parsedDocs.length === 1) {
      return NextResponse.json(parsedDocs[0]);
    }

    // Multi-file — merge & deduplicate
    const txArrays = parsedDocs.map(d => ({
      transactions: d.transactions,
      sourceFile: d.filename,
    }));

    const { merged, duplicatesRemoved, sourceFiles } = deduplicateTransactions(txArrays);

    // Combine warnings from all documents
    const allWarnings = parsedDocs.flatMap(d => d.warnings.map(w => `[${d.filename}] ${w}`));
    if (duplicatesRemoved > 0) {
      allWarnings.push(`זוהו ${duplicatesRemoved} תנועות כפולות בין הקבצים — הוסרו אוטומטית`);
    }

    // Combine bank hints
    const bankHints = [...new Set(parsedDocs.map(d => d.bankHint).filter(h => h !== "לא זוהה"))];
    const bankHint = bankHints.length > 0 ? bankHints.join(" + ") : "לא זוהה";

    // Merge instruments (deduplicate across files)
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

    // Calculate totals from merged set
    const totalDebit = merged.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalCredit = merged.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const dates = merged.map(t => t.date).filter(Boolean).sort();

    const result: ParsedDocument & { sourceFiles: string[]; duplicatesRemoved: number } = {
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
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Document parse error:", err);
    return NextResponse.json(
      { error: "שגיאה בעיבוד הקובץ — נסה שוב", code: "UNEXPECTED_ERROR" },
      { status: 500 }
    );
  }
}
