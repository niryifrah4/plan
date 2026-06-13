"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadParsedTransactions } from "@/lib/budget-import";
import { hiddenMerchantKey } from "@/lib/hidden-merchants/normalize";
import {
  loadHiddenOverrides,
  setHiddenOverride,
  clearHiddenOverride,
  hydrateHiddenOverridesFromRemote,
  HIDDEN_OVERRIDES_EVENT,
} from "@/lib/hidden-merchants/overrides-store";
import {
  loadHiddenCatalog,
  hydrateHiddenCatalogFromRemote,
  HIDDEN_CATALOG_EVENT,
} from "@/lib/hidden-merchants/catalog-store";
import { classifyHidden } from "@/lib/hidden-merchants/classify";
import type { HiddenOverride, HiddenCatalogMerchant } from "@/lib/hidden-merchants/types";

interface MerchantRow {
  key: string;
  label: string;
  txCount: number;
  /** Effective: true=hidden, false=explicitly visible, null=default visible. */
  effective: boolean | null;
  source: "client" | "catalog" | "default";
}

export default function ManageHiddenMerchantsPage() {
  const [overrides, setOverrides] = useState<HiddenOverride[]>([]);
  const [catalog, setCatalog] = useState<HiddenCatalogMerchant[]>([]);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const ov = loadHiddenOverrides();
      const cat = loadHiddenCatalog();
      setOverrides(ov);
      setCatalog(cat);
      setMerchants(buildMerchantRows(ov, cat));
    };
    refresh();
    void hydrateHiddenOverridesFromRemote().then(refresh);
    void hydrateHiddenCatalogFromRemote().then(refresh);
    window.addEventListener(HIDDEN_OVERRIDES_EVENT, refresh);
    window.addEventListener(HIDDEN_CATALOG_EVENT, refresh);
    window.addEventListener("verdant:parsed_transactions:updated", refresh);
    return () => {
      window.removeEventListener(HIDDEN_OVERRIDES_EVENT, refresh);
      window.removeEventListener(HIDDEN_CATALOG_EVENT, refresh);
      window.removeEventListener("verdant:parsed_transactions:updated", refresh);
    };
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredMerchants = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? merchants.filter((m) => m.label.toLowerCase().includes(q))
      : merchants;
    return rows.slice(0, 300);
  }, [merchants, query]);

  const hide = (row: MerchantRow) => {
    setHiddenOverride(row.label, "hidden");
    flash(`"${row.label}" הוסתר`);
  };
  const show = (row: MerchantRow) => {
    setHiddenOverride(row.label, "visible");
    flash(`"${row.label}" יוצג שוב`);
  };
  const undo = (key: string, label: string) => {
    clearHiddenOverride(key);
    flash(`הסימון של "${label}" בוטל`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-verdant-muted hover:text-verdant-ink"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          חזרה להגדרות
        </Link>
        <h1 className="text-2xl font-extrabold text-verdant-ink">עסקים מוסתרים</h1>
        <p className="mt-1 text-sm text-verdant-muted">
          בית עסק מוסתר נעלם מתור המיפוי ומהתזרים (העסקאות נשמרות). ההחלטה שלך תמיד
          גוברת על ברירת המחדל של המערכת.
        </p>
      </header>

      {/* ── Area A: my decisions ── */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-extrabold text-verdant-ink">
          מה שסימנתי ({overrides.length})
        </h2>
        {overrides.length === 0 ? (
          <p className="rounded-xl border border-dashed border-verdant-line bg-white/50 p-4 text-[13px] text-verdant-muted">
            עדיין לא סימנת בתי עסק. השתמש ברשימה למטה כדי להסתיר.
          </p>
        ) : (
          <ul className="divide-y divide-verdant-line overflow-hidden rounded-2xl border border-verdant-line bg-white">
            {overrides.map((o) => (
              <li
                key={o.normalizedKey}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-verdant-ink">{o.label}</div>
                  <div className="text-[11px] text-verdant-muted">
                    {o.decision === "hidden" ? "מוסתר" : "גלוי (ביטול הסתרה)"}
                    {o.aliases.length > 1 && ` · ${o.aliases.length} שמות`}
                  </div>
                </div>
                <button
                  onClick={() => undo(o.normalizedKey, o.label)}
                  className="shrink-0 rounded-full border border-verdant-line px-3 py-1 text-[11px] font-bold text-verdant-muted hover:border-red-300 hover:text-red-600"
                >
                  בטל
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Area B: all my merchants ── */}
      <section>
        <h2 className="mb-2 text-sm font-extrabold text-verdant-ink">
          כל בתי העסק שלי ({merchants.length})
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש בית עסק…"
          className="mb-3 w-full rounded-xl border border-verdant-line bg-white px-3 py-2 text-sm outline-none focus:border-verdant-accent"
        />
        {filteredMerchants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-verdant-line bg-white/50 p-4 text-[13px] text-verdant-muted">
            לא נמצאו בתי עסק. ייתכן שעדיין לא נטענו עסקאות.
          </p>
        ) : (
          <ul className="divide-y divide-verdant-line overflow-hidden rounded-2xl border border-verdant-line bg-white">
            {filteredMerchants.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-bold text-verdant-ink">{m.label}</div>
                  <div className="text-[11px] text-verdant-muted">
                    {m.txCount} עסקאות · {effectiveLabel(m)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => hide(m)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                      m.effective === true
                        ? "bg-gray-700 text-white"
                        : "border border-verdant-line text-verdant-muted hover:border-gray-500 hover:text-gray-700"
                    }`}
                  >
                    הסתר
                  </button>
                  <button
                    onClick={() => show(m)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                      m.effective === false
                        ? "bg-verdant-accent text-white"
                        : "border border-verdant-line text-verdant-muted hover:border-verdant-accent hover:text-verdant-accent"
                    }`}
                  >
                    הצג
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {merchants.length > filteredMerchants.length && !query && (
          <p className="mt-2 text-center text-[11px] text-verdant-muted">
            מוצגים {filteredMerchants.length} מתוך {merchants.length}. השתמש בחיפוש
            כדי למצוא בית עסק ספציפי.
          </p>
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

function buildMerchantRows(
  overrides: HiddenOverride[],
  catalog: HiddenCatalogMerchant[]
): MerchantRow[] {
  const txs = loadParsedTransactions();
  const byKey = new Map<string, { label: string; count: number }>();
  for (const t of txs) {
    if (!t.description) continue;
    const key = hiddenMerchantKey(t.description);
    if (!key) continue;
    const cur = byKey.get(key);
    if (cur) cur.count += 1;
    else byKey.set(key, { label: t.description.trim(), count: 1 });
  }
  const rows: MerchantRow[] = [];
  for (const [key, { label, count }] of byKey) {
    const override = overrides.find((o) => o.normalizedKey === key);
    const effective = classifyHidden(label, { overrides, catalog });
    rows.push({
      key,
      label,
      txCount: count,
      effective,
      source: override ? "client" : effective !== null ? "catalog" : "default",
    });
  }
  rows.sort((a, b) => b.txCount - a.txCount);
  return rows;
}

function effectiveLabel(m: MerchantRow): string {
  if (m.effective === true)
    return m.source === "client" ? "מוסתר (סימון שלך)" : "מוסתר (ברירת מחדל)";
  if (m.effective === false) return "גלוי (סימון שלך)";
  return "גלוי";
}
