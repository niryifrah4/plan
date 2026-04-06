"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Simulated auth delay
    setTimeout(() => {
      if (pass !== "1234") {
        setError("סיסמה שגויה. נסה שוב.");
        setLoading(false);
        return;
      }
      router.push("/crm");
    }, 400);
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: "#f9faf2", fontFamily: "'Assistant', system-ui, sans-serif" }}
    >
      {/* ── Background decorations ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-[15%] -left-[10%] w-[45%] h-[45%] rounded-full blur-[140px]"
          style={{ background: "rgba(16,185,129,0.07)" }}
        />
        <div
          className="absolute top-[55%] -right-[8%] w-[35%] h-[35%] rounded-full blur-[120px]"
          style={{ background: "rgba(1,45,29,0.04)" }}
        />
        <div
          className="absolute top-[20%] right-[30%] w-[20%] h-[20%] rounded-full blur-[100px]"
          style={{ background: "rgba(16,185,129,0.03)" }}
        />
      </div>

      {/* ── Center card ── */}
      <div className="relative z-10 w-full max-w-[460px]">
        {/* Card */}
        <div
          className="bg-white rounded-[2rem] p-10 md:p-12"
          style={{
            boxShadow: "0 4px 6px rgba(1,45,29,0.02), 0 12px 40px rgba(1,45,29,0.06), 0 0 0 1px rgba(1,45,29,0.04)",
          }}
        >
          {/* ── Brand header ── */}
          <div className="text-center mb-10">
            {/* Logo */}
            <div className="flex items-baseline justify-center gap-2 mb-2">
              <span
                className="text-3xl font-extrabold tracking-tight"
                style={{ color: "#012d1d" }}
              >
                plan
              </span>
              <span
                className="text-[11px] uppercase tracking-[0.25em] font-bold"
                style={{ color: "#10b981" }}
              >
                Verdant
              </span>
            </div>
            <div
              className="text-[10px] uppercase tracking-[0.3em] font-bold mb-8"
              style={{ color: "#5a7a6a" }}
            >
              Institutional Wealth Management
            </div>

            {/* Divider line */}
            <div className="w-12 h-[2px] mx-auto mb-8" style={{ background: "#10b981" }} />

            {/* Title */}
            <h1
              className="text-[28px] font-extrabold tracking-tight mb-1"
              style={{ color: "#012d1d" }}
            >
              כניסה למערכת
            </h1>
            <p className="text-sm font-medium" style={{ color: "#5a7a6a" }}>
              ברוך השב ל-plan
            </p>
          </div>

          {/* ── Error ── */}
          {error && (
            <div
              className="mb-5 px-4 py-3 rounded-xl text-sm font-bold text-right flex items-center gap-2"
              style={{
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
              }}
            >
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {/* ── Form ── */}
          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Email */}
            <div>
              <label
                className="block text-[12px] font-bold mb-2 px-1 text-right"
                style={{ color: "#012d1d" }}
                htmlFor="email"
              >
                כתובת אימייל
              </label>
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px]"
                  style={{ color: "#5a7a6a" }}
                >
                  mail
                </span>
                <input
                  className="w-full bg-white rounded-xl px-4 py-3.5 text-sm font-medium outline-none transition-all duration-200 text-left"
                  dir="ltr"
                  id="email"
                  placeholder="name@company.com"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    border: "1.5px solid #d8e0d0",
                    color: "#012d1d",
                    paddingLeft: "2.75rem",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#10b981";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#d8e0d0";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2 px-1">
                <label
                  className="block text-[12px] font-bold text-right"
                  style={{ color: "#012d1d" }}
                  htmlFor="password"
                >
                  סיסמה
                </label>
                <a
                  className="text-[11px] font-bold transition-colors hover:underline"
                  style={{ color: "#0a7a4a" }}
                  href="#"
                >
                  שכחת סיסמה?
                </a>
              </div>
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-10 top-1/2 -translate-y-1/2 text-[18px]"
                  style={{ color: "#5a7a6a" }}
                >
                  lock
                </span>
                <input
                  className="w-full bg-white rounded-xl px-4 py-3.5 text-sm font-medium outline-none transition-all duration-200 text-left"
                  dir="ltr"
                  id="password"
                  placeholder="••••••••"
                  type={showPass ? "text" : "password"}
                  required
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  style={{
                    border: "1.5px solid #d8e0d0",
                    color: "#012d1d",
                    paddingLeft: "2.75rem",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#10b981";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#d8e0d0";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#5a7a6a" }}
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPass ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-extrabold text-[15px] py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:scale-[0.995] active:scale-[0.98] mt-2 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, #012d1d 0%, #0a7a4a 100%)",
                boxShadow: "0 8px 24px -8px rgba(1,45,29,0.35)",
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  מתחבר...
                </>
              ) : (
                <>
                  כניסה לחשבון
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                </>
              )}
            </button>
          </form>

          {/* ── Divider ── */}
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: "1px solid #d8e0d0" }} />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-4 text-[10px] font-bold uppercase tracking-[0.2em] bg-white"
                style={{ color: "#5a7a6a" }}
              >
                או התחבר באמצעות
              </span>
            </div>
          </div>

          {/* ── Social login ── */}
          <div className="grid grid-cols-2 gap-3">
            <button
              className="flex items-center justify-center gap-2.5 bg-white py-3 rounded-xl transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              type="button"
              style={{ border: "1.5px solid #d8e0d0" }}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="text-[13px] font-bold" style={{ color: "#012d1d" }}>Google</span>
            </button>
            <button
              className="flex items-center justify-center gap-2.5 bg-white py-3 rounded-xl transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              type="button"
              style={{ border: "1.5px solid #d8e0d0" }}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="#012d1d">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              <span className="text-[13px] font-bold" style={{ color: "#012d1d" }}>Apple</span>
            </button>
          </div>

          {/* ── Registration link ── */}
          <div className="mt-8 text-center">
            <p className="text-[13px]" style={{ color: "#5a7a6a" }}>
              עדיין אין לך חשבון?{" "}
              <a
                className="font-extrabold hover:underline transition-colors"
                style={{ color: "#0a7a4a" }}
                href="#"
              >
                הרשמה עכשיו
              </a>
            </p>
          </div>
        </div>

        {/* ── Security badge ── */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ color: "rgba(90,122,106,0.5)" }}
          >
            verified_user
          </span>
          <span
            className="text-[10px] font-bold tracking-[0.25em] uppercase"
            style={{ color: "rgba(90,122,106,0.5)" }}
          >
            הצפנה ואבטחה ברמה מוסדית
          </span>
        </div>

        {/* ── Footer ── */}
        <div className="mt-6 flex items-center justify-center gap-6">
          <a
            className="text-[10px] font-bold uppercase tracking-[0.15em] transition-opacity opacity-50 hover:opacity-80"
            style={{ color: "#5a7a6a" }}
            href="#"
          >
            מדיניות פרטיות
          </a>
          <span className="text-[10px]" style={{ color: "#d8e0d0" }}>|</span>
          <a
            className="text-[10px] font-bold uppercase tracking-[0.15em] transition-opacity opacity-50 hover:opacity-80"
            style={{ color: "#5a7a6a" }}
            href="#"
          >
            תנאי שימוש
          </a>
          <span className="text-[10px]" style={{ color: "#d8e0d0" }}>|</span>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40"
            style={{ color: "#5a7a6a" }}
          >
            &copy; 2026 Verdant Ledger
          </span>
        </div>
      </div>
    </div>
  );
}
