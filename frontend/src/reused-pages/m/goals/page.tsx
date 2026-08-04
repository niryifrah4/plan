"use client";

/**
 * /m/goals — Mobile goal tracking.
 *
 * Each goal (Bucket) shows its progress + a one-tap "אישור הפקדה" button.
 * The check-in adds the planned monthly contribution to the goal's
 * currentAmount via recordCheckIn() from buckets-core, then saves via
 * the same buckets-store the desktop /goals page reads.
 *
 * If the user deposited a different amount than planned, they tap the
 * pencil to open a small sheet where they can override before confirming.
 */

import { useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { loadBuckets, saveBuckets } from "@/lib/buckets-store";
import { recordCheckIn, type Bucket } from "@/lib/_shared/buckets-core";

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isCheckedInThisMonth(bucket: Bucket): boolean {
  const m = currentMonthKey();
  return bucket.contributionHistory.some((c) => c.month === m);
}

function checkInOfThisMonth(bucket: Bucket) {
  const m = currentMonthKey();
  return bucket.contributionHistory.find((c) => c.month === m);
}

interface CelebrationToast {
  name: string;
  amount: number;
  pct: number;
}

export default function MobileGoalsPage() {
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);
  const [editing, setEditing] = useState<Bucket | null>(null);
  const [toast, setToast] = useState<CelebrationToast | null>(null);

  const refresh = () => {
    try {
      setBuckets(loadBuckets());
    } catch {
      setBuckets([]);
    }
  };

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("verdant:goals:updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("verdant:goals:updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const sorted = useMemo(() => {
    if (!buckets) return null;
    return [...buckets]
      .filter((b) => !b.archived && b.targetAmount > 0)
      .sort((a, b) => {
        const ra = PRIORITY_RANK[a.priority] ?? 1;
        const rb = PRIORITY_RANK[b.priority] ?? 1;
        if (ra !== rb) return ra - rb;
        return a.targetDate.localeCompare(b.targetDate);
      });
  }, [buckets]);

  const monthlyStats = useMemo(() => {
    if (!sorted) return { done: 0, total: 0 };
    const total = sorted.filter((b) => b.monthlyContribution > 0).length;
    const done = sorted.filter(
      (b) => b.monthlyContribution > 0 && isCheckedInThisMonth(b)
    ).length;
    return { done, total };
  }, [sorted]);

  const handleConfirm = (bucket: Bucket, actual: number, note?: string) => {
    if (!buckets) return;
    const updated = recordCheckIn(bucket, currentMonthKey(), actual, note);
    const next = buckets.map((b) => (b.id === bucket.id ? updated : b));
    saveBuckets(next);
    setBuckets(next);

    // ui-agent #4: emotional reinforcement — close the deposit→growth loop.
    const pct =
      updated.targetAmount > 0
        ? Math.round((updated.currentAmount / updated.targetAmount) * 100)
        : 0;
    setToast({ name: updated.name, amount: actual, pct });
  };

  // Auto-dismiss the celebration toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <main style={{ padding: "16px 14px 32px", color: "var(--morning-ink)" }} dir="rtl">
      {/* Header */}
      <h1
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          margin: 0,
        }}
      >
        יעדים{" "}
        {sorted && (
          <span style={{ color: "var(--morning-muted)", fontWeight: 500 }}>
            — {monthlyStats.done}/{monthlyStats.total} הפקדות החודש
          </span>
        )}
      </h1>

      {/* Goal list */}
      <section style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {!sorted ? (
          <>
            <SkeletonGoal />
            <SkeletonGoal />
          </>
        ) : sorted.length === 0 ? (
          <EmptyState />
        ) : (
          sorted.map((b) => (
            <GoalRow
              key={b.id}
              bucket={b}
              onQuickConfirm={() => handleConfirm(b, b.monthlyContribution)}
              onEditAmount={() => setEditing(b)}
            />
          ))
        )}
      </section>

      {editing && (
        <CheckInSheet
          bucket={editing}
          onClose={() => setEditing(null)}
          onSubmit={(actual, note) => {
            handleConfirm(editing, actual, note);
            setEditing(null);
          }}
        />
      )}

      {toast && <CelebrationToastView toast={toast} />}
    </main>
  );
}

