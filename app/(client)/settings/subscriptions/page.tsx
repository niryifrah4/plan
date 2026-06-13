"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadParsedTransactions } from "@/lib/budget-import";
import { subscriptionKey } from "@/lib/subscriptions/normalize";
import {
  loadSubscriptionOverrides,
  setSubscriptionOverride,
  clearSubscriptionOverride,
  hydrateOverridesFromRemote,
  SUBSCRIPTION_OVERRIDES_EVENT,
} from "@/lib/subscriptions/overrides-store";
import {
  loadSubscriptionCatalog,
  hydrateCatalogFromRemote,
  SUBSCRIPTION_CATALOG_EVENT,
} from "@/lib/subscriptions/catalog-store";
import { classifySubscription } from "@/lib/subscriptions/classify";
import type {
  SubscriptionOverride,
  CatalogMerchant,
} from "@/lib/subscriptions/types";

interface MerchantRow {
  key: string;
  label: string;
  txCount: number;
  /** Effective state: true=subscription, false=not, null=auto/unknown. */
  effective: boolean | null;
  source: "client" | "catalog" | "auto";
}

export default function ManageSubscriptionsPage() {
  const [overrides, setOverrides] = useState<SubscriptionOverride[]>([]);
  const [catalog, setCatalog] = useState<CatalogMerchant[]>([]);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<MerchantRow | null>(null);

  // ── Load + keep in sync ────────────────────────────────────────────────
  useEffect(() => {
    const refresh = () => {
      const ov = loadSubscriptionOverrides();
      const cat = loadSubscriptionCatalog();
      setOverrides(ov);
      setCatalog(cat);
      setMerchants(buildMerchantRows(ov, cat));
    };
    refresh();
    void hydrateOverridesFromRemote().then(refresh);
    void hydrateCatalogFromRemote().then(refresh);
    window.addEventListener(SUBSCRIPTION_OVERRIDES_EVENT, refresh);
    window.addEventListener(SUBSCRIPTION_CATALOG_EVENT, refresh);
    window.addEventListener("verdant:parsed_transactions:updated", refresh);
    return () => {
      window.removeEventListener(SUBSCRIPTION_OVERRIDES_EVENT, refresh);
      window.removeEventListener(SUBSCRIPTION_CATALOG_EVENT, refresh);
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

  // ── Actions ────────────────────────────────────────────────────────────
  const markNotSubscription = (row: MerchantRow) => {
    setSubscriptionOverride(row.label, "not_subscription");
    flash(`"${row.label}" סומן כלא מנוי`);
  };

  const confirmMarkSubscription = (appliesToPast: boolean) => {
    if (!confirmFor) return;
    setSubscriptionOverride(confirmFor.label, "subscription", appliesToPast);
    flash(
      `"${confirmFor.label}" סומן כמנוי${appliesToPast ? " (כולל עסקאות עבר)" : ""}`
    );
    setConfirmFor(null);
  };

  const undoOverride = (key: string, label: string) => {
    clearSubscriptionOverride(key);
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
        <h1 className="text-2xl font-extrabold text-verdant-ink">ניהול מנויים</h1>
        <p className="mt-1 text-sm text-verdant-muted">
          קובע אילו בתי עסק נחשבים אצלך מנוי קבוע. ההחלטה שלך תמיד גוברת על ברירת
          המחדל של המערכת.
        </p>
      </header>

      {/* ── Area A: my decisions ── */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-extrabold text-verdant-ink">
          מה שכבר סימנתי ({overrides.length})
        </h2>
        {overrides.length === 0 ? (
          <p className="rounded-xl border border-dashed border-verdant-line bg-white/50 p-4 text-[13px] text-verdant-muted">
            עדיין לא סימנת בתי עסק. השתמש ברשימה למטה כדי לסמן.
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
                    {o.decision === "subscription" ? "מנוי" : "לא מנוי"}
                    {o.decision === "subscription" &&
                      (o.appliesToPast ? " · כולל עבר" : " · מהיום והלאה")}
                    {o.aliases.length > 1 && ` · ${o.aliases.length} שמות`}
                  </div>
                </div>
                <button
                  onClick={() => undoOverride(o.normalizedKey, o.label)}
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
                    onClick={() => setConfirmFor(m)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                      m.effective === true
                        ? "bg-verdant-accent text-white"
                        : "border border-verdant-line text-verdant-muted hover:border-verdant-accent hover:text-verdant-accent"
                    }`}
                  >
                    מנוי
                  </button>
                  <button
                    onClick={() => markNotSubscription(m)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                      m.effective === false
                        ? "bg-gray-700 text-white"
                        : "border border-verdant-line text-verdant-muted hover:border-gray-500 hover:text-gray-700"
                    }`}
                  >
                    לא מנוי
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

      {/* ── Confirm modal (mark as subscription) ── */}
      {confirmFor && (
        <ConfirmSubscriptionModal
          merchantLabel={confirmFor.label}
          onCancel={() => setConfirmFor(null)}
          onConfirm={confirmMarkSubscription}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-verdant-ink px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Confirm modal with the "also mark past" checkbox ──────────────────────────

function ConfirmSubscriptionModal({
  merchantLabel,
  onCancel,
  onConfirm,
}: {
  merchantLabel: string;
  onCancel: () => void;
  onConfirm: (appliesToPast: boolean) => void;
}) {
  const [alsoPast, setAlsoPast] = useState(true);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <h3 className="text-lg font-extrabold text-verdant-ink">
          לסמן כמנוי?
        </h3>
        <p className="mt-1 text-[13px] text-verdant-muted">
          לסמן את <span className="font-bold text-verdant-ink">{merchantLabel}</span>{" "}
          כמנוי קבוע. כל עסקה עתידית מבית העסק הזה תזוהה אוטומטית כמנוי.
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-verdant-accent/[0.06] p-3">
          <input
            type="checkbox"
            checked={alsoPast}
            onChange={(e) => setAlsoPast(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-verdant-accent"
          />
          <span className="text-[13px] text-verdant-ink">
            לסמן גם את עסקאות העבר של בית העסק כמנוי
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-verdant-line px-4 py-2 text-[13px] font-bold text-verdant-muted hover:bg-gray-50"
          >
            ביטול
          </button>
          <button
            onClick={() => onConfirm(alsoPast)}
            className="rounded-full bg-verdant-accent px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMerchantRows(
  overrides: SubscriptionOverride[],
  catalog: CatalogMerchant[]
): MerchantRow[] {
  const txs = loadParsedTransactions();
  const byKey = new Map<string, { label: string; count: number }>();
  for (const t of txs) {
    if (!t.description || t.amount <= 0) continue; // expenses only
    const key = subscriptionKey(t.description);
    if (!key) continue;
    const cur = byKey.get(key);
    if (cur) cur.count += 1;
    else byKey.set(key, { label: t.description.trim(), count: 1 });
  }
  const rows: MerchantRow[] = [];
  for (const [key, { label, count }] of byKey) {
    const override = overrides.find((o) => o.normalizedKey === key);
    const effective = classifySubscription(label, { overrides, catalog });
    rows.push({
      key,
      label,
      txCount: count,
      effective,
      source: override ? "client" : effective !== null ? "catalog" : "auto",
    });
  }
  rows.sort((a, b) => b.txCount - a.txCount);
  return rows;
}

function effectiveLabel(m: MerchantRow): string {
  if (m.effective === true)
    return m.source === "client" ? "מנוי (סימון שלך)" : "מנוי (ברירת מחדל)";
  if (m.effective === false) return "לא מנוי (סימון שלך)";
  return "לא סומן";
}
