"use client";

import { DragEvent, useEffect, useRef, useState } from "react";
import type { Issuer } from "@/lib/doc-parser/issuer-registry";
import type { ParsedDocument } from "@/lib/doc-parser/types";

type Props = {
  issuer: Issuer;
  onClose: () => void;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amount);

export default function TestModal({ issuer, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleFileChange = async (file: File | null) => {
    if (!file) return;

    setFileName(file.name);
    setParsed(null);
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/documents/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "שגיאה בפענוח הקובץ");
      }

      setParsed(data as ParsedDocument);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בפענוח הקובץ");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    handleFileChange(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issuer-test-title"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 id="issuer-test-title" className="text-xl font-bold text-verdant-ink">
              בדיקת קובץ לדוגמה - {issuer.label}
            </h2>
            <p className="mt-1 text-sm text-verdant-muted">
              הפענוח מריץ את אותו מנוע של העלאת מסמכים, אבל לא משייך ולא שומר שום דבר ללקוח.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-verdant-muted hover:bg-gray-100 hover:text-verdant-ink"
            aria-label="סגירה"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-4 overflow-auto px-6 py-5">
          <div
            className={`rounded-2xl border border-dashed p-5 transition ${
              isDragging
                ? "border-verdant-accent bg-verdant-accent/10 shadow-inner"
                : "border-verdant-accent/40 bg-verdant-bg/50"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-verdant-ink">
                  העלה תדפיס PDF / Excel / CSV לבדיקה
                </p>
                <p className="mt-1 text-xs text-verdant-muted">
                  {fileName
                    ? `קובץ אחרון: ${fileName}`
                    : "בחר קובץ או גרור אותו לכאן כדי לראות את כל בתי העסק והקטגוריות שזוהו."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-verdant-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                {loading ? "מפענח..." : "בחר קובץ"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {parsed ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-verdant-muted">זוהה כמוסד</p>
                  <p className="mt-1 text-sm font-bold text-verdant-ink">{parsed.bankHint}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-verdant-muted">עסקאות</p>
                  <p className="mt-1 text-sm font-bold text-verdant-ink">
                    {parsed.transactions.length.toLocaleString("he-IL")}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-verdant-muted">חיובים</p>
                  <p className="mt-1 text-sm font-bold text-verdant-ink">
                    {formatCurrency(parsed.totalDebit)}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-verdant-muted">זיכויים</p>
                  <p className="mt-1 text-sm font-bold text-verdant-ink">
                    {formatCurrency(parsed.totalCredit)}
                  </p>
                </div>
              </div>

              {parsed.warnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="mb-1 font-semibold">אזהרות פענוח</p>
                  <ul className="list-inside list-disc space-y-1">
                    {parsed.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-gray-100">
                <div className="overflow-auto">
                  <table className="w-full min-w-[760px] text-right text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-verdant-muted">
                      <tr>
                        <th className="px-4 py-3">תאריך</th>
                        <th className="px-4 py-3">בית עסק / תיאור</th>
                        <th className="px-4 py-3">סכום</th>
                        <th className="px-4 py-3">קטגוריה</th>
                        <th className="px-4 py-3">ביטחון</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsed.transactions.map((tx, index) => (
                        <tr key={`${tx.date}-${tx.description}-${index}`} className="hover:bg-gray-50/70">
                          <td className="whitespace-nowrap px-4 py-3 text-verdant-muted">{tx.date}</td>
                          <td className="px-4 py-3 font-medium text-verdant-ink">{tx.description}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-verdant-ink">
                            {formatCurrency(tx.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-verdant-bg px-2.5 py-1 text-xs font-semibold text-verdant-ink">
                              {tx.categoryLabel || tx.category}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-verdant-muted">
                            {typeof tx.confidence === "number"
                              ? `${Math.round(tx.confidence * 100)}%`
                              : "לא ידוע"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
