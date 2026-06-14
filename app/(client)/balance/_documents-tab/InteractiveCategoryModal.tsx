"use client";

import { useState, useEffect } from "react";
import { fmtILS } from "@/lib/format";

interface Props {
  open: boolean;
  merchantKey: string;
  displaySample: string;
  txCount: number;
  totalAmount: number;
  initialSuggestions: { category: string; categoryLabel: string; confidence: number }[];
  onClose: () => void;
  onSelect: (categoryKey: string) => void;
}

export function InteractiveCategoryModal({
  open,
  merchantKey,
  displaySample,
  txCount,
  totalAmount,
  initialSuggestions,
  onClose,
  onSelect,
}: Props) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    explanation: string;
    suggestions: { category: string; categoryLabel: string; confidence?: number }[];
  } | null>(null);
  const [error, setError] = useState("");

  const checkWithAi = async (nextDescription: string, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/categorize/interactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantKey,
          description: nextDescription.trim() || displaySample || merchantKey,
        }),
        signal,
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "שגיאה בפנייה ל-AI");
      }

      setResult({
        explanation: data.explanation || "",
        suggestions: Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : [],
      });
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err.message || "שגיאה בפנייה ל-AI");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setDescription("");
      setResult(null);
      setError("");
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    setError("");
    setResult({
      explanation:
        initialSuggestions.length > 0
          ? "אלו ההמלצות שנמצאו בריצת הסיווג הכללית. אפשר לבחור אחת או לכתוב הסבר ולבדוק שוב."
          : "לא נשמרו המלצות לרשומה הזו מהריצה הכללית. כתוב הסבר קצר ובדוק שוב.",
      suggestions: initialSuggestions,
    });
    setLoading(false);

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, merchantKey, initialSuggestions, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="my-auto w-full max-w-lg overflow-hidden rounded-2xl bg-white text-right shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "#FAFAF7" }}>
          <div>
            <h2 className="text-base font-extrabold text-verdant-ink">אפשרויות AI נוספות</h2>
            <p className="mt-0.5 text-xs text-verdant-muted">ההמלצות נטענות מהרצת הסיווג הכללית. כתיבה כאן בודקת מחדש.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 rounded-xl bg-gray-50 p-3">
            <div className="text-sm font-bold text-verdant-ink">{displaySample}</div>
            <div className="mt-1 text-[11px] text-verdant-muted">
              {txCount} תנועות מופיעות תחת שם זה (סה"כ {fmtILS(totalAmount)})
            </div>
          </div>

          <form
            className="mb-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void checkWithAi(description);
            }}
          >
            <label className="block text-[11px] font-extrabold text-verdant-ink">
              יודע מה זה? כתוב כאן ו־AI יבדוק שוב
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm font-bold text-verdant-ink outline-none transition focus:border-verdant-accent focus:ring-2 focus:ring-verdant-accent/20"
              placeholder="לדוגמה: זה תשלום לסובל הובלות / שיעור לילד / ספק עסקי..."
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !description.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-verdant-accent py-2.5 text-sm font-extrabold text-white transition hover:bg-verdant-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              בדוק שוב עם AI
            </button>
          </form>

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm font-bold text-verdant-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-verdant-accent border-t-transparent"></span>
              בודק אפשרויות...
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-3 text-[12px] font-bold text-red-600">{error}</div>
          ) : !result ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-sm font-bold text-verdant-muted">
              אין עדיין תשובה.
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {result.explanation && (
                <div className="mb-4 rounded-xl border border-verdant-accent/20 bg-verdant-accent/5 p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-verdant-accent mt-0.5">smart_toy</span>
                  <div className="text-sm leading-relaxed text-verdant-ink">
                    {result.explanation}
                  </div>
                </div>
              </div>
              )}

              <div className="space-y-2">
                <div className="mb-2 text-[11px] font-bold text-verdant-muted">האפשרויות המומלצות:</div>
                {result.suggestions.length > 0 ? (
                  result.suggestions.map((sug, i) => (
                    <button
                      key={sug.category}
                      onClick={() => onSelect(sug.category)}
                      className="w-full flex items-center justify-between rounded-xl border border-gray-200 p-3 transition-all hover:border-verdant-accent hover:bg-verdant-accent/5 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[12px] font-bold text-gray-500 group-hover:bg-verdant-accent group-hover:text-white transition-colors">
                          {i + 1}
                        </span>
                        <span className="font-bold text-verdant-ink text-sm">{sug.categoryLabel}</span>
                        {typeof sug.confidence === "number" && (
                          <span className="text-[10px] font-bold text-verdant-muted">
                            {Math.round(sug.confidence * 100)}%
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-verdant-accent">
                        בחר
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 text-center py-4">לא נמצאו המלצות ספציפיות</div>
                )}
              </div>

              <button
                onClick={onClose}
                className="mt-4 w-full rounded-xl py-2 text-sm font-bold text-verdant-muted transition-colors hover:bg-gray-100"
              >
                סגור בלי לבחור
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
