/**
 * POST /api/pension/parse-pdf
 *
 * Accepts multipart upload of one or more annual report PDFs ("דיוור שנתי
 * מפורט") from Israeli pension/gemel/hishtalmut providers, runs them through
 * the annual-report-parser, and returns a structured bundle the client can
 * preview and merge into pension-store.
 *
 * Replaces the deprecated /api/pension/parse (Maslaka XML) flow.
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
      return errJson("לא הועלו קבצים. צרף קובץ דיוור שנתי בפורמט PDF.", "NO_FILES", 400);
    }

    const files: { name: string; buffer: Buffer }[] = [];
    for (const entry of fileEntries) {
      if (!(entry instanceof File)) continue;
      const name = entry.name || "report.pdf";

      // Size check
      if (entry.size > MAX_FILE_BYTES) {
        return errJson("הקובץ גדול מדי, עד 20MB", "FILE_TOO_LARGE", 413);
      }

      if (!/\.pdf$/i.test(name)) {
        return errJson(`הקובץ ${name} אינו PDF — בדוק את סוג הקובץ`, "INVALID_EXTENSION", 400);
      }

      const buffer = Buffer.from(await entry.arrayBuffer());

      // Magic bytes check — must start with %PDF
      if (buffer.length < 4 || !buffer.subarray(0, 4).equals(PDF_MAGIC)) {
        return errJson("הקובץ אינו PDF תקין — בדוק את המקור", "INVALID_PDF", 400);
      }

      files.push({ name, buffer });
    }

    // Quick peek at first file to detect if it's a Maslaka PDF
    // Maslaka PDFs contain "דוח ריכוז מוצרים פנסיונים" or "מסלקה פנסיונית"
    const pdfParse = (await import("pdf-parse")).default;
    let isMaslaka = false;
    try {
      const peek = await pdfParse(files[0].buffer);
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

    if (isMaslaka) {
      // Parse as Maslaka clearinghouse report(s)
      const allProducts: MaslakaPdfResult["products"] = [];
      const allWarnings: string[] = [];
      let ownerName: string | undefined;

      try {
        for (const f of files) {
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
      bundle = await parseAnnualReportBundle(files);
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
