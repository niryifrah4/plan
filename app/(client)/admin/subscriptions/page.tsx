"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import {
  loadSubscriptionCatalog,
  hydrateCatalogFromRemote,
  upsertCatalogMerchant,
  removeCatalogMerchant,
  SUBSCRIPTION_CATALOG_EVENT,
} from "@/lib/subscriptions/catalog-store";
import type { CatalogMerchant, LearningSuggestion } from "@/lib/subscriptions/types";

export default function AdminSubscriptionsPage() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [catalog, setCatalog] = useState<CatalogMerchant[]>([]);
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // ── Gate: advisors only ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    getCurrentUser()
      .then((u) => {
        if (!alive) return;
        setAllowed(u?.role === "advisor");
        setReady(true);
      })
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const refreshCatalog = () => setCatalog(loadSubscriptionCatalog());

  useEffect(() => {
    if (!allowed) return;
    refreshCatalog();
    void hydrateCatalogFromRemote().then(refreshCatalog);
    void loadSuggestions();
    window.addEventListener(SUBSCRIPTION_CATALOG_EVENT, refreshCatalog);
    return () => window.removeEventListener(SUBSCRIPTION_CATALOG_EVENT, refreshCatalog);
  }, [allowed]);

  const loadSuggestions = async () => {
    try {
      const sb = getSupabaseBrowser();
      if (!sb) return;
      const { data, error } = await sb.rpc("subscription_learning_suggestions");
      if (error || !data) return;
      setSuggestions(
        data.map((r: Record<string, unknown>) => ({
          normalizedKey: String(r.normalized_key),
          sampleLabel: String(r.sample_label ?? r.normalized_key),
          clientCount: Number(r.client_count ?? 0),
          inCatalog: Boolean(r.in_catalog),
        }))
      );
    } catch {
      /* best-effort */
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const addMerchant = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    await upsertCatalogMerchant(clean, true);
    setNewName("");
    flash(`"${clean}" נוסף לקטלוג`);
    void loadSuggestions();
  };

  const remove = async (key: string, label: string) => {
    await removeCatalogMerchant(key);
    flash(`"${label}" הוסר מהקטלוג`);
    void loadSuggestions();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((m) => m.label.toLowerCase().includes(q)) : catalog;
  }, [catalog, query]);

  const pendingSuggestions = suggestions.filter((s) => !s.inCatalog);

  if (!ready) {
    return <div className="p-8 text-center text-verdant-muted">טוען…</div>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-verdant-ink">העמוד הזה זמין ליועצים בלבד.</p>
        <Link href="/settings" className="mt-3 inline-block text-verdant-accent">
          חזרה להגדרות
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-verdant-muted hover:text-verdant-ink"
        >
          <span className="material-symbols-rounded text-[18px]">arrow_forward</span>
          חזרה להגדרות
        </Link>
        <h1 className="text-2xl font-extrabold text-verdant-ink">
          קטלוג מנויים מערכתי
        </h1>
        <p className="mt-1 text-sm text-verdant-muted">
          רשימת בתי העסק שנחשבים מנוי עבור כל הלקוחות. כשמישהו טוען עסקה מבית עסק
          שכאן — היא תזוהה אוטומטית כמנוי (אלא אם ללקוח יש החלטה אישית הפוכה).
        </p>
      </header>

      {/* ── Add new ── */}
      <div className="mb-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addMerchant(newName)}
          placeholder="שם בית עסק להוספה לקטלוג…"
          className="flex-1 rounded-xl border border-verdant-line bg-white px-3 py-2 text-sm outline-none focus:border-verdant-accent"
        />
        <button
          onClick={() => addMerchant(newName)}
          className="rounded-xl bg-verdant-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          הוסף
        </button>
      </div>

      {/* ── Learning suggestions ── */}
      {pendingSuggestions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-extrabold text-verdant-ink">
            הצעות שנלמדו מהשטח
          </h2>
          <p className="mb-2 text-[12px] text-verdant-muted">
            בתי עסק שלקוחות סימנו כמנוי אבל עדיין לא בקטלוג. הוסף כדי שהזיהוי יחול
            על כולם.
          </p>
          <ul className="divide-y divide-amber-100 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
            {pendingSuggestions.slice(0, 30).map((s) => (
              <li
                key={s.normalizedKey}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-verdant-ink">
                    {s.sampleLabel}
                  </div>
                  <div className="text-[11px] text-verdant-muted">
                    {s.clientCount} לקוחות סימנו כמנוי
                  </div>
                </div>
                <button
                  onClick={() => addMerchant(s.sampleLabel)}
                  className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-amber-600"
                >
                  הוסף לקטלוג
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Catalog list ── */}
      <section>
        <h2 className="mb-2 text-sm font-extrabold text-verdant-ink">
          בקטלוג ({catalog.length})
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש…"
          className="mb-3 w-full rounded-xl border border-verdant-line bg-white px-3 py-2 text-sm outline-none focus:border-verdant-accent"
        />
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-verdant-line bg-white/50 p-4 text-[13px] text-verdant-muted">
            הקטלוג ריק. הוסף בתי עסק למעלה, או קבל הצעות שנלמדו מהשטח.
          </p>
        ) : (
          <ul className="divide-y divide-verdant-line overflow-hidden rounded-2xl border border-verdant-line bg-white">
            {filtered.map((m) => (
              <li
                key={m.normalizedKey}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-verdant-ink">{m.label}</div>
                  <div className="text-[11px] text-verdant-muted">
                    מנוי
                    {m.aliases.length > 1 && ` · ${m.aliases.length} שמות`}
                  </div>
                </div>
                <button
                  onClick={() => remove(m.normalizedKey, m.label)}
                  className="shrink-0 rounded-full border border-verdant-line px-3 py-1 text-[11px] font-bold text-verdant-muted hover:border-red-300 hover:text-red-600"
                >
                  הסר
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-verdant-ink px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
