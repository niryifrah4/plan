/**
 * Resend — transactional email sender.
 *
 * Built 2026-04-30 ahead of go-live: the system needs to send invite emails
 * to new clients (advisor types address → server emails token → client clicks
 * → ends up at /auth/callback?invite=...).
 *
 * Activated only when RESEND_API_KEY is set. In dev without the key, sendEmail
 * logs the message to console so the flow still works end-to-end without
 * burning real email credits.
 */

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || "Plan <noreply@plan.local>";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  /** Plain-text body. Required (HTML is optional). */
  text: string;
  html?: string;
  /** Optional reply-to override. Defaults to FROM. */
  replyTo?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const c = getClient();
  if (!c) {
    // Dev fallback — no real send, just log.
    console.info(`[resend:dev] would send to=${Array.isArray(msg.to) ? msg.to.join(",") : msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { ok: true, id: "dev-noop" };
  }
  try {
    const res = await c.emails.send({
      from: FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
    });
    if ((res as any).error) {
      return { ok: false, error: (res as any).error?.message || "send failed" };
    }
    return { ok: true, id: (res as any).data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "send threw" };
  }
}
