import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/supabase/require-user";

/** Allowed file types + size limits (anti-abuse) */
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/upload
 * Saves uploaded document to `uploads/` folder.
 * Returns the file path and metadata for the client-side sync pipeline.
 *
 * Pipeline step: Document upload → balance update → net worth → growth chart
 *   Client receives filepath → updates localStorage → triggers sync cascade.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth guard (defense in depth; middleware also enforces) ──
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    // ── Rate limit ──
    const ip = getClientIp(req.headers);
    const rl = rateLimit({ key: `upload:${ip}`, ...RATE_LIMITS.UPLOAD });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMITS.UPLOAD.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const docType = (formData.get("docType") as string) || "other";

    if (!file) {
      return NextResponse.json({ error: "לא הועלה קובץ", code: "NO_FILE" }, { status: 400 });
    }

    // ── Validation: file size + MIME type ──
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "הקובץ גדול מדי — מקסימום 10MB", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    if (file.type && !ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json({ error: "סוג קובץ לא נתמך — ניתן להעלות PDF, תמונה, Excel או CSV", code: "INVALID_TYPE" }, { status: 415 });
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
    const filename = `${timestamp}_${safeName}`;
    const filepath = path.join(uploadsDir, filename);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // Return metadata — client uses this to trigger the sync pipeline
    return NextResponse.json({
      success: true,
      document: {
        id: `doc-${timestamp}`,
        filename: file.name,
        filepath: `uploads/${filename}`,
        mimetype: file.type,
        size_bytes: buffer.length,
        doc_type: docType,
        parsed: false,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "שגיאה בהעלאת הקובץ — נסה שוב", code: "UPLOAD_FAILED" }, { status: 500 });
  }
}
