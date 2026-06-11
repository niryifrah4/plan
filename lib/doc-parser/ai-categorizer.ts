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

import { createAnthropicClient, getAnthropicKey } from "@/lib/anthropic-client";
import { createPerplexityCompletion, getPerplexityKey } from "@/lib/perplexity-client";
import { CATEGORIES } from "./categorizer";
import { groupOptionsByParent } from "./category-tree";

/** Haiku is plenty for this — categorization isn't a reasoning task. */
const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are categorizing Israeli bank and credit-card transactions for a personal finance planning tool used by a CFP advisor.

Return ONLY a JSON array. Each item must have:
  { "index": <number>, "category": <string>, "confidence": <1-5> }

Rules:
- "index" matches the input order (use the [N] number we provide)
- "category" must be one of the provided LEAF category keys EXACTLY (lower-case, snake_case)
- The category list is grouped under parent headers for context (דיור, מזון, עסקי, …).
  Parent headers are NOT valid category values — always pick a leaf under one of them.
- "confidence": 1 = guessing, 3 = reasonable, 5 = certain
- Hebrew merchant names are common — recognize Israeli brands (שופרסל, רמי לוי, מקדונלדס, אלקטרה, etc.)
- "transfers" is ONLY for movements between own accounts (Bit between people IS transfers; Bit to a merchant is NOT)
- Business descriptors (Google Ads, מע"מ, מקדמת מס, fiverr, רואה חשבון, פייסבוק עסקי, Stripe, Cardcom) → use the matching business_* category
- Refunds / זיכויים / החזרים → "refunds"
- If genuinely uncertain → "other" with confidence: 1
- If you don't recognize the merchant, use your web search capabilities to identify the business in Israel before classifying.
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
  pastCorrections: PastCorrection[] = [],
  aiModel: "haiku" | "perplexity" = "haiku"
): Promise<AISuggestion[]> {
  if (txs.length === 0) return [];
  if (aiModel === "haiku" && !getAnthropicKey()) return [];
  if (aiModel === "perplexity" && !getPerplexityKey()) return [];

  // Group categories under their parent so Haiku sees the same hierarchy a
  // human picker sees in the UI. Parent headers are labels only — Haiku is
  // instructed (in SYSTEM_PROMPT) to only ever return a LEAF key as `category`.
  const grouped = groupOptionsByParent(CATEGORIES.map((c) => ({ key: c.key, label: c.label })));
  const groupedList = grouped
    .map(
      (g) =>
        `▶ ${g.parent.label}\n${g.options.map((o) => `   - ${o.key}: ${o.label}`).join("\n")}`
    )
    .join("\n");
  // "other" isn't in CATEGORIES but is a valid response — let Haiku use it.
  const categoriesBlock = `${groupedList}\n\n▶ שונות\n   - other: אחר (use when truly unable to classify)`;

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
    if (aiModel === "perplexity") {
      const response = await createPerplexityCompletion([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ], "sonar-pro");
      text = response.choices[0]?.message.content || "";
    } else {
      const client = createAnthropicClient();
      if (!client) return [];
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
    }
  } catch (err) {
    console.error("[ai-categorizer] AI call failed:", err instanceof Error ? err.message : err);
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

export async function interactiveCategorizeWithAI(
  merchantKey: string,
  userDescription: string,
  aiModel: "haiku" | "perplexity" = "haiku"
): Promise<{ suggestions: { category: string; categoryLabel: string }[]; explanation: string } | null> {
  if (aiModel === "haiku" && !getAnthropicKey()) return null;
  if (aiModel === "perplexity" && !getPerplexityKey()) return null;

  const validKeys = new Set<string>(CATEGORIES.map((c) => c.key));
  validKeys.add("other");
  const labelByKey = new Map<string, string>(CATEGORIES.map((c) => [c.key, c.label]));
  labelByKey.set("other", "אחר");

  const grouped = groupOptionsByParent(CATEGORIES.map((c) => ({ key: c.key, label: c.label })));
  const groupedList = grouped
    .map(
      (g) =>
        `▶ ${g.parent.label}\n${g.options.map((o) => `   - ${o.key}: ${o.label}`).join("\n")}`
    )
    .join("\n");
  const categoriesBlock = `${groupedList}\n\n▶ שונות\n   - other: אחר (use when truly unable to classify)`;

  const INTERACTIVE_SYSTEM_PROMPT = `You are an expert Israeli financial assistant. 
The user is asking for help categorizing a business for their financial tracking.
Business Name: "${merchantKey}"
User's Description: "${userDescription}"

Categories available:
${categoriesBlock}

Instructions:
1. Return a JSON object with EXACTLY this structure:
{
  "explanation": "A short, friendly explanation in Hebrew (1-2 sentences) of why you chose these categories.",
  "suggestions": ["category_key_1", "category_key_2"]
}
2. "suggestions" must be an array of 1 to 3 valid leaf category keys from the list above. Order them by best fit first.
3. Keep the "explanation" short, clear, and in Hebrew.
4. Output ONLY the JSON object, nothing else.`;

  let text = "";
  try {
    if (aiModel === "perplexity") {
      const response = await createPerplexityCompletion([
        { role: "system", content: "You are a helpful assistant that strictly outputs JSON." },
        { role: "user", content: INTERACTIVE_SYSTEM_PROMPT }
      ], "sonar-pro");
      text = response.choices[0]?.message.content || "";
    } else {
      const client = createAnthropicClient();
      if (!client) return null;
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: INTERACTIVE_SYSTEM_PROMPT }],
      });
      text = response.content[0].type === "text" ? response.content[0].text : "";
    }
  } catch (err) {
    console.error("[ai-categorizer] Interactive AI call failed:", err instanceof Error ? err.message : err);
    return null;
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) return null;

    const validSuggestions = parsed.suggestions
      .filter((k: any) => typeof k === "string" && validKeys.has(k))
      .slice(0, 3)
      .map((k: string) => ({ category: k, categoryLabel: labelByKey.get(k) || k }));

    return {
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
      suggestions: validSuggestions,
    };
  } catch {
    return null;
  }
}
