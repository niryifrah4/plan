"use client";

/**
 * AmortizationUpload — "טען לוח סילוקין מה-PDF של הבנק"
 *
 * Phase 4 (2026-05-21). Replaces the previously-broken link that pointed
 * to /balance#amortization (a static promise card with no upload handler).
 *
 * Flow:
 *   1. User picks a PDF file from disk.
 *   2. POST to /api/debt/parse-amortization → list of probable tracks.
 *   3. Preview modal shows each track in an editable form (rate %, balance,
 *      monthly, indexation, end date). Low-confidence rows are dimmed.
 *   4. "Confirm" calls `onTracksParsed` so the parent can merge into the
 *      current mortgage's tracks array. Existing tracks are NOT replaced.
 *
 * The parser is heuristic — the preview step is the safety net. The user
 * always sees what's about to be saved before any data hits the store.
 */

import { useRef, useState } from "react";
import { fmtILS } from "@/lib/format";
import type { MortgageTrack, IndexationType, RepaymentMethod } from "@/lib/debt-store";
import { uploadFile } from "@/lib/storage/file-storage";
import { isSupabaseConfigured } from "@/lib/supabase/browser";

interface ParsedTrack extends MortgageTrack {
  confidence: number;
  sourceLine: string;
}

interface ParseResponse {
  filename: string;
  bankHint: string;
  tracks: Omit<ParsedTrack, "id">[];
  totals?: { originalAmount?: number; remainingBalance?: number; monthlyPayment?: number };
  warnings: string[];
}

interface Props {
  /** Called when the user confirms the preview. Parent decides where to merge. */
  onTracksParsed: (tracks: MortgageTrack[]) => void;
}

const uid = () => "d" + Math.random().toString(36).slice(2, 9);