/* ─────────────────────────────────────────────── */
/* Celebration toast — fires after a successful   */
/* check-in. Closes the "deposit → growth" loop   */
/* with a 2.8-second emotional win.                */
/* ─────────────────────────────────────────────── */

function CelebrationToastView({ toast }: { toast: CelebrationToast }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "calc(96px + env(safe-area-inset-bottom))",
        insetInline: 16,
        zIndex: 90,
        margin: "0 auto",
        maxWidth: 448,
        padding: "12px 16px",
        background: "var(--morning-forest)",
        color: "#ffffff",
        borderRadius: 14,
        boxShadow: "var(--morning-shadow-fab)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "morning-toast-rise 0.25s ease-out",
      }}
      dir="rtl"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
        celebration
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {toast.name}
        </div>
        <div
          style={{
            fontSize: 12,
            opacity: 0.92,
            marginTop: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          נוספו {fmtILS(toast.amount)} · כבר {toast.pct}% מהיעד
        </div>
      </div>
      <style>{`@keyframes morning-toast-rise {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }`}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Goal Row                                        */
/* ─────────────────────────────────────────────── */

function GoalRow({
  bucket,
  onQuickConfirm,
  onEditAmount,
}: {
  bucket: Bucket;
  onQuickConfirm: () => void;
  onEditAmount: () => void;
}) {
  const pct = bucket.targetAmount > 0 ? (bucket.currentAmount / bucket.targetAmount) * 100 : 0;
  const checkIn = checkInOfThisMonth(bucket);
  const done = !!checkIn;
  const hasPlanned = bucket.monthlyContribution > 0;
  const barColor = bucket.color || "var(--morning-forest)";

  return (
    <article
      style={{
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 14,
        padding: 14,
        boxShadow: "var(--morning-shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Row 1 — name + progress numbers */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: barColor,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={bucket.name}
          >
            {bucket.name}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--morning-muted)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {fmtILS(bucket.currentAmount)} / {fmtILS(bucket.targetAmount)}
        </div>
      </div>

      {/* Row 2 — progress bar + % */}
      <div>
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: "var(--morning-surface-3)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              height: "100%",
              background: barColor,
              borderRadius: 999,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "var(--morning-muted)",
            fontVariantNumeric: "tabular-nums",
            textAlign: "end",
          }}
        >
          {Math.round(pct)}%
        </div>
      </div>

      {/* Row 3 — action area */}
      {!hasPlanned ? (
        <div style={{ fontSize: 12, color: "var(--morning-subtle)", fontStyle: "italic" }}>
          לא הוגדרה הפקדה חודשית. לקבוע בדשבורד.
        </div>
      ) : done ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            background: "var(--morning-leaf-tint)",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--morning-forest-deep)",
            fontWeight: 600,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              check_circle
            </span>
            בוצע · {fmtILS(checkIn!.actual)}
          </span>
          <span style={{ fontSize: 11, color: "var(--morning-muted)", fontWeight: 500 }}>
            {formatCheckInDate(checkIn!.confirmedAt)}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onQuickConfirm}
            style={{
              flex: 1,
              padding: "12px 14px",
              fontSize: 14,
              fontWeight: 700,
              background: "var(--morning-forest)",
              color: "#ffffff",
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              check
            </span>
            אישור הפקדה · {fmtILS(bucket.monthlyContribution)}
          </button>
          <button
            type="button"
            onClick={onEditAmount}
            aria-label="אישור בסכום אחר"
            title="אישור בסכום אחר"
            style={{
              flex: "0 0 auto",
              width: 44,
              height: 44,
              padding: 0,
              background: "var(--morning-surface)",
              color: "var(--morning-ink)",
              border: "1px solid var(--morning-border)",
              borderRadius: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              edit
            </span>
          </button>
        </div>
      )}
    </article>
  );
}

function SkeletonGoal() {
  return (
    <div
      aria-hidden
      style={{
        background: "var(--morning-surface-2)",
        border: "1px solid var(--morning-border)",
        borderRadius: 14,
        height: 130,
      }}
    />
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "32px 20px",
        textAlign: "center",
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 16,
        boxShadow: "var(--morning-shadow-card)",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          background: "var(--morning-violet-soft)",
          color: "var(--morning-violet)",
          margin: "0 auto 14px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 36 }}>
          flag
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
        עוד לא הגדרת יעדים
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--morning-muted)",
          lineHeight: 1.5,
          maxWidth: 280,
          margin: "0 auto",
        }}
      >
        פתח/י את עמוד היעדים בדשבורד כדי לקבוע יעדי חיסכון —
        קופת חירום, חופשה, החלפת רכב, או טיול לילדים.
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Check-in Sheet — override amount                */
/* ─────────────────────────────────────────────── */

function CheckInSheet({
  bucket,
  onClose,
  onSubmit,
}: {
  bucket: Bucket;
  onClose: () => void;
  onSubmit: (actual: number, note?: string) => void;
}) {
  const [amount, setAmount] = useState(String(bucket.monthlyContribution || ""));
  const [note, setNote] = useState("");

  const numericAmount = Number(amount.replace(/[^\d.]/g, "")) || 0;
  const canSubmit = numericAmount > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16, 24, 40, 0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="אישור הפקדה"
        dir="rtl"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--morning-surface)",
          borderTopRightRadius: 24,
          borderTopLeftRadius: 24,
          padding: "16px 20px calc(20px + env(safe-area-inset-bottom))",
          boxShadow: "0 -20px 40px rgba(16, 24, 40, 0.15)",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "var(--morning-border-strong)",
            margin: "0 auto 14px",
          }}
        />

        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
          {bucket.name}
        </h2>
        <div style={{ fontSize: 13, color: "var(--morning-muted)", marginBottom: 16 }}>
          מתוכננת השנה: {fmtILS(bucket.monthlyContribution)}
        </div>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--morning-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            כמה הפקדת בפועל (₪)
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: "14px 16px",
              fontSize: 28,
              fontWeight: 800,
              border: "1px solid var(--morning-border)",
              borderRadius: 12,
              background: "var(--morning-bg)",
              color: "var(--morning-ink)",
              outline: "none",
              fontVariantNumeric: "tabular-nums",
              textAlign: "end",
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--morning-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            הערה (לא חובה)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="לדוגמה: העברה לבנק"
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: "10px 14px",
              fontSize: 14,
              border: "1px solid var(--morning-border)",
              borderRadius: 10,
              background: "var(--morning-bg)",
              color: "var(--morning-ink)",
              outline: "none",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: "0 0 auto",
              padding: "14px 18px",
              fontSize: 14,
              fontWeight: 600,
              background: "var(--morning-surface)",
              color: "var(--morning-ink)",
              border: "1px solid var(--morning-border)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => onSubmit(numericAmount, note.trim() || undefined)}
            disabled={!canSubmit}
            style={{
              flex: 1,
              padding: "14px 18px",
              fontSize: 15,
              fontWeight: 700,
              background: canSubmit ? "var(--morning-forest)" : "var(--morning-surface-3)",
              color: canSubmit ? "#ffffff" : "var(--morning-subtle)",
              border: "none",
              borderRadius: 12,
              cursor: canSubmit ? "pointer" : "not-allowed",
              transition: "background 0.15s ease",
            }}
          >
            אישור הפקדה
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCheckInDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
  } catch {
    return "";
  }
}
