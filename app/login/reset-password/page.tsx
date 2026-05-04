"use client";

/**
 * Reset Password — handles the recovery link sent by Supabase.
 *
 * Flow:
 *   1. User clicks the link in their reset email.
 *   2. Supabase opens this page with `?code=…` (or hash params with the
 *      recovery token, depending on Supabase version).
 *   3. The user enters a new password.
 *   4. updateUser() applies it to the active session that Supabase set up.
 *   5. Redirect to /login with a success flag.
 */

import { useState, useEffect } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const isDemoMode = !isSupabaseConfigured();

  // When Supabase opens this page from the email link, it auto-establishes a
  // recovery session via the URL fragment. We just need to confirm a session
  // exists before letting the user submit a new password.
  useEffect(() => {
    if (isDemoMode) {
      setSessionReady(true);
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSessionReady(!!data.session);
      if (!data.session) {
        setError("הקישור לא תקף או שפג תוקפו. בקשו קישור חדש.");
      }
    });
  }, [isDemoMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("הסיסמה חייבת להיות באורך 6 תווים לפחות");
      return;
    }
    if (password !== confirm) {
      setError("הסיסמאות לא תואמות");
      return;
    }

    if (isDemoMode) {
      setError("איפוס סיסמה לא זמין במצב דמו");
      return;
    }

    const sb = getSupabaseBrowser();
    if (!sb) return;

    setLoading(true);
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה בעדכון הסיסמה");
    } finally {
      setLoading(false);
    }
  };

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
            סיסמה חדשה
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
            {success
              ? "הסיסמה עודכנה בהצלחה. מעבירים אתכם להתחברות..."
              : "הזינו סיסמה חדשה כדי לסיים"}
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

        {!success && sessionReady && (
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
                סיסמה חדשה
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                required
                minLength={6}
                style={inputStyle(C)}
              />
            </div>

            <div style={{ height: "16px" }} />

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
                אימות סיסמה
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                required
                minLength={6}
                style={inputStyle(C)}
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
              עדכון סיסמה
            </button>
          </form>
        )}

        {!sessionReady && !error && (
          <div style={{ marginTop: "24px", textAlign: "center", color: C.sage, fontSize: "13px" }}>
            טוען...
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

function inputStyle(C: Record<string, string>): React.CSSProperties {
  return {
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
  };
}
