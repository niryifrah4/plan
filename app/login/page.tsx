"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

type Mode = "login" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isAdminSignup, setIsAdminSignup] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("invite");
    if (t) setInviteToken(t);
    // 2026-05-20 security hardening (security-agent HIGH #2):
    // The `?admin=1` URL flag let anyone self-signup as an advisor with a
    // fresh household. Disabled in the UI now — new advisors must be
    // provisioned by inserting a row directly into the `advisors` table
    // via Supabase dashboard.
    // if (params.get("admin") === "1") setIsAdminSignup(true);
    const errParam = params.get("error");
    if (errParam) setError(decodeURIComponent(errParam));
  }, []);

  const isDemoMode = !isSupabaseConfigured();

  const callbackUrl = (): string => {
    if (typeof window === "undefined") return "/auth/callback";
    const url = new URL("/auth/callback", window.location.origin);
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (redirect) url.searchParams.set("redirect", redirect);
    return url.toString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isDemoMode) {
      window.location.href = "/crm";
      return;
    }

    const sb = getSupabaseBrowser();
    if (!sb) {
      window.location.href = "/crm";
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await sb.auth.getSession();
        window.location.href = callbackUrl();
      } else {
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone,
              ...(inviteToken ? { invite_token: inviteToken } : {}),
              ...(isAdminSignup ? { signup_role: "advisor" } : {}),
            },
          },
        });
        if (error) throw error;
        await sb.auth.getSession();
        window.location.href = callbackUrl();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה בהתחברות");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      window.location.href = "/crm";
      return;
    }
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
        ...(inviteToken || isAdminSignup
          ? {
              data: {
                ...(inviteToken ? { invite_token: inviteToken } : {}),
                ...(isAdminSignup ? { signup_role: "advisor" } : {}),
              },
            }
          : {}),
      },
    });
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
                fontSize: "26px",
                fontWeight: 700,
                color: "var(--morning-ink)",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
                fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
              }}
            >
              {mode === "login" ? "היי, שמחים לראות אותך 👋" : "ברוכים הבאים"}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--morning-muted)",
                marginTop: "8px",
                lineHeight: 1.5,
              }}
            >
              {mode === "login"
                ? "התחברו כדי להמשיך לתכנון הפיננסי שלכם"
                : isAdminSignup
                  ? "צרו חשבון יועץ והתחילו לנהל את הלקוחות שלכם"
                  : "צרו חשבון והתחילו לתכנן את העתיד הכספי"}
            </p>
          </div>

          {/* Demo banner */}
          {isDemoMode && (
            <div
              className="mt-5 flex items-center gap-2 px-3 py-2"
              style={{
                background: "var(--morning-warning-soft)",
                border: "1px solid rgba(217, 119, 6, 0.2)",
                borderRadius: "10px",
              }}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ color: "var(--morning-warning)" }}
              >
                info
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--morning-warning)",
                }}
              >
                מצב דמו — ללא חיבור לשרת
              </span>
            </div>
          )}

          {/* Mode switcher */}
          <div
            className="mt-6 flex gap-1 p-1"
            style={{
              background: "var(--morning-surface-2)",
              borderRadius: "12px",
              border: "1px solid var(--morning-border)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className="flex-1 py-2 transition-all"
              style={{
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "10px",
                background:
                  mode === "login" ? "var(--morning-surface)" : "transparent",
                color:
                  mode === "login"
                    ? "var(--morning-forest)"
                    : "var(--morning-muted)",
                boxShadow:
                  mode === "login"
                    ? "0 1px 2px rgba(16, 24, 40, 0.06)"
                    : "none",
              }}
            >
              התחברות
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className="flex-1 py-2 transition-all"
              style={{
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "10px",
                background:
                  mode === "signup" ? "var(--morning-surface)" : "transparent",
                color:
                  mode === "signup"
                    ? "var(--morning-forest)"
                    : "var(--morning-muted)",
                boxShadow:
                  mode === "signup"
                    ? "0 1px 2px rgba(16, 24, 40, 0.06)"
                    : "none",
              }}
            >
              הרשמה
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mt-3 flex items-start gap-2 px-3 py-2"
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-5">
            {mode === "signup" && (
              <>
                <Field label="שם מלא">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ישראל ישראלי"
                    required
                    style={inputStyle}
                  />
                </Field>
                <div style={{ height: "14px" }} />
                <Field label="טלפון">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="050-1234567"
                    dir="ltr"
                    style={inputStyle}
                  />
                </Field>
                <div style={{ height: "14px" }} />
              </>
            )}

            <Field label="אימייל">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@example.com"
                dir="ltr"
                required={!isDemoMode}
                style={inputStyle}
                autoFocus
              />
            </Field>

            <div style={{ height: "14px" }} />

            <Field label="סיסמה">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                required={!isDemoMode}
                style={inputStyle}
              />
            </Field>

            {mode === "login" && !isDemoMode && (
              <div style={{ marginTop: "10px", textAlign: "right" }}>
                <a
                  href="/login/forgot-password"
                  className="morning-link"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                >
                  שכחתי סיסמה
                </a>
              </div>
            )}

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
              {isDemoMode
                ? "כניסה למצב דמו"
                : mode === "login"
                  ? "כניסה"
                  : "הרשמה"}
            </button>
          </form>

          {/* Social */}
          {!isDemoMode && (
            <>
              <div className="mt-7 flex items-center gap-3">
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--morning-border)" }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    color: "var(--morning-muted)",
                  }}
                >
                  או
                </span>
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--morning-border)" }}
                />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="mt-4 flex w-full items-center justify-center gap-2 transition-all"
                style={{
                  height: "46px",
                  borderRadius: "10px",
                  border: "1px solid var(--morning-border)",
                  background: "var(--morning-surface)",
                  color: "var(--morning-ink)",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--morning-surface-2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "var(--morning-surface)")
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                המשך עם Google
              </button>
            </>
          )}
        </div>

        {/* Legal links */}
        <div
          className="mt-6 text-center text-[12px]"
          style={{ color: "var(--morning-muted)" }}
        >
          <a href="/terms" className="hover:underline">
            תנאי שימוש
          </a>
          <span className="mx-2">·</span>
          <a href="/privacy" className="hover:underline">
            מדיניות פרטיות
          </a>
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
