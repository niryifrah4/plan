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

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      dir="rtl"
      style={{
        background:
          "linear-gradient(135deg, #F4F5F0 0%, #F0F8E3 60%, #E8F4D1 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "var(--morning-surface)",
              border: "1px solid var(--morning-leaf-soft)",
              boxShadow: "var(--morning-shadow-card)",
            }}
          >
            <span
              className="material-symbols-outlined text-[28px]"
              style={{ color: "var(--morning-forest)" }}
            >
              eco
            </span>
          </div>
          <div
            className="text-[32px] font-bold leading-none tracking-tight lowercase"
            style={{
              color: "var(--morning-ink)",
              fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
            }}
          >
            plan
          </div>
          <div
            className="mt-1 text-[13px] font-medium"
            style={{ color: "var(--morning-muted)" }}
          >
            מערכת לתכנון פיננסי
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "var(--morning-surface)",
            borderRadius: "1.25rem",
            border: "1px solid var(--morning-border)",
            boxShadow: "var(--morning-shadow-soft)",
            padding: "32px 28px",
          }}
        >
          {/* Title */}
          <div className="text-center">
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--morning-ink)",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
                fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
              }}
            >
              {sent ? "המייל בדרך אליכם 📬" : "איפוס סיסמה"}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--morning-muted)",
                marginTop: "8px",
                lineHeight: 1.5,
              }}
            >
              {sent
                ? "שלחנו לכם מייל עם קישור לאיפוס הסיסמה. בדקו את תיבת הדואר (כולל ספאם)."
                : "הזינו את כתובת המייל שלכם ונשלח לכם קישור לאיפוס"}
            </p>
          </div>

          {error && (
            <div
              className="mt-5 flex items-start gap-2 px-3 py-2"
              style={{
                background: "var(--morning-danger-soft)",
                border: "1px solid rgba(220, 38, 38, 0.25)",
                borderRadius: "10px",
              }}
            >
              <span
                className="material-symbols-outlined mt-0.5 text-[14px]"
                style={{ color: "var(--morning-danger)" }}
              >
                error
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--morning-danger)",
                }}
              >
                {error}
              </span>
            </div>
          )}

          {!sent ? (
            <form onSubmit={handleSubmit} className="mt-5">
              <label
                className="block"
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--morning-muted)",
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
                autoFocus
                style={{
                  width: "100%",
                  height: "44px",
                  padding: "0 14px",
                  background: "var(--morning-surface)",
                  borderRadius: "10px",
                  border: "1px solid var(--morning-border)",
                  outline: "none",
                  fontSize: "14px",
                  fontWeight: 400,
                  color: "var(--morning-ink)",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              />

              <div style={{ height: "24px" }} />

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{
                  height: "48px",
                  borderRadius: "10px",
                  background: "var(--morning-forest)",
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 600,
                  boxShadow: "0 4px 12px rgba(44, 122, 90, 0.16)",
                }}
                onMouseEnter={(e) => {
                  if (!loading)
                    e.currentTarget.style.background = "var(--morning-forest-deep)";
                }}
                onMouseLeave={(e) => {
                  if (!loading)
                    e.currentTarget.style.background = "var(--morning-forest)";
                }}
              >
                {loading ? (
                  <span className="material-symbols-outlined animate-spin text-[20px]">
                    progress_activity
                  </span>
                ) : null}
                שלחו קישור לאיפוס
              </button>
            </form>
          ) : (
            <div className="mt-6 flex justify-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{
                  background: "var(--morning-leaf-tint)",
                  color: "var(--morning-forest)",
                }}
              >
                <span className="material-symbols-outlined text-[32px]">
                  mark_email_read
                </span>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <a
              href="/login"
              className="morning-link"
              style={{ fontSize: "13px", fontWeight: 500 }}
            >
              ← חזרה לדף ההתחברות
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
