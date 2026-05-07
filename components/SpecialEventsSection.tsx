"use client";

/**
 * SpecialEventsSection — user-defined one-time cashflow events.
 *
 * Lives on /goals (below the Buckets section). Each event has a label, a
 * year-month, an amount, and a type (income/expense). The cashflow forecast
 * on /budget reads them via loadSpecialEvents() and bakes them into the
 * 12-month projection — so a couple expecting a ₪25,000 bonus in May 2027
 * sees that bump on the chart instead of a generic "June bonus" heuristic.
 */

import { useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import {
  type SpecialEvent,
  type SpecialEventType,
  loadSpecialEvents,
  saveSpecialEvents,
  addSpecialEvent,
  updateSpecialEvent,
  removeSpecialEvent,
  sortSpecialEvents,
  SPECIAL_EVENTS_EVENT,
} from "@/lib/special-events-store";

const HE_MONTHS_SHORT = [
  "ינו׳",
  "פבר׳",
  "מרץ",
  "אפר׳",
  "מאי",
  "יוני",
  "יולי",
  "אוג׳",
  "ספט׳",
  "אוק׳",
  "נוב׳",
  "דצמ׳",
];

function ymLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${HE_MONTHS_SHORT[m - 1]} ${y}`;
}

function nextYm(offsetMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SpecialEventsSection() {
  const [events, setEvents] = useState<SpecialEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load + sync
  useEffect(() => {
    setEvents(loadSpecialEvents());
    const refresh = () => setEvents(loadSpecialEvents());
    window.addEventListener(SPECIAL_EVENTS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SPECIAL_EVENTS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const sorted = useMemo(() => sortSpecialEvents(events), [events]);

  const handleSave = (input: Omit<SpecialEvent, "id">, idForUpdate: string | null) => {
    let next: SpecialEvent[];
    if (idForUpdate) {
      next = updateSpecialEvent(events, idForUpdate, input);
    } else {
      next = addSpecialEvent(events, input);
    }
    setEvents(next);
    saveSpecialEvents(next);
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    const next = removeSpecialEvent(events, id);
    setEvents(next);
    saveSpecialEvents(next);
  };

  const editing = editingId ? events.find((e) => e.id === editingId) : null;

  return (
    <section className="mt-8">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            אירועים מיוחדים בשנה הקרובה
          </div>
          <h3 className="text-base font-extrabold text-verdant-ink">
            בונוס, החזר מס, רכישה גדולה — מה צפוי ומתי
          </h3>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setEditingId(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-all"
            style={{ background: "#1B4332", color: "#fff" }}
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            הוסף אירוע
          </button>
        )}
      </div>

      {/* Empty state */}
      {sorted.length === 0 && !showForm && (
        <div
          className="rounded-xl px-4 py-5 text-center"
          style={{ background: "#F4F7ED", border: "1px dashed #d8e0d0" }}
        >
          <div className="mb-1 text-[13px] font-bold text-verdant-ink">
            אין עדיין אירועים מיוחדים
          </div>
          <div className="text-[11px] text-verdant-muted">
            הוסיפו בונוס שנתי, החזר מס, רכישה גדולה או חתונה — והם ייכנסו אוטומטית לתחזית התזרים.
          </div>
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <EventForm
          initial={editing || undefined}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
          }}
          onSave={(input) => handleSave(input, editingId)}
        />
      )}

      {/* List */}
      {sorted.length > 0 && !showForm && (
        <div className="space-y-1.5">
          {sorted.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-verdant-bg/60"
              style={{ background: "#fff", border: "1px solid #e2e8d8" }}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{
                  color: ev.type === "income" ? "#1B4332" : "#B45309",
                }}
              >
                {ev.icon || (ev.type === "income" ? "trending_up" : "trending_down")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-verdant-ink">{ev.label}</div>
                <div className="text-[11px] text-verdant-muted">{ymLabel(ev.ym)}</div>
              </div>
              <div
                className="text-[14px] font-extrabold tabular-nums"
                style={{ color: ev.type === "income" ? "#1B4332" : "#B45309" }}
              >
                {ev.type === "income" ? "+" : "−"}
                {fmtILS(ev.amount)}
              </div>
              <button
                onClick={() => {
                  setEditingId(ev.id);
                  setShowForm(true);
                }}
                className="rounded-md p-1.5 hover:bg-verdant-bg"
                title="ערוך"
              >
                <span className="material-symbols-outlined text-[16px] text-verdant-muted">
                  edit
                </span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`למחוק את "${ev.label}"?`)) handleDelete(ev.id);
                }}
                className="rounded-md p-1.5 hover:bg-verdant-bg"
                title="מחק"
              >
                <span className="material-symbols-outlined text-[16px] text-verdant-muted">
                  delete
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Inline form ─── */

interface EventFormProps {
  initial?: SpecialEvent;
  onCancel: () => void;
  onSave: (input: Omit<SpecialEvent, "id">) => void;
}

function EventForm({ initial, onCancel, onSave }: EventFormProps) {
  const [label, setLabel] = useState(initial?.label || "");
  const [ym, setYm] = useState(initial?.ym || nextYm(1));
  const [amount, setAmount] = useState(String(initial?.amount || ""));
  const [type, setType] = useState<SpecialEventType>(initial?.type || "income");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError("נדרש שם לאירוע");
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("סכום חייב להיות מספר חיובי");
      return;
    }
    onSave({ label: label.trim(), ym, amount: amt, type });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-4"
      style={{ background: "#F4F7ED", border: "1px solid #d8e0d0" }}
    >
      {/* Type toggle */}
      <div className="mb-3 flex items-center gap-1">
        {(
          [
            { key: "income", label: "הכנסה", icon: "trending_up", color: "#1B4332" },
            { key: "expense", label: "הוצאה", icon: "trending_down", color: "#B45309" },
          ] as const
        ).map((t) => {
          const active = type === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-all"
              style={{
                background: active ? t.color : "#fff",
                color: active ? "#fff" : "#5a7a6a",
                border: `1px solid ${active ? t.color : "#d8e0d0"}`,
              }}
            >
              <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Label */}
        <div className="md:col-span-1">
          <div className="mb-1 text-[10px] font-bold text-verdant-muted">שם האירוע</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={type === "income" ? "בונוס שנתי" : "רכישת רכב"}
            className="w-full rounded-lg border px-3 py-2 text-[12px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
            autoFocus
          />
        </div>

        {/* Month */}
        <div className="md:col-span-1">
          <div className="mb-1 text-[10px] font-bold text-verdant-muted">חודש</div>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-[12px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
            dir="ltr"
          />
        </div>

        {/* Amount */}
        <div className="md:col-span-1">
          <div className="mb-1 text-[10px] font-bold text-verdant-muted">סכום (₪)</div>
          <input
            type="number"
            min="0"
            step="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="25000"
            className="w-full rounded-lg border px-3 py-2 text-[12px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
            dir="ltr"
          />
        </div>
      </div>

      {error && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-[12px] font-bold"
          style={{ background: "#FEE2E2", color: "#991B1B" }}
        >
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-full px-5 py-2 text-[12px] font-bold transition-all"
          style={{ background: "#1B4332", color: "#fff" }}
        >
          {initial ? "עדכן" : "הוסף"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-5 py-2 text-[12px] font-bold text-verdant-muted hover:bg-verdant-bg"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
