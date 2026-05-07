"use client";

/**
 * "הזמן לקוח" — simple button + modal.
 *
 * POSTs to /api/crm/invites which:
 *   1. Creates (or uses) a household.
 *   2. Inserts a token into `client_invites`.
 *   3. Sends the invite email via Supabase admin.
 *
 * Requires migration 0011 to be applied to Supabase.
 */

import { useState } from "react";

type Phase = "form" | "creating" | "ready" | "error";

export function InviteClientButton() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [fullName, setFullName] = useState("");
  // Default password 2026-05-01 per Nir: client gets a simple known
  // password and changes it from /settings after first login.
  const [password, setPassword] = useState("1234");
  const [passwordCreated, setPasswordCreated] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailWarn, setEmailWarn] = useState<string | null>(null);

  function reset() {
    setPhase("form");
    setEmail("");
    setFamilyName("");
    setFullName("");
    setPassword("1234");
    setPasswordCreated(false);
    setInviteUrl("");
    setErrorMsg("");
    setCopied(false);
    setEmailSent(false);
    setEmailWarn(null);
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 300);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("creating");
    setErrorMsg("");
    try {
      const res = await fetch("/api/crm/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName,
          familyName,
          password: password.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.hint
          ? `${json.detail || json.error}\n${json.hint}`
          : json.detail || json.error || "שליחת ההזמנה נכשלה";
        setErrorMsg(msg);
        setPhase("error");
        return;
      }
      setInviteUrl(json.inviteUrl || "");
      setEmailSent(!!json.emailSent);
      setEmailWarn(json.emailSent ? null : json.emailError || null);
      setPasswordCreated(!!json.passwordCreated);
      setPhase("ready");
      // Tell CRM page to refetch clients so the new household appears immediately.
      try {
        window.dispatchEvent(new CustomEvent("verdant:clients:refetch"));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "שגיאת רשת");
      setPhase("error");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold transition-all hover:-translate-y-0.5"
        style={{ background: "#1B4332", color: "#F9FAF2" }}
      >
        <span className="material-symbols-outlined text-[16px]">person_add</span>
        לקוח חדש
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
          style={{ background: "rgba(1,45,29,0.45)" }}
          onClick={close}
        >
          <div
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
            style={{
              background: "#FFFFFF",
              borderRadius: "1.5rem",
              padding: "28px",
              boxShadow: "0 16px 40px rgba(27,67,50,0.18)",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold" style={{ color: "#012D1D" }}>
                הזמן לקוח חדש
              </h3>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
                aria-label="סגור"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {phase !== "ready" ? (
              <form onSubmit={submit} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold" style={{ color: "#1B4332" }}>
                    אימייל הלקוח
                  </span>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="h-11 w-full rounded-xl px-3 text-sm"
                    style={{ background: "#F3F4EC", border: "none", outline: "none" }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold" style={{ color: "#1B4332" }}>
                    שם המשפחה
                  </span>
                  <input
                    type="text"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="כהן"
                    className="h-11 w-full rounded-xl px-3 text-sm"
                    style={{ background: "#F3F4EC", border: "none", outline: "none" }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold" style={{ color: "#1B4332" }}>
                    שם מלא (אופציונלי)
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="דני כהן"
                    className="h-11 w-full rounded-xl px-3 text-sm"
                    style={{ background: "#F3F4EC", border: "none", outline: "none" }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
                    סיסמה ראשונית (הלקוח יוכל לשנות אחרי כניסה ראשונה)
                  </span>
                  <input
                    type="text"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="1234"
                    className="h-11 w-full rounded-xl px-3 font-mono text-sm"
                    style={{ background: "#F3F4EC", border: "none", outline: "none" }}
                  />
                </label>
                {phase === "error" && (
                  <div
                    className="whitespace-pre-wrap rounded-xl px-3 py-2 text-[12px] font-bold"
                    style={{ background: "#FEF2F2", color: "#991B1B" }}
                  >
                    {errorMsg}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={phase === "creating"}
                  className="h-11 w-full rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: "#1B4332", color: "#F9FAF2" }}
                >
                  {phase === "creating" ? "שולח הזמנה..." : "שלח הזמנה ללקוח"}
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                {passwordCreated ? (
                  <div
                    className="space-y-2 rounded-xl px-3 py-3"
                    style={{ background: "#ECF7EF", color: "#012D1D" }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ color: "#1B4332" }}
                      >
                        person_add
                      </span>
                      <div className="text-[13px] font-bold">המשתמש נוצר בהצלחה</div>
                    </div>
                    <div
                      dir="ltr"
                      className="space-y-0.5 rounded-lg px-2 py-1.5 font-mono text-[12px]"
                      style={{ background: "rgba(255,255,255,0.6)" }}
                    >
                      <div>
                        email: <strong>{email}</strong>
                      </div>
                      <div>
                        password: <strong>{password}</strong>
                      </div>
                    </div>
                    <div className="text-[11px] font-medium" style={{ color: "#1B4332" }}>
                      העתק והעבר ללקוח (WhatsApp / SMS). הוא נכנס ב-
                      {typeof window !== "undefined" ? window.location.origin : ""}/login
                    </div>
                  </div>
                ) : emailSent ? (
                  <div
                    className="flex items-start gap-2 rounded-xl px-3 py-2"
                    style={{ background: "#ECF7EF", color: "#012D1D" }}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ color: "#1B4332" }}
                    >
                      mark_email_read
                    </span>
                    <div className="text-[13px] font-bold">
                      נשלח אימייל הזמנה ל-{email}
                      <br />
                      <span className="font-medium">הקישור תקף 14 יום.</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-start gap-2 rounded-xl px-3 py-2"
                    style={{ background: "#FEF7E6", color: "#78350F" }}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ color: "#A16207" }}
                    >
                      warning
                    </span>
                    <div className="text-[12px] font-bold">
                      הקישור נוצר. שליחת האימייל נכשלה{emailWarn ? `: ${emailWarn}` : ""}.<br />
                      <span className="font-medium">העתק ושלח ידנית.</span>
                    </div>
                  </div>
                )}
                {inviteUrl && (
                  <div
                    dir="ltr"
                    className="break-all rounded-xl px-3 py-2 font-mono text-[11px]"
                    style={{ background: "#F3F4EC", color: "#012D1D" }}
                  >
                    {inviteUrl}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="h-11 flex-1 rounded-xl text-sm font-bold transition-all"
                    style={{ background: "#1B4332", color: "#F9FAF2" }}
                  >
                    {copied ? "הועתק ✓" : "העתק קישור"}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="h-11 rounded-xl px-4 text-sm font-bold"
                    style={{ background: "#F3F4EC", color: "#1B4332" }}
                  >
                    הזמנה נוספת
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
