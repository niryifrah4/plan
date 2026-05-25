/**
 * ═══════════════════════════════════════════════════════════
 *  AI Categorizer — Claude Haiku 4.5 for low-confidence rows
 * ═══════════════════════════════════════════════════════════
 *
 * Keyword-based categorization (keywords in `categorizer.ts`, 500+ Israeli
 * merchants) handles 80% of transactions on a typical statement. The rest —
 * new merchants, business-specific descriptions, ambiguous OCR text from
 * scanned PDFs — fall to "other" / "transfers" / low-confidence and the
 * user has to triage them by hand in `UnmappedQueueTab`.
 *
 * This module is the AI fallback inspired by the Spent project:
 *   - Sends the unmapped/low-confidence batch to Claude Haiku
 *   - Feeds the user's past corrections (`getOverrides()`) as learning examples
 *   - Returns suggested category + confidence per transaction
 *   - The caller decides what to apply automatically vs surface for review
 *
 * Cost: Haiku 4.5 is $1/M input, $5/M output. A batch of 50 transactions
 * costs roughly $0.007 (single-digit fractions of a cent per transaction).
 * For Nir's scale this is negligible.
 *
 * Server-side only — reads ANTHROPIC_API_KEY from the environment.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./categorizer";

/** Haiku is plenty for this — categorization isn't a reasoning task. */
const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are categorizing Israeli bank and credit-card transactions for a personal finance planning tool used by a CFP advisor.

Return ONLY a JSON array. Each item must have:
  { "index": <number>, "category": <string>, "confidence": <1-5> }

Rules:
- "index" matches the input order (use the [N] number we provide)
- "category" must be one of the provided category keys EXACTLY (lower-case, snake_case)
- "confidence": 1 = guessing, 3 = reasonable, 5 = certain
- Hebrew merchant names are common — recognize Israeli brands (שופרסל, רמי לוי, מקדונלדס, אלקטרה, etc.)
- "transfers" is ONLY for movements between own accounts (Bit between people IS transfers; Bit to a merchant is NOT)
- Business descriptors (Google Ads, מע"מ, מקדמת מס, fiverr, רואה חשבון, פייסבוק עסקי, Stripe, Cardcom) → use the matching business_* category
- Refunds / זיכויים / החזרים → "refunds"
- If genuinely uncertain → "other" with confidence: 1
- NEVER invent new categories — only use ones in the list
- NEVER add commentary outside the JSON array`;

export interface TxToClassify {
  /** Index into the caller's array — echoed back in the response. */
  index: number;
  description: string;
  /** Optional current guess from the keyword matcher — gives Haiku context. */
  currentGuess?: string;
}

export interface PastCorrection {
  description: string;
  category: string;
}

export interface AISuggestion {
  index: number;
  category: string;
  categoryLabel: string;
  /** Normalized to our 0-1 scale (Haiku returns 1-5; we divide by 5). */
  confidence: number;
}

/**
 * Send a batch of unmapped/low-confidence transactions to Claude Haiku and
 * return its suggestions. Returns an empty array on any failure — never
 * throws — so the caller's UI can degrade gracefully when the key isn't set
 * or the API is unavailable.
 */
export async function categorizeWithAI(
  txs: TxToClassify[],
  pastCorrections: PastCorrection[] = []
): Promise<AISuggestion[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  if (txs.length === 0) return [];

  const client = new Anthropic();
  const categoriesList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");
  // "other" isn't in CATEGORIES but is a valid response — let Haiku use it.
  const categoriesBlock = `${categoriesList}\n- other: אחר (use when truly unable to classify)`;

  const correctionsBlock =
    pastCorrections.length > 0
      ? `\n\nPast user corrections (these are authoritative — match the pattern when you see similar descriptions):\n${pastCorrections
          .slice(0, 30)
          .map((c) => `  "${c.description}" → ${c.category}`)
          .join("\n")}`
      : "";

  const txsBlock = txs
    .map((t) => {
      const suffix = t.currentGuess ? ` (keyword guess: ${t.currentGuess})` : "";
      return `[${t.index}] "${t.description}"${suffix}`;
    })
    .join("\n");

  const userPrompt = `Categories:
${categoriesBlock}${correctionsBlock}

Transactions to classify:
${txsBlock}

Return the JSON array now.`;

  let text = "";
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      // System prompt is fixed — cache it so repeat calls within 5 minutes
      // pay the cache-read rate (~0.1× input).
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    text = response.content[0].type === "text" ? response.content[0].text : "";
  } catch (err) {
    console.error("[ai-categorizer] Haiku call failed:", err instanceof Error ? err.message : err);
    return [];
  }

  /* ── Parse the JSON array out of Haiku's response ── */
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  /* ── Validate + normalize to AISuggestion[] ── */
  const validKeys = new Set<string>(CATEGORIES.map((c) => c.key));
  validKeys.add("other");
  const labelByKey = new Map<string, string>(CATEGORIES.map((c) => [c.key, c.label]));
  labelByKey.set("other", "אחר");

  const out: AISuggestion[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const idx = typeof obj.index === "number" ? obj.index : Number(obj.index);
    const cat = typeof obj.category === "string" ? obj.category.toLowerCase().trim() : "";
    const rawConf = typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
    if (!Number.isFinite(idx) || !validKeys.has(cat)) continue;
    const confidence = Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf / 5)) : 0.7;
    out.push({
      index: idx,
      category: cat,
      categoryLabel: labelByKey.get(cat) || cat,
      confidence,
    });
  }

  return out;
}
