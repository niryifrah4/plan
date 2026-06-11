"use client";

import { useState, useEffect } from "react";
import { fmtILS } from "@/lib/format";

interface Props {
  open: boolean;
  merchantKey: string;
  displaySample: string;
  txCount: number;
  totalAmount: number;
  onClose: () => void;
  onMap: (categoryKey: string) => void;
}

export function InteractiveCategoryModal({
  open,
  merchantKey,
  displaySample,
  txCount,
  totalAmount,
  onClose,
  onMap,
}: Props) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    explanation: string;
    suggestions: { category: string; categoryLabel: string }[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setDescription("");
      setResult(null);
      setError("");
    } else {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/categorize/interactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantKey, description }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "שגיאה בפנייה ל-AI");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="my-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "#FAFAF7" }}>
          <div>
            <h2 className="text-base font-extrabold text-verdant-ink">התייעצות עם AI</h2>
            <p className="text-xs text-verdant-muted mt-0.5">ספר לי קצת על בית העסק ואעזור לך לסווג אותו</p>
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

          {!result ? (
            <form onSubmit={handleSubmit}>
              <label className="block text-xs font-bold text-verdant-ink mb-2">
                מה מהות העסק? (למשל: "מספרה", "חוג לילד", "חנות חומרי בניין")
              </label>
              <textarea
                className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none transition-all focus:border-verdant-accent focus:ring-1 focus:ring-verdant-accent mb-4"
                rows={3}
                placeholder="הקלד כאן את ההסבר שלך..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                autoFocus
              />
              
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-2 text-[11px] text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!description.trim() || loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-verdant-accent py-2.5 text-sm font-bold text-white transition-all hover:bg-verdant-ink disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                    חושב...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                    שאל את AI
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="mb-4 rounded-xl border border-verdant-accent/20 bg-verdant-accent/5 p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-verdant-accent mt-0.5">smart_toy</span>
                  <div className="text-sm leading-relaxed text-verdant-ink">
                    {result.explanation}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-bold text-verdant-muted mb-2">הקטגוריות המומלצות:</div>
                {result.suggestions.length > 0 ? (
                  result.suggestions.map((sug, i) => (
                    <button
                      key={sug.category}
                      onClick={() => onMap(sug.category)}
                      className="w-full flex items-center justify-between rounded-xl border border-gray-200 p-3 transition-all hover:border-verdant-accent hover:bg-verdant-accent/5 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[12px] font-bold text-gray-500 group-hover:bg-verdant-accent group-hover:text-white transition-colors">
                          {i + 1}
                        </span>
                        <span className="font-bold text-verdant-ink text-sm">{sug.categoryLabel}</span>
                      </div>
                      <span className="text-[11px] font-bold text-verdant-accent opacity-0 group-hover:opacity-100 transition-opacity">
                        לחץ להחלה
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 text-center py-4">לא נמצאו המלצות ספציפיות</div>
                )}
              </div>

              <button
                onClick={() => {
                  setResult(null);
                  setDescription("");
                }}
                className="mt-4 w-full rounded-xl py-2 text-sm font-bold text-verdant-muted transition-colors hover:bg-gray-100"
              >
                שאל שוב עם תיאור אחר
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
