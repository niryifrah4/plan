/**
 * POST /api/pension/parse-pdf
 *
 * Accepts multipart upload of one or more annual report files ("דיוור שנתי
 * מפורט") from Israeli pension/gemel/hishtalmut providers, runs them through
 * the annual-report-parser, and returns a structured bundle the client can
 * preview and merge into pension-store.
 *
 * Supports PDF, Excel/CSV exports, and Maslaka PDF. XML Maslaka files are still
 * parsed client-side by AnnualReportUpload.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseAnnualReportBundle, type AnnualPolicy } from "@/lib/doc-parser/annual-report-parser";
import {
  parseMaslakaPdf,
  maslakaPdfToFunds,
  type MaslakaPdfResult,
} from "@/lib/doc-parser/maslaka-pdf-parser";
import { requireUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Summary {
  totalBalance: number;
  totalProjectedPension: number;
  totalMonthlyContrib: number;
  policyCount: number;
  fileCount: number;
  providerCount: number;
  avgMgmtFeeBalance: number;
  avgMgmtFeeDeposit: number;
  pensionBalance: number;
  gemelBalance: number;
  hishtalmutBalance: number;
  insuranceBalance: number;
}

function buildSummary(policies: AnnualPolicy[], fileCount: number): Summary {
  const totalBalance = policies.reduce((s, p) => s + (p.balance || 0), 0);
  const totalProjectedPension = policies.reduce((s, p) => s + (p.projectedPensionAmount || 0), 0);
  const totalMonthlyContrib = policies.reduce((s, p) => s + (p.monthlyContrib || 0), 0);
  const providers = new Set(policies.map((p) => p.providerName));

  const balanceFees = policies
    .map((p) => p.mgmtFeeBalance)
    .filter((v): v is number => typeof v === "number");
  const depositFees = policies
    .map((p) => p.mgmtFeeDeposit)
    .filter((v): v is number => typeof v === "number");

  const avgMgmtFeeBalance =
    balanceFees.length > 0 ? balanceFees.reduce((a, b) => a + b, 0) / balanceFees.length : 0;
  const avgMgmtFeeDeposit =
    depositFees.length > 0 ? depositFees.reduce((a, b) => a + b, 0) / depositFees.length : 0;

  const sumByTypes = (types: string[]) =>
    policies.filter((p) => types.includes(p.productType)).reduce((s, p) => s + (p.balance || 0), 0);

  return {
    totalBalance,
    totalProjectedPension,
    totalMonthlyContrib,
    policyCount: policies.length,
    fileCount,
    providerCount: providers.size,
    avgMgmtFeeBalance,
    avgMgmtFeeDeposit,
    pensionBalance: sumByTypes(["pension_comprehensive", "pension_general"]),
    gemelBalance: sumByTypes(["gemel", "gemel_investment"]),
    hishtalmutBalance: sumByTypes(["hishtalmut"]),
    insuranceBalance: sumByTypes(["insurance_manager"]),
  };
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // xlsx container
const XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // legacy .xls

type UploadKind = "pdf" | "spreadsheet" | "text";

function classifyUpload(name: string, buffer: Buffer): UploadKind | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return buffer.subarray(0, 4).equals(PDF_MAGIC) ? "pdf" : null;
  if (ext === "xlsx") return buffer.subarray(0, 4).equals(ZIP_MAGIC) ? "spreadsheet" : null;
  if (ext === "xls") return buffer.subarray(0, 4).equals(XLS_MAGIC) ? "spreadsheet" : null;
  if (ext === "csv" || ext === "txt") return "text";
  return null;
}

function errJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth guard ──
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const formData = await req.formData();
    const fileEntries = formData.getAll("files");

    if (fileEntries.length === 0) {
      return errJson("לא הועלו קבצים. צרף קובץ דיוור שנתי בפורמט PDF, Excel או CSV.", "NO_FILES", 400);
    }

    const files: { name: string; buffer: Buffer; kind: UploadKind }[] = [];
    for (const entry of fileEntries) {
      if (!(entry instanceof File)) continue;
      const name = entry.name || "report.pdf";

      // Size check
      if (entry.size > MAX_FILE_BYTES) {
        return errJson("הקובץ גדול מדי, עד 20MB", "FILE_TOO_LARGE", 413);
      }

      const buffer = Buffer.from(await entry.arrayBuffer());
      const kind = classifyUpload(name, buffer);

      if (!kind) {
        return errJson(
          `סוג הקובץ ${name} לא נתמך או שהקובץ לא תקין — העלה PDF, Excel או CSV`,
          "INVALID_FILE_TYPE",
          400
        );
      }

      files.push({ name, buffer, kind });
    }

    const pdfFiles = files.filter((f) => f.kind === "pdf");
    const annualFiles = files.map(({ name, buffer }) => ({ name, buffer }));

    // Quick peek at first PDF to detect if it's a Maslaka PDF
    // Maslaka PDFs contain "דוח ריכוז מוצרים פנסיונים" or "מסלקה פנסיונית"
    const pdfParse = (await import("pdf-parse")).default;
    let isMaslaka = false;
    if (pdfFiles.length > 0) {
      try {
        const peek = await pdfParse(pdfFiles[0].buffer);
        const peekText = peek.text || "";
        isMaslaka =
          peekText.includes("דוח ריכוז מוצרים פנסיונים") || peekText.includes("מסלקה פנסיונית");
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[parse-pdf] pdf-parse peek failed:", reason);
        // Surface a sharper message so we can distinguish encryption / corruption / encoding issues
        if (/password|encrypt/i.test(reason)) {
          return errJson("הקובץ מוגן בסיסמה — הסר את ההגנה ונסה שוב", "ENCRYPTED_PDF", 422);
        }
        return errJson(`לא ניתן לקרוא את הקובץ (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
      }
    }

    if (isMaslaka) {
      if (files.some((f) => f.kind !== "pdf")) {
        return errJson(
          "דוח מסלקה PDF לא ניתן לערבב עם קבצי Excel/CSV באותה העלאה",
          "MIXED_MASLAKA_FILES",
          400
        );
      }
      // Parse as Maslaka clearinghouse report(s)
      const allProducts: MaslakaPdfResult["products"] = [];
      const allWarnings: string[] = [];
      let ownerName: string | undefined;

      try {
        for (const f of pdfFiles) {
          const result = await parseMaslakaPdf(f.buffer, f.name);
          allProducts.push(...result.products);
          allWarnings.push(...result.warnings);
          if (result.ownerName && !ownerName) ownerName = result.ownerName;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[parse-pdf] maslaka parser failed:", reason);
        return errJson(`לא ניתן לקרוא את הקובץ (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
      }

      // Convert to PensionFund format for the client to use
      const funds = maslakaPdfToFunds(allProducts);

      return NextResponse.json({
        type: "maslaka",
        ownerName,
        products: allProducts,
        funds,
        warnings: allWarnings,
      });
    }

    // Standard annual report flow
    let bundle;
    try {
      bundle = await parseAnnualReportBundle(annualFiles);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[parse-pdf] annual parser failed:", reason);
      return errJson(`לא ניתן לקרוא את הקובץ (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
    }
    const summary = buildSummary(bundle.policies, bundle.files.length);

    return NextResponse.json({ type: "annual", bundle, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא צפויה בעיבוד הקבצים";
    return NextResponse.json({ error: message, code: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}
