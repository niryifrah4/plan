import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const docType = (formData.get("docType") as string) || "other";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
