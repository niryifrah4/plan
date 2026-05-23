"use client";

/**
 * AddExpenseSheet — bottom sheet for logging an expense from anywhere.
 *
 * Lives in its own file (extracted from /m/budget/page.tsx) so it can
 * also be opened directly from the home page (`/m`) — the "quick-add"
 * entry point per finance-agent's "one game-changer" recommendation.
 *
 * Three required steps:
 *   1. Amount — entered via on-screen numpad (no keyboard popup)
 *   2. Description — "מה קניתי?" (required for traceability)
 *   3. Category — chip picker, one of the budget categories
 *
 * On save, calls addManualTransaction() which writes to
 * `verdant:parsed_transactions`, dispatches the update event, AND pushes
 * to Supabase blob storage so the desktop sees it on next bootstrap.
 */

import { useState } from "react";
import { buildBudgetLines, type BudgetLine } from "@/lib/budget-store";
import { addManualTransaction } from "@/lib/budget-import";

interface Props {
  /** Categories shown as chips. If not provided, computed via buildBudgetLines(0).
   *  Pass them in when the parent already has them, to avoid double work. */
  categories?: BudgetLine[];
  onClose: () => void;
  onSaved: () => void;
}

export function AddExpenseSheet({ categories: propCategories, onClose, onSaved }: Props) {
  const [categories] = useState<BudgetLine[]>(() => {
    if (propCategories) return propCategories;
    try {
      return buildBudgetLines(0);
    } catch {
      return [];
    }
  });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [catKey, setCatKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericAmount = Number(amount.replace(/[^\d.]/g, "")) || 0;
  const canSubmit =
    numericAmount > 0 && description.trim().length > 0 && catKey.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const cat = categories.find((c) => c.key === catKey);
    if (!cat) return;
    setSaving(true);
    setError(null);
    try {
      addManualTransaction({
        amount: numericAmount,
        category: cat.key,
        categoryLabel: cat.label,
        description: description.trim(),
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message || "שגיאה ברישום ההוצאה");
      setSaving(false);
    }
  };

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
        aria-label="הוספת הוצאה"
        dir="rtl"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--morning-surface)",
          borderTopRightRadius: 24,
          borderTopLeftRadius: 24,
          padding: "16px 20px calc(20px + env(safe-area-inset-bottom))",
          boxShadow: "0 -20px 40px rgba(16, 24, 40, 0.15)",
          maxHeight: "85vh",
          overflowY: "auto",
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
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>הוספת הוצאה</h2>

        <StepLabel index={1} text="סכום (₪)" />
        <NumpadAmount value={amount} onChange={setAmount} />

        <StepLabel index={2} text="מה קניתי?" />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="לדוגמה: שופרסל, דלק, ארוחה במסעדה"
          style={textInputStyle}
        />

        <StepLabel index={3} text="קטגוריה" />
        {categories.length === 0 ? (
          <div style={emptyChipsBoxStyle}>אין קטגוריות מוגדרות עדיין.</div>
        ) : (
          <div
            style={{
              marginTop: 6,
              marginBottom: 14,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {categories.map((c) => {
              const active = c.key === catKey;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCatKey(c.key)}
                  style={{
                    border: "1px solid",
                    borderColor: active ? "var(--morning-forest)" : "var(--morning-border)",
                    background: active
                      ? "var(--morning-leaf-tint)"
                      : "var(--morning-surface)",
                    color: active ? "var(--morning-forest-deep)" : "var(--morning-ink)",
                    padding: "7px 12px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div role="alert" style={errorBoxStyle}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving} style={cancelButtonStyle}>
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            style={{
              ...submitButtonStyle,
              background:
                canSubmit && !saving ? "var(--morning-forest)" : "var(--morning-surface-3)",
              color: canSubmit && !saving ? "#ffffff" : "var(--morning-subtle)",
              cursor: canSubmit && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "שומר..." : "שמירת ההוצאה"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Numpad amount entry — no keyboard popup        */
/* ─────────────────────────────────────────────── */

function NumpadAmount({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const append = (ch: string) => {
    if (ch === "." && value.includes(".")) return;
    if (value.includes(".") && value.split(".")[1]?.length >= 2 && ch !== ".") return;
    if (value === "0" && ch !== ".") {
      onChange(ch);
      return;
    }
    onChange(value + ch);
  };
  const backspace = () => onChange(value.slice(0, -1));
  const displayed = value || "0";

  return (
    <div style={{ marginTop: 6, marginBottom: 14 }}>
      <div
        aria-live="polite"
        style={{
          padding: "16px 18px",
          fontSize: 36,
          fontWeight: 800,
          background: "var(--morning-bg)",
          border: "1px solid var(--morning-border)",
          borderRadius: 12,
          color: value ? "var(--morning-ink)" : "var(--morning-subtle)",
          textAlign: "end",
          fontVariantNumeric: "tabular-nums",
          marginBottom: 10,
          letterSpacing: "-0.02em",
        }}
      >
        ₪ {displayed}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {(["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const).map((d) => (
          <NumpadButton key={d} onClick={() => append(d)} label={d} />
        ))}
        <NumpadButton onClick={() => append(".")} label="." />
        <NumpadButton onClick={() => append("0")} label="0" />
        <NumpadButton onClick={backspace} label="⌫" variant="muted" />
      </div>
    </div>
  );
}

function NumpadButton({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "16px 0",
        fontSize: variant === "muted" ? 20 : 24,
        fontWeight: 700,
        background: "var(--morning-surface)",
        color: variant === "muted" ? "var(--morning-muted)" : "var(--morning-ink)",
        border: "1px solid var(--morning-border)",
        borderRadius: 12,
        cursor: "pointer",
        fontVariantNumeric: "tabular-nums",
        transition: "background 0.1s ease",
        userSelect: "none",
      }}
      onPointerDown={(e) =>
        (e.currentTarget.style.background = "var(--morning-surface-3)")
      }
      onPointerUp={(e) => (e.currentTarget.style.background = "var(--morning-surface)")}
      onPointerLeave={(e) =>
        (e.currentTarget.style.background = "var(--morning-surface)")
      }
    >
      {label}
    </button>
  );
}

function StepLabel({ index, text }: { index: number; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        color: "var(--morning-muted)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "var(--morning-forest)",
          color: "#ffffff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0,
        }}
      >
        {index}
      </span>
      {text}
    </div>
  );
}

const textInputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  marginBottom: 14,
  padding: "12px 14px",
  fontSize: 15,
  border: "1px solid var(--morning-border)",
  borderRadius: 12,
  background: "var(--morning-bg)",
  color: "var(--morning-ink)",
  outline: "none",
};

const emptyChipsBoxStyle: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 14,
  fontSize: 13,
  color: "var(--morning-muted)",
  padding: 12,
  border: "1px dashed var(--morning-border)",
  borderRadius: 10,
  textAlign: "center",
};

const errorBoxStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--morning-coral)",
  background: "var(--morning-coral-soft)",
  padding: "10px 12px",
  borderRadius: 10,
  marginBottom: 12,
};

const cancelButtonStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "14px 18px",
  fontSize: 14,
  fontWeight: 600,
  background: "var(--morning-surface)",
  color: "var(--morning-ink)",
  border: "1px solid var(--morning-border)",
  borderRadius: 12,
  cursor: "pointer",
};

const submitButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "14px 18px",
  fontSize: 15,
  fontWeight: 700,
  border: "none",
  borderRadius: 12,
  transition: "background 0.15s ease",
};
