/**
 * ═══════════════════════════════════════════════════════════
 *  Vision PDF Parser — Claude Vision fallback for scanned PDFs
 * ═══════════════════════════════════════════════════════════
 *
 * The text-based `parsePDF` (pdf-parse) returns 0 transactions when the
 * source is a scanned image (no embedded text layer). This module is the
 * fallback: it sends the PDF bytes to Claude Vision, asks for a structured
 * transaction list, and returns the same `ParsedDocument` shape downstream
 * code already expects.
 *
 * Cost note: each call is roughly $0.03–$0.10 per PDF on Opus 4.7. To flip
 * to a cheaper model edit the `MODEL` constant — Sonnet 4.6 is ~60% cheaper
 * and works well for Hebrew OCR of bank/credit-card statements.
 *
 * Server-side only. Reads `ANTHROPIC_API_KEY` from the environment. The
 * function never throws — failures are reported as a warning in the
 * returned `ParsedDocument` so the upload UI can surface them.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, getAnthropicKey } from "@/lib/anthropic-client";
import type { ParsedDocument, ParsedTransaction } from "./types";
import { categorize } from "./categorizer";

/** Switch to "claude-sonnet-4-6" to cut cost ~60% with minor accuracy loss. */
const MODEL = "claude-opus-4-7";

interface VisionTransaction {
  date: string;
  description: string;
  amount: number;
}

interface VisionExtraction {
  bankHint: string;
  transactions: VisionTransaction[];
  openingBalance?: number | null;
  closingBalance?: number | null;
  warnings?: string[];
}

/** JSON schema matching VisionExtraction — Anthropic requires `additionalProperties: false`. */
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    bankHint: {
      type: "string",
      description:
        'Bank or credit card issuer in Hebrew (e.g. "בנק הפועלים", "ישראכרט"). Use "לא זוהה" if unclear.',
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Transaction date in ISO format YYYY-MM-DD",
          },
          description: {
            type: "string",
            description: "Original Hebrew merchant name or operation",
          },
          amount: {
            type: "number",
            description:
              "Positive for expenses (חובה), negative for income (זכות). Two decimal places.",
          },
        },
        required: ["date", "description", "amount"],
        additionalProperties: false,
      },
    },
    openingBalance: { type: ["number", "null"] },
    closingBalance: { type: ["number", "null"] },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["bankHint", "transactions"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are extracting transactions from a scanned Israeli bank statement or credit card PDF.

The PDF is likely a scanned image (the prior text-based parser returned zero
results). Read it visually and extract every transaction line.

Per transaction:
- date: ISO 8601 (YYYY-MM-DD). Convert DD/MM/YYYY or DD-MM-YYYY → YYYY-MM-DD.
  If only month/year visible, use the 1st of that month.
- description: Merchant name or operation in original Hebrew. Preserve the
  original text — do NOT translate, normalize, or expand abbreviations.
  Strip generic prefixes like "הוראת קבע", "חיוב אשראי", "תשלום ל-" but keep
  the actual merchant name.
- amount: Positive number (₪) for expenses (חובה / debit / charge), negative
  for income (זכות / credit / refund). For credit-card statements the column
  is usually a single "סכום חיוב" — positive expense, negative refund.

Identify the bank or credit card issuer by visible logo/header/branding:
- Banks: בנק הפועלים, בנק לאומי, בנק דיסקונט, מזרחי-טפחות, הבינלאומי,
  מרכנתיל, יהב, ירושלים, וואן זירו
- Credit cards: ישראכרט, כאל, מקס, ויזה כאל, אמריקן אקספרס, דיינרס
- If you cannot identify, return "לא זוהה" — do not guess.

Also extract opening (יתרת פתיחה) and closing (יתרת סגירה) balances when
visible — they let the system run a reconciliation sum check downstream.

Precision matters: if the table shows N rows, return N transactions. Missing
transactions cause the reconciliation check to fail. If a row is unreadable,
include a warning describing the issue rather than skipping it silently.

If the document is unreadable, encrypted, or empty, return an empty
transactions array with a warning that explains why.`;

export async function parsePDFWithVision(
  buffer: Buffer,
  filename: string
): Promise<ParsedDocument> {
  if (!getAnthropicKey()) {
    return errorDoc(filename, "זיהוי ויזואלי לא זמין — מפתח Anthropic חסר בסביבת השרת");
  }

  const client = createAnthropicClient();
  if (!client) {
    return errorDoc(filename, "זיהוי ויזואלי לא זמין — מפתח Anthropic חסר בסביבת השרת");
  }
  const pdfBase64 = buffer.toString("base64");

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // System prompt is fixed across every Vision call — cache it.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: `Extract every transaction from this file: ${filename}`,
            },
          ],
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA as Record<string, unknown> },
      },
    });

    const parsed = response.parsed_output as unknown as VisionExtraction | null;
    if (!parsed || !Array.isArray(parsed.transactions)) {
      return errorDoc(
        filename,
        "Claude זיהה את הקובץ אבל הפלט לא תאם את הסכמה הצפויה — נסה שוב או העלה קובץ Excel"
      );
    }

    // Run each visually-extracted description through the same categorizer
    // the text-based parser uses, so confidence + category propagate
    // identically into the review/mapping UI.
    const transactions: ParsedTransaction[] = parsed.transactions.map((t) => {
      const cat = categorize(t.description);
      return {
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: cat.key,
        categoryLabel: cat.label,
        confidence: cat.confidence,
        raw: `[vision] ${t.description}`,
      };
    });

    const totalDebit = transactions
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    const totalCredit = transactions
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const dates = transactions
      .map((t) => t.date)
      .filter(Boolean)
      .sort();

    const warnings = [
      `📷 קובץ זה נסרק באמצעות זיהוי ויזואלי (${MODEL}). בדוק את התנועות לפני שמירה.`,
      ...(parsed.warnings ?? []),
    ];

    return {
      filename,
      type: "pdf",
      bankHint: parsed.bankHint || "לא זוהה",
      transactions,
      totalDebit,
      totalCredit,
      dateRange: { from: dates[0] || "", to: dates[dates.length - 1] || "" },
      warnings,
      openingBalance: parsed.openingBalance ?? undefined,
      closingBalance: parsed.closingBalance ?? undefined,
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return errorDoc(filename, "השרת תפוס כרגע — נסה שוב בעוד דקה");
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return errorDoc(filename, "בעיית הרשאות API — פנה למנהל המערכת");
    }
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[vision-pdf-parser] failed:", reason);
    return errorDoc(filename, `כשל בזיהוי ויזואלי: ${reason.slice(0, 100)}`);
  }
}

function errorDoc(filename: string, warning: string): ParsedDocument {
  return {
    filename,
    type: "pdf",
    bankHint: "לא זוהה",
    transactions: [],
    totalDebit: 0,
    totalCredit: 0,
    dateRange: { from: "", to: "" },
    warnings: [warning],
  };
}
