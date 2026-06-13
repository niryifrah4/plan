"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import {
  loadHiddenCatalog,
  hydrateHiddenCatalogFromRemote,
  upsertHiddenCatalogMerchant,
  removeHiddenCatalogMerchant,
  HIDDEN_CATALOG_EVENT,
} from "@/lib/hidden-merchants/catalog-store";
import type {
  HiddenCatalogMerchant,
  HiddenLearningSuggestion,
  HiddenVisibleClient,
} from "@/lib/hidden-merchants/types";

// Advisor-only: /crm is gated to advisors by the CRM layout.
export default function CrmHiddenMerchantsCatalogPage() {
  const [catalog, setCatalog] = useState<HiddenCatalogMerchant[]>([]);
  const [suggestions, setSuggestions] = useState<HiddenLearningSuggestion[]>([]);
  const [visibleClients, setVisibleClients] = useState<HiddenVisibleClient[]>([]);
  const [visibleClientsStatus, setVisibleClientsStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [visibleModalKey, setVisibleModalKey] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const refreshCatalog = () => setCatalog(loadHiddenCatalog());

  useEffect(() => {
    refreshCatalog();
    void hydrateHiddenCatalogFromRemote().then(refreshCatalog);
    void loadSuggestions();
    void loadVisibleClients();
    window.addEventListener(HIDDEN_CATALOG_EVENT, refreshCatalog);
    return () => window.removeEventListener(HIDDEN_CATALOG_EVENT, refreshCatalog);
  }, []);

  const loadSuggestions = async () => {
    try {
      const sb = getSupabaseBrowser();
      if (!sb) return;
      const { data, error } = await sb.rpc("hidden_merchant_learning_suggestions");
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

  const loadVisibleClients = async () => {
    setVisibleClientsStatus("loading");
    try {
      const sb = getSupabaseBrowser();
      if (!sb) {
        setVisibleClientsStatus("error");
        return;
      }
      const { data, error } = await sb.rpc("hidden_merchant_visible_clients");
      if (error || !data) {
        setVisibleClientsStatus("error");
        return;
      }
      setVisibleClients(
        data.map((r: Record<string, unknown>) => ({
          normalizedKey: String(r.normalized_key),
          householdId: String(r.household_id),
          familyName: String(r.family_name ?? "לקוח ללא שם"),
          label: String(r.label ?? r.normalized_key),
          updatedAt: String(r.updated_at ?? new Date().toISOString()),
        }))
      );
      setVisibleClientsStatus("ready");
    } catch {
      setVisibleClientsStatus("error");
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const addMerchant = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    await upsertHiddenCatalogMerchant(clean, true);
    setNewName("");
    flash(`"${clean}" נוסף לקטלוג`);
    void loadSuggestions();
  };

  const remove = async (key: string, label: string) => {
    await removeHiddenCatalogMerchant(key);
    flash(`"${label}" הוסר מהקטלוג`);
    void loadSuggestions();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((m) => m.label.toLowerCase().includes(q)) : catalog;
  }, [catalog, query]);

  const pendingSuggestions = suggestions.filter((s) => !s.inCatalog);
  const visibleByKey = useMemo(() => {
    const map = new Map<string, HiddenVisibleClient[]>();
    for (const item of visibleClients) {
      const current = map.get(item.normalizedKey) ?? [];
      current.push(item);
      map.set(item.normalizedKey, current);
    }
    return map;
  }, [visibleClients]);
  const visibleModalRows = visibleModalKey ? visibleByKey.get(visibleModalKey) ?? [] : [];
  const visibleModalLabel =
    visibleModalKey && catalog.find((m) => m.normalizedKey === visibleModalKey)?.label;

  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-6 py-8"
      style={{ background: "var(--verdant-bg)" }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-verdant-ink">קטלוג עסקים מוסתרים</h1>
            <p className="mt-1 text-sm text-verdant-muted">
              בתי עסק שמוסתרים כברירת מחדל לכל הלקוחות (למשל העברות פנימיות, ביט,
              החזרי הלוואה). לקוח יכול תמיד לבטל הסתרה אצלו.
            </p>
          </div>
          <Link
            href="/crm/settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-verdant-muted transition-all hover:bg-gray-100 hover:text-verdant-ink"
            style={{ background: "#FAFAF7" }}
            title="חזרה"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>

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

        {pendingSuggestions.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-extrabold text-verdant-ink">
              הצעות שנלמדו מהשטח
            </h2>
            <p className="mb-2 text-[12px] text-verdant-muted">
              בתי עסק שלקוחות הסתירו אבל עדיין לא בקטלוג. הוסף כדי שיוסתרו כברירת
              מחדל לכולם.
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
                      {s.clientCount} לקוחות הסתירו
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
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-verdant-muted">
                      <span>
                        מוסתר
                        {m.aliases.length > 1 && ` · ${m.aliases.length} שמות`}
                      </span>
                      {visibleClientsStatus === "loading" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 font-bold text-gray-500">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
                          בודק לקוחות שהחריגו
                        </span>
                      )}
                      {visibleClientsStatus === "error" && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700"
                          title="לא ניתן לטעון כרגע את רשימת הלקוחות שבחרו להציג. ודא שה-migration עם hidden_merchant_visible_clients הופעל."
                        >
                          <span className="material-symbols-outlined text-[12px]">warning</span>
                          נתוני החרגות לא נטענו
                        </span>
                      )}
                      {visibleClientsStatus === "ready" &&
                        (visibleByKey.get(m.normalizedKey)?.length ?? 0) === 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 font-bold text-gray-500">
                            0 לקוחות מציגים
                          </span>
                        )}
                      {visibleClientsStatus === "ready" &&
                        (visibleByKey.get(m.normalizedKey)?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setVisibleModalKey(m.normalizedKey)}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-600 transition hover:bg-red-100"
                          title="לקוחות שבחרו להציג את בית העסק הזה"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          {visibleByKey.get(m.normalizedKey)?.length} לקוחות מציגים
                        </button>
                      )}
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

        {visibleModalKey && (
          <VisibleClientsModal
            label={visibleModalLabel || visibleModalRows[0]?.label || visibleModalKey}
            rows={visibleModalRows}
            onClose={() => setVisibleModalKey(null)}
          />
        )}
      </div>
    </main>
  );
}

function VisibleClientsModal({
  label,
  rows,
  onClose,
}: {
  label: string;
  rows: HiddenVisibleClient[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
      role="presentation"
    >
      <div
        className="max-h-[82vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white text-right shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="לקוחות שמציגים בית עסק מוסתר"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-verdant-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-verdant-ink">לקוחות שמציגים</h2>
            <div className="mt-1 truncate text-[12px] font-bold text-verdant-muted">{label}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-verdant-muted transition hover:bg-verdant-bg"
            title="סגור"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-verdant-line p-4 text-[13px] font-bold text-verdant-muted">
              אין לקוחות שסימנו להציג את בית העסק הזה.
            </div>
          ) : (
            <ul className="divide-y divide-verdant-line overflow-hidden rounded-xl border border-verdant-line">
              {rows.map((row) => (
                <li key={`${row.householdId}-${row.normalizedKey}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-verdant-ink">
                      {row.familyName}
                    </div>
                    <div className="text-[11px] font-bold text-verdant-muted">
                      עודכן ב-{new Date(row.updatedAt).toLocaleDateString("he-IL")}
                    </div>
                  </div>
                  <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600">
                    מציג
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
