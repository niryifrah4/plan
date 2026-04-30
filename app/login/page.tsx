"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

type Mode = "login" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  // 2026-04-30: invite-only — hide signup tab unless ?signup=1 (admin escape).
  const [showSignupTab, setShowSignupTab] = useState(false);
  useEffect(() => {
    try {
      const flag = new URLSearchParams(window.location.search).get("signup");
      setShowSignupTab(flag === "1");
    } catch {}
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read URL params only after mount — guards against SSR/CSR hydration drift.
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("invite");
    if (t) setInviteToken(t);
  }, []);

  const isDemoMode = !isSupabaseConfigured();

  /** Smart post-login redirect — `/auth/callback` decides advisor vs client. */
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

    if (isDemoMode) { window.location.href = "/crm"; return; }

    const sb = getSupabaseBrowser();
    if (!sb) { window.location.href = "/crm"; return; }

    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Confirm session cookies are actually written before navigating —
        // @supabase/ssr writes cookies async; jumping too fast races the
        // middleware and bounces the user back to /login.
        await sb.auth.getSession();
        window.location.href = callbackUrl();
      } else {
        const { error } = await sb.auth.signUp({
          email, password,
          options: {
            data: {
              full_name: fullName,
              phone,
              ...(inviteToken ? { invite_token: inviteToken } : {}),
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
    if (!sb) { window.location.href = "/crm"; return; }
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
        // Persist invite token on the auth user so the DB trigger links
        // the new client to the right household.
        ...(inviteToken ? { data: { invite_token: inviteToken } } : {}),
      },
    });
  };

  /* ─── Botanical Wealth palette ─── */
  const C = {
    primary: "#1B4332",    // Primary Green
    deep: "#012D1D",       // Deep Forest
    cream: "#F9FAF2",      // Soft Cream
    sage: "#5C6058",       // Sage Gray
    inputBg: "#F3F4EC",    // light input bg
    border: "#E5E9DC",     // subtle border
    accent: "#1B4332",     // emerald accent
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      dir="rtl"
      style={{
        background: C.cream,
        fontFamily: "'Manrope', 'Assistant', sans-serif",
      }}
    >
      {/* Google Font: Manrope */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
      />

      <div
        className="w-full"
        style={{
          maxWidth: "420px",
          background: "#FFFFFF",
          borderRadius: "2.25rem", // 36px
          boxShadow: "0 16px 40px rgba(27,67,50,0.08)",
          padding: "48px 36px",
        }}
      >
        {/* Logo / Brand */}
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
          <p
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: C.sage,
              marginTop: "6px",
            }}
          >
            מערכת לתכנון פיננסי
          </p>
        </div>

        {/* Title block */}
        <div style={{ marginTop: "24px" }} className="text-center">
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: C.deep,
              lineHeight: 1.2,
            }}
          >
            {mode === "login" ? "ברוך שובך" : "ברוכים הבאים"}
          </h2>
          <p
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: C.sage,
              marginTop: "6px",
            }}
          >
            {mode === "login"
              ? "התחבר כדי להמשיך לתכנון הפיננסי שלך"
              : "צור חשבון והתחל לנהל את הלקוחות שלך"}
          </p>
        </div>

        {/* Demo banner */}
        {isDemoMode && (
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              marginTop: "20px",
              background: "#FEF7E6",
              border: "1px solid #F5E6B8",
              borderRadius: "12px",
            }}
          >
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#A16207" }}>info</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#78350F" }}>
              מצב דמו — ללא חיבור לשרת
            </span>
          </div>
        )}

        {/* Mode switcher.
            2026-04-30: signup tab hidden by default (invite-only model per
            Nir). Open it with ?signup=1 in the URL for admin testing only. */}
        <div
          className="flex gap-1 p-1"
          style={{
            marginTop: "28px",
            background: C.inputBg,
            borderRadius: "14px",
            display: showSignupTab ? "flex" : "none",
          }}
        >
          <button
            type="button"
            onClick={() => { setMode("login"); setError(null); }}
            className="flex-1 py-2 transition-all"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "11px",
              background: mode === "login" ? "#FFFFFF" : "transparent",
              color: mode === "login" ? C.deep : C.sage,
              boxShadow: mode === "login" ? "0 1px 3px rgba(27,67,50,0.08)" : "none",
            }}
          >
            התחברות
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(null); }}
            className="flex-1 py-2 transition-all"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "11px",
              background: mode === "signup" ? "#FFFFFF" : "transparent",
              color: mode === "signup" ? C.deep : C.sage,
              boxShadow: mode === "signup" ? "0 1px 3px rgba(27,67,50,0.08)" : "none",
            }}
          >
            הרשמה
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-2 px-3 py-2"
            style={{
              marginTop: "12px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "12px",
            }}
          >
            <span className="material-symbols-outlined text-[14px] mt-0.5" style={{ color: "#B91C1C" }}>error</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#991B1B" }}>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ marginTop: "18px" }}>
          {mode === "signup" && (
            <>
              <Field label="שם מלא" C={C}>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ישראל ישראלי"
                  required
                  style={inputStyle(C)}
                />
              </Field>
              <div style={{ height: "16px" }} />
              <Field label="טלפון" C={C}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="050-1234567"
                  dir="ltr"
                  style={inputStyle(C)}
                />
              </Field>
              <div style={{ height: "16px" }} />
            </>
          )}

          <Field label="אימייל" C={C}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@example.com"
              dir="ltr"
              required={!isDemoMode}
              style={inputStyle(C)}
            />
          </Field>

          <div style={{ height: "16px" }} />

          <Field label="סיסמה" C={C}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
              required={!isDemoMode}
              style={inputStyle(C)}
            />
          </Field>

          {/* Gap to CTA */}
          <div style={{ height: "24px" }} />

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 transition-all hover:shadow-lg disabled:opacity-50"
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
              <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
            ) : null}
            {isDemoMode ? "כניסה למצב דמו" : mode === "login" ? "התחבר" : "הירשם"}
          </button>
        </form>

        {/* Divider + social — 48px from CTA */}
        {!isDemoMode && (
          <>
            <div className="flex items-center gap-3" style={{ marginTop: "32px" }}>
              <div className="flex-1 h-px" style={{ background: C.border }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: C.sage }}>או</span>
              <div className="flex-1 h-px" style={{ background: C.border }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 transition-all hover:shadow-md"
              style={{
                marginTop: "16px",
                height: "48px",
                borderRadius: "9999px",
                border: `1.5px solid ${C.border}`,
                background: "#FFFFFF",
                color: C.deep,
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              המשך עם Google
            </button>
          </>
        )}

        {/* 2026-04-30 — legal links, required before go-live. */}
        <div className="text-center mt-6 text-[11px] text-verdant-muted">
          <a href="/terms" className="hover:text-verdant-emerald hover:underline">תנאי שימוש</a>
          <span className="mx-2">·</span>
          <a href="/privacy" className="hover:text-verdant-emerald hover:underline">מדיניות פרטיות</a>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function Field({
  label,
  C,
  children,
}: {
  label: string;
  C: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
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
        {label}
      </label>
      {children}
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
