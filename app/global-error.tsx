"use client";

/**
 * Global error boundary — קומת המגן האחרונה.
 *
 * Next מרנדר את הקובץ הזה רק כשה-root layout עצמו זורק (מצב נדיר אך
 * קטלני — בלעדיו המשתמש מקבל מסך לבן לגמרי). שאר השגיאות נתפסות
 * ב-app/(client)/error.tsx. כאן אנחנו חייבים לרנדר <html>/<body> משלנו
 * כי ה-layout שמספק אותם הוא זה שנפל.
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { scope: "global-error" } });
  }, [error]);

  return (
    <html dir="rtl" lang="he">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#F7F5F0",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            משהו לא הסתדר
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#6b7b5e", marginBottom: 24 }}>
            האפליקציה נתקלה בבעיה בלתי צפויה. ניסיון חוזר בדרך כלל פותר את זה.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2c7a5a",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            נסה שוב
          </button>
          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 11, color: "#9aa890" }}>
              קוד אבחון: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
