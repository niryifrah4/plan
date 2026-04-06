"use client";

import { useState } from "react";
import { Card } from "./ui/Card";

/**
 * Masleka (pension clearinghouse) XML upload panel.
 * — Validates file type (.xml)
 * — Shows file-name + size
 * — Real upload hook injected via `onUpload` (server action / API route)
 */

interface Props {
  onUpload?: (file: File) => Promise<void>;
}

export function MaslekaUpload({ onUpload }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      if (onUpload) await onUpload(file);
      setMsg("הקובץ נטען. ממתין לעיבוד אוטומטי…");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "שגיאה בהעלאה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold">XML</span>
        <h3 className="text-lg font-extrabold text-verdant-ink">העלאת קובץ מסלקה פנסיונית</h3>
      </div>

      <label
        htmlFor="masleka-input"
        className="flex flex-col items-center justify-center border-2 border-dashed v-divider rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <span className="material-symbols-outlined text-verdant-accent text-[36px] mb-2">
          cloud_upload
        </span>
        <span className="text-sm font-extrabold text-verdant-ink">
          {file ? file.name : "בחר קובץ XML מהמסלקה"}
        </span>
        {file && (
          <span className="text-[11px] text-verdant-muted font-bold mt-1">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
        <input
          id="masleka-input"
          type="file"
          accept=".xml,text/xml,application/xml"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <button
        disabled={!file || busy}
        onClick={handleUpload}
        className="mt-4 w-full px-4 py-2.5 rounded-lg bg-verdant-accent text-white text-sm font-extrabold hover:bg-verdant-emerald disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "מעלה…" : "העלה ופרוס ב'מפת עושר'"}
      </button>

      {msg && (
        <div className="mt-3 text-[12px] font-bold text-right text-verdant-muted">{msg}</div>
      )}

      <div className="mt-4 pt-4 border-t v-divider text-[11px] text-verdant-muted font-bold text-right leading-relaxed">
        המערכת תפענח אוטומטית קרנות פנסיה, גמל והשתלמות (חברה, דמי ניהול, מסלול השקעה) ותמפה אותן לקבוצת &quot;פנסיוני&quot; במפת העושר.
      </div>
    </Card>
  );
}
