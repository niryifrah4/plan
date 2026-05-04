"use client";

import { useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const isDemoMode = !isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isDemoMode) {
      setError("איפוס סיסמה לא זמין במצב דמו");
      return;
    }

    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("המערכת לא זמינה כרגע, נסו שוב מאוחר יותר");
      return;
    }

    setLoading(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/login/reset-password`
          : undefined;

      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת המייל");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Botanical Wealth palette (matches /login) ─── */
  const C = {
    primary: "#1B4332",
    deep: "#012D1D",
    cream: "#F9FAF2",
    sage: "#5C6058",
    inputBg: "#F3F4EC",
    border: "#E5E9DC",
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      dir="rtl"
      style={{
        background: C.cream,
        fontFamily: "'Manrope', 'Assistant', sans-serif",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
      />

      <div
        className="w-full"
        style={{
          maxWidth: "420px",
          background: "#FFFFFF",
          borderRadius: "2.25rem",
          boxShadow: "0 16px 40px rgba(27,67,50,0.08)",
          padding: "48px 36px",
        }}
      >
        <div className="text-center">
          <h1
            style={{
              fontSize: "32px",
              fontWeight: 800,
              color: C.deep,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            plan
          </h1>
          <p style={{ fontSize: "12px", fontWeight: 500, color: C.sage, marginTop: "6px" }}>
            מערכת לתכנון פיננסי
          </p>
        </div>

        <div style={{ marginTop: "24px" }} className="text-center">
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: C.deep, lineHeight: 1.2 }}>
            איפוס סיסמה
          </h2>
          <p
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: C.sage,
              marginTop: "6px",
              lineHeight: 1.5,
            }}
          >
            {sent
              ? "שלחנו לכם מייל עם קישור לאיפוס הסיסמה. בדקו את תיבת הדואר."
              : "הזינו את כתובת המייל שלכם ונשלח לכם קישור לאיפוס הסיסמה"}
          </p>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 px-3 py-2"
            style={{
              marginTop: "20px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "12px",
            }}
          >
            <span
              className="material-symbols-outlined mt-0.5 text-[14px]"
              style={{ color: "#B91C1C" }}
            >
              error
            </span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#991B1B" }}>{error}</span>
          </div>
        )}

        {!sent ? (
          <form onSubmit={handleSubmit} style={{ marginTop: "24px" }}>
            <div>
              <label
                className="block"
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: C.primary,
                  marginBottom: "6px",
                }}
              >
                אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@example.com"
                dir="ltr"
                required
                style={{
                  width: "100%",
                  height: "46px",
                  padding: "0 16px",
                  background: C.inputBg,
                  borderRadius: "16px",
                  border: "none",
                  outline: "none",
                  fontSize: "14px",
                  fontWeight: 400,
                  color: C.deep,
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ height: "24px" }} />

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 transition-all hover:shadow-lg disabled:opacity-50"
              style={{
                height: "52px",
                borderRadius: "9999px",
                background: C.primary,
                color: C.cream,
                fontSize: "15px",
                fontWeight: 700,
              }}
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">
                  progress_activity
                </span>
              ) : null}
              שלחו לי קישור לאיפוס
            </button>
          </form>
        ) : (
          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "48px", color: C.primary }}
            >
              mark_email_read
            </span>
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <a
            href="/login"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: C.primary,
              textDecoration: "none",
            }}
          >
            ← חזרה לדף ההתחברות
          </a>
        </div>
      </div>
    </div>
  );
}
