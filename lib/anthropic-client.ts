/**
 * ═══════════════════════════════════════════════════════════
 *  Anthropic client factory — resolves the API key flexibly
 * ═══════════════════════════════════════════════════════════
 *
 * Anthropic's SDK reads `ANTHROPIC_API_KEY` from the env by default. Nir's
 * Render service has the secret named `PLANAPI` instead (per his ops
 * convention 2026-05-25). Rather than rename a secret in production —
 * which would require a redeploy and reading credentials out of Render — we
 * accept either name here.
 *
 * Precedence:
 *   1. `ANTHROPIC_API_KEY` (the SDK's expected name; honored if present)
 *   2. `PLANAPI` (Nir's Render-side name; fallback)
 *
 * Server-side ONLY. Never import this from a client component — even an
 * accidental "use client" file pulling this in would expose the key to the
 * browser bundle.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export function getAnthropicKey(): string | null {
  const k = process.env.ANTHROPIC_API_KEY || process.env.PLANAPI;
  return k && k.trim() ? k.trim() : null;
}

/**
 * Build a configured Anthropic client.
 * Returns null when no key is set in either env var — callers should
 * gracefully degrade (e.g. UI shows "AI not available" instead of crashing).
 */
export function createAnthropicClient(): Anthropic | null {
  const apiKey = getAnthropicKey();
  if (!apiKey) return null;
  // timeout + maxRetries מפורשים: בלעדיהם בקשה תקועה יכולה לתלות route
  // ללא קצה (categorize/insights). 60s לכל ניסיון, 2 retries על שגיאות
  // רשת/429/5xx — ה-SDK עושה backoff בעצמו.
  return new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
}
