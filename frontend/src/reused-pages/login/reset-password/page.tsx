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
              {success ? "הסיסמה עודכנה ✓" : "סיסמה חדשה"}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--morning-muted)",
                marginTop: "8px",
                lineHeight: 1.5,
              }}
            >
              {success
                ? "מעבירים אתכם לדף ההתחברות..."
                : "בחרו סיסמה חדשה (לפחות 6 תווים)"}
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

          {!success && sessionReady && (
            <form onSubmit={handleSubmit} className="mt-5">
              <Field label="סיסמה חדשה">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  required
                  minLength={6}
                  autoFocus
                  style={inputStyle}
                />
              </Field>

              <div style={{ height: "14px" }} />

              <Field label="אימות סיסמה">
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  required
                  minLength={6}
                  style={inputStyle}
                />
              </Field>

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
                עדכון סיסמה
              </button>
            </form>
          )}

          {!sessionReady && !error && (
            <div
              className="mt-6 text-center"
              style={{ color: "var(--morning-muted)", fontSize: "13px" }}
            >
              <span className="material-symbols-outlined animate-spin text-[20px] align-middle">
                progress_activity
              </span>
              <span className="mr-2 align-middle">טוען...</span>
            </div>
          )}

          {success && (
            <div className="mt-6 flex justify-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{
                  background: "var(--morning-leaf-tint)",
                  color: "var(--morning-forest)",
                }}
              >
                <span className="material-symbols-outlined text-[32px]">
                  check_circle
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block"
        style={{
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--morning-muted)",
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
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
};