export function AmortizationUpload({ onTracksParsed }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseResponse | null>(null);
  // Editable copy of the preview's tracks — what gets saved on confirm.
  const [draft, setDraft] = useState<ParsedTrack[]>([]);

  const onPick = () => {
    setParseError(null);
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setParseError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/debt/parse-amortization", { method: "POST", body: form, credentials: "include" });
      const body = (await res.json()) as ParseResponse & { error?: string; code?: string };
      if (!res.ok) {
        setParseError(body.error || `שגיאה ${res.status}`);
        return;
      }
      let nextPreview = body;
      if (isSupabaseConfigured()) {
        const stored = await uploadFile(file, "mortgage_schedule");
        if (!stored) {
          nextPreview = {
            ...body,
            warnings: [
              ...body.warnings,
              "המסלולים פוענחו, אבל קובץ ה-PDF המקורי לא נשמר לתיק.",
            ],
          };
        }
      }
      setPreview(nextPreview);
      setDraft(
        nextPreview.tracks.map((t) => ({
          ...t,
          id: uid(),
        })) as ParsedTrack[]
      );
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "שגיאה לא צפויה בקליטת הקובץ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateDraft = (id: string, field: keyof MortgageTrack, value: string | number) => {
    setDraft((cur) =>
      cur.map((t) =>
        t.id === id
          ? {
              ...t,
              [field]:
                field === "name" ||
                field === "indexation" ||
                field === "repaymentMethod" ||
                field === "startDate" ||
                field === "endDate"
                  ? value
                  : Number(value) || 0,
            }
          : t
      )
    );
  };

  const removeDraft = (id: string) => {
    setDraft((cur) => cur.filter((t) => t.id !== id));
  };

  const onConfirm = () => {
    if (draft.length === 0) {
      setPreview(null);
      return;
    }
    // Hand the parent a clean MortgageTrack[] (strip the parser extras).
    const clean: MortgageTrack[] = draft.map((t) => ({
      id: t.id,
      name: t.name,
      interestRate: t.interestRate,
      margin: t.margin,
      indexation: t.indexation,
      repaymentMethod: t.repaymentMethod,
      originalAmount: t.originalAmount,
      remainingBalance: t.remainingBalance,
      monthlyPayment: t.monthlyPayment,
      startDate: t.startDate,
      endDate: t.endDate,
      totalPayments: t.totalPayments,
    }));
    onTracksParsed(clean);
    setPreview(null);
    setDraft([]);
  };

  const onCancel = () => {
    setPreview(null);
    setDraft([]);
    setParseError(null);
  };

  return (
    <>
      {/* Hidden input + visible CTA */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        onChange={onFile}
        className="hidden"
      />
      <button
        onClick={onPick}
        disabled={uploading}
        className="btn btn-secondary btn-sm"
        title="קלוט מסלולים מ-PDF של לוח סילוקין שהבנק שלח. תקבלו תצוגה מקדימה לאישור לפני שמירה."
      >
        <span className="material-symbols-outlined text-[14px]">
          {uploading ? "hourglass_top" : "upload_file"}
        </span>
        {uploading ? "מעבד..." : "טען לוח סילוקין"}
      </button>

      {parseError && (
        <span
          className="ml-2 text-[11px] font-semibold"
          style={{ color: "#DC2626" }}
          role="alert"
        >
          {parseError}
        </span>
      )}

      {/* Preview / confirm modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={onCancel}
          dir="rtl"
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[#FFFFFF] shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b bg-[#FFFFFF] px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
                    קליטת לוח סילוקין
                  </div>
                  <h2 className="text-lg font-extrabold text-verdant-ink">
                    {preview.filename}
                    {preview.bankHint && (
                      <span className="mr-2 text-[12px] font-semibold text-verdant-muted">
                        · {preview.bankHint}
                      </span>
                    )}
                  </h2>
                  <div className="mt-0.5 text-[11px] text-verdant-muted">
                    זוהו {draft.length} מסלולים. עברו עליהם, תקנו את מה שצריך, ואז שמרו.
                    שדות מסומנים בעמום = רמת ודאות נמוכה — שווה לבדוק.
                  </div>
                </div>
                <button onClick={onCancel} className="rounded-lg p-2 hover:bg-verdant-bg">
                  <span className="material-symbols-outlined text-[20px] text-verdant-muted">
                    close
                  </span>
                </button>
              </div>
            </div>

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div
                className="mx-6 mt-4 rounded-lg p-3"
                style={{ background: "rgba(217,119,6,0.08)", border: "1px solid #D97706" }}
              >
                <div className="mb-1 text-[11px] font-bold" style={{ color: "#D97706" }}>
                  שימו לב
                </div>
                <ul className="space-y-1 text-[11px] text-verdant-ink">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>· {w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Totals from the PDF if available */}
            {preview.totals && (preview.totals.remainingBalance || preview.totals.monthlyPayment) && (
              <div className="mx-6 mt-4 flex flex-wrap gap-2 text-[11px]">
                {preview.totals.remainingBalance ? (
                  <span
                    className="rounded-md px-2 py-1 font-semibold"
                    style={{ background: "#FAFAF7", color: "#1A1A1A" }}
                  >
                    יתרה כוללת ב-PDF: {fmtILS(preview.totals.remainingBalance)}
                  </span>
                ) : null}
                {preview.totals.monthlyPayment ? (
                  <span
                    className="rounded-md px-2 py-1 font-semibold"
                    style={{ background: "#FAFAF7", color: "#1A1A1A" }}
                  >
                    החזר כולל ב-PDF: {fmtILS(preview.totals.monthlyPayment)}
                  </span>
                ) : null}
              </div>
            )}

            {/* Editable preview table */}
            <div className="px-6 py-4">
              {draft.length === 0 ? (
                <div
                  className="rounded-xl px-4 py-6 text-center text-[12px]"
                  style={{ background: "#FAFAF7", border: "1px dashed #E5E7EB", color: "#6B7280" }}
                >
                  לא זוהו מסלולים. ייתכן שהקובץ סרוק או בפורמט לא מוכר. אפשר להזין ידנית
                  בעמוד החובות.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[12px]" style={{ minWidth: 720 }}>
                    <thead>
                      <tr
                        className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-verdant-muted"
                        style={{ borderBottom: "1px solid #E5E7EB" }}
                      >
                        <th className="p-2">שם</th>
                        <th className="p-2">ריבית</th>
                        <th className="p-2">הצמדה</th>
                        <th className="p-2">שיטה</th>
                        <th className="p-2 text-left">יתרה</th>
                        <th className="p-2 text-left">החזר/חודש</th>
                        <th className="p-2">סיום</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.map((t) => {
                        const dim = t.confidence < 0.6;
                        return (
                          <tr
                            key={t.id}
                            style={{
                              borderBottom: "1px solid #FAFAF7",
                              opacity: dim ? 0.7 : 1,
                            }}
                            title={dim ? `רמת ודאות ${(t.confidence * 100).toFixed(0)}%` : ""}
                          >
                            <td className="p-2">
                              <input
                                type="text"
                                value={t.name}
                                onChange={(e) => updateDraft(t.id, "name", e.target.value)}
                                className="w-24 border-none bg-transparent font-semibold focus:outline-none"
                                style={{ color: "#1A1A1A" }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.01"
                                value={(t.interestRate * 100).toFixed(2)}
                                onChange={(e) => {
                                  const pct = parseFloat(e.target.value);
                                  updateDraft(
                                    t.id,
                                    "interestRate",
                                    Number.isFinite(pct) ? pct / 100 : 0
                                  );
                                }}
                                className="w-16 border-none bg-transparent text-left font-bold tabular-nums focus:outline-none"
                                style={{ color: "#2C7A5A" }}
                              />
                              <span className="text-[10px] text-verdant-muted">%</span>
                            </td>
                            <td className="p-2">
                              <select
                                value={t.indexation}
                                onChange={(e) =>
                                  updateDraft(t.id, "indexation", e.target.value as IndexationType)
                                }
                                className="cursor-pointer border-none bg-transparent text-[11px] font-bold focus:outline-none"
                                style={{ color: "#6B7280" }}
                              >
                                <option value="לא צמוד">לא צמוד</option>
                                <option value="מדד">מדד</option>
                                <option value="דולר">דולר</option>
                                <option value="אחר">אחר</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <select
                                value={t.repaymentMethod}
                                onChange={(e) =>
                                  updateDraft(
                                    t.id,
                                    "repaymentMethod",
                                    e.target.value as RepaymentMethod
                                  )
                                }
                                className="cursor-pointer border-none bg-transparent text-[11px] font-bold focus:outline-none"
                                style={{ color: "#6B7280" }}
                              >
                                <option value="שפיצר">שפיצר</option>
                                <option value="קרן שווה">קרן שווה</option>
                                <option value="בלון">בלון</option>
                                <option value="אחר">אחר</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={t.remainingBalance || ""}
                                onChange={(e) =>
                                  updateDraft(t.id, "remainingBalance", e.target.value)
                                }
                                className="w-24 border-none bg-transparent text-left font-bold tabular-nums focus:outline-none"
                                style={{ color: "#1A1A1A" }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={t.monthlyPayment || ""}
                                onChange={(e) =>
                                  updateDraft(t.id, "monthlyPayment", e.target.value)
                                }
                                className="w-20 border-none bg-transparent text-left font-bold tabular-nums focus:outline-none"
                                style={{ color: "#1A1A1A" }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="month"
                                value={t.endDate}
                                onChange={(e) => updateDraft(t.id, "endDate", e.target.value)}
                                className="w-24 border-none bg-transparent text-[10px] focus:outline-none"
                                style={{ color: "#6B7280" }}
                              />
                            </td>
                            <td className="p-2">
                              <button
                                onClick={() => removeDraft(t.id)}
                                title="הסר מהקליטה"
                                className="text-verdant-muted hover:text-red-600"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  delete
                                </span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-[#FFFFFF] px-6 py-3">
              <div className="text-[11px] text-verdant-muted">
                הנתונים נשמרים רק לאחר אישור. אפשר לערוך כל שדה לפני שמירה.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-verdant-muted hover:bg-verdant-bg"
                >
                  ביטול
                </button>
                <button
                  onClick={onConfirm}
                  disabled={draft.length === 0}
                  className="rounded-lg px-4 py-1.5 text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "#2C7A5A", color: "#FFFFFF" }}
                >
                  אישור — שמירה ({draft.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
