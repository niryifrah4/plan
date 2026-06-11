"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const [aiModel, setAiModel] = useState<"haiku" | "perplexity">("haiku");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadPreferences() {
      try {
        const res = await fetch("/api/settings/preferences");
        if (res.ok) {
          const data = await res.json();
          if (data.preferences?.ai_categorizer) {
            setAiModel(data.preferences.ai_categorizer);
          }
        }
      } catch (err) {
        console.error("Failed to load preferences", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadPreferences();
  }, []);

  const handleAiModelChange = async (model: "haiku" | "perplexity") => {
    if (model === aiModel) return;
    setAiModel(model);
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { ai_categorizer: model } }),
      });
      
      if (!res.ok) throw new Error("Failed to save");
      toast.success("הגדרות נשמרו בהצלחה");
    } catch (err) {
      toast.error("שגיאה בשמירת הגדרות");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-6 py-8"
      style={{ background: "var(--verdant-bg)" }}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-verdant-ink">הגדרות מערכת</h1>
            <p className="text-sm text-verdant-muted mt-1">ניהול והגדרות</p>
          </div>
          <Link
            href="/crm"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-verdant-muted transition-all hover:bg-gray-100 hover:text-verdant-ink"
            style={{ background: "#FAFAF7" }}
            title="חזרה"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/crm/settings/cities"
              className="card-pad flex flex-col gap-3 hover:shadow-md transition-shadow group"
              style={{ background: "#FFFFFF" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-verdant-bg text-verdant-accent group-hover:bg-verdant-accent group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined">location_city</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-verdant-ink">ניהול ערים</h2>
                  <p className="text-xs text-verdant-muted mt-0.5">רשימת ערים להשלמה אוטומטית</p>
                </div>
              </div>
            </Link>

            <Link
              href="/crm/settings/mappings"
              className="card-pad flex flex-col gap-3 hover:shadow-md transition-shadow group"
              style={{ background: "#FFFFFF" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-verdant-bg text-verdant-accent group-hover:bg-verdant-accent group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined">category</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-verdant-ink">ניהול ספקים וקטגוריות</h2>
                  <p className="text-xs text-verdant-muted mt-0.5">סיווג אוטומטי ושיוך בתי עסק</p>
                </div>
              </div>
            </Link>
          </div>

          <div className="card-pad max-w-xl" style={{ background: "#FFFFFF" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-verdant-bg text-verdant-accent">
                <span className="material-symbols-outlined">smart_toy</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-verdant-ink">זיהוי וסיווג חכם (AI)</h2>
                <p className="text-xs text-verdant-muted mt-0.5">בחר את המודל שיסווג אוטומטית עסקאות לא מוכרות</p>
              </div>
            </div>

            {isLoading ? (
              <div className="animate-pulse h-12 bg-gray-100 rounded-lg w-full"></div>
            ) : (
              <div className="flex bg-gray-100 p-1 rounded-lg w-full relative">
                <button
                  onClick={() => handleAiModelChange("haiku")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 z-10 ${
                    aiModel === "haiku" 
                      ? "bg-white text-verdant-ink shadow-sm" 
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  disabled={isSaving}
                >
                  Claude Haiku
                </button>
                <button
                  onClick={() => handleAiModelChange("perplexity")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 z-10 ${
                    aiModel === "perplexity" 
                      ? "bg-white text-verdant-ink shadow-sm" 
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  disabled={isSaving}
                >
                  Perplexity AI
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-3 flex items-start gap-1 leading-snug">
              <span className="material-symbols-outlined text-[14px]">info</span>
              <span>Perplexity מבצע חיפוש באינטרנט (Web Search) כדי לזהות עסקים לא מוכרים בישראל, בעוד ש-Claude מהיר יותר.</span>
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}

