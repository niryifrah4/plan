"use client";

/**
 * Error boundary for the (client) route group.
 *
 * Next.js App Router renders this file when any child segment (dashboard,
 * budget, goals, realestate, etc.) throws during render or in a server
 * component. Without this, the user sees Next's generic "Application error"
 * — opaque and untranslated. With this, they see a friendly Hebrew screen
 * with a retry button and a "back to dashboard" escape hatch.
 *
 * The `error` is automatically captured by Sentry (sentry.client.config.ts
 * wires a global handler), so we don't need to call captureException here.
 */

import { useEffect } from "react";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for dev visibility — Sentry already captures in prod.
    if (process.env.NODE_ENV === "development") {
      console.error("[client error boundary]", error);
    }
  }, [error]);

  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "var(--morning-coral-tint, #FED7AA)" }}
      >
        <span
          className="material-symbols-outlined text-[32px]"
          style={{ color: "var(--morning-coral, #B45309)" }}
        >
          error_outline
        </span>
      </div>
      <h1
        className="mb-3 text-xl font-extrabold md:text-2xl"
        style={{ color: "var(--morning-ink, #1a1a1a)" }}
      >
        משהו לא הסתדר
      </h1>
      <p
        className="mb-6 text-[14px] leading-relaxed md:text-[15px]"
        style={{ color: "var(--morning-muted, #6b7b5e)" }}
      >
        הדף הזה נתקל בבעיה בטעינה. בדרך כלל ניסיון חוזר פותר את זה.
        <br />
        אם זה ממשיך לקרות, פנו ליועץ שלכם.
      </p>
      <div className="flex w-full flex-col gap-2 md:flex-row md:justify-center">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl px-5 py-3 text-[14px] font-extrabold transition-opacity hover:opacity-90 md:text-[15px]"
          style={{
            background: "var(--morning-forest, #2c7a5a)",
            color: "#FFFFFF",
            minHeight: 48,
          }}
        >
          נסה שוב
        </button>
        <a
          href="/dashboard"
          className="rounded-xl px-5 py-3 text-center text-[14px] font-extrabold transition-colors md:text-[15px]"
          style={{
            border: "1px solid var(--morning-border, #d8e0d0)",
            color: "var(--morning-ink, #1a1a1a)",
            background: "#FFFFFF",
            minHeight: 48,
          }}
        >
          חזרה לדשבורד
        </a>
      </div>
      {error.digest && (
        <p
          className="mt-6 text-[11px]"
          style={{ color: "var(--morning-muted, #6b7b5e)" }}
        >
          קוד אבחון: {error.digest}
        </p>
      )}
    </div>
  );
}
