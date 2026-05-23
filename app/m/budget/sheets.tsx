"use client";

/**
 * /m/budget — bottom sheets for category + transaction management.
 *
 * Two sheets in one file, kept colocated because they share styling
 * primitives and frequently open one from inside the other:
 *
 *   - CategoryDetailSheet: tap a tile → see this month's transactions,
 *     move/delete each, and open the category editor.
 *
 *   - EditCategorySheet: edit name / planned amount / color, or delete
 *     the category entirely. Variable categories only — fixed live on
 *     the desktop where the "big plan" is set.
 */

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import {
  loadParsedTransactions,
  deleteTransactionAt,
  updateTransactionCategoryAt,
} from "@/lib/budget-import";
import {
  loadBudgets,
  saveBudgets,
  type BudgetCategory,
  type BudgetLine,
} from "@/lib/budget-store";
import type { ParsedTransaction } from "@/lib/doc-parser/types";

/* ─────────────────────────────────────────────── */
/* Shared shell                                    */
/* ─────────────────────────────────────────────── */

function SheetShell({
  ariaLabel,
  onClose,
  children,
}: {
  ariaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16, 24, 40, 0.45)",
        zIndex: 110,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
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
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Category Detail Sheet                           */
/*   - Lists this month's transactions for one     */
/*     category. Each row tappable → move/delete.  */
/* ─────────────────────────────────────────────── */

interface CategoryDetailProps {
  line: BudgetLine;
  allCategories: BudgetLine[];
  /** True if this category is treated as fixed (no editor). */
  isFixed: boolean;
  onClose: () => void;
  onEditCategory: () => void;
  onTransactionsChanged: () => void;
}

interface TxRow {
  tx: ParsedTransaction;
  storageIndex: number;
}

function loadCategoryTransactions(categoryKey: string): TxRow[] {
  const all = loadParsedTransactions();
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const rows: TxRow[] = [];
  all.forEach((tx, storageIndex) => {
    if (tx.category !== categoryKey) return;
    if (!tx.date || tx.amount <= 0) return;
    const d = new Date(tx.date);
    if (d.getMonth() !== month || d.getFullYear() !== year) return;
    rows.push({ tx, storageIndex });
  });
  // newest first
  return rows.sort((a, b) => b.tx.date.localeCompare(a.tx.date));
}

export function CategoryDetailSheet({
  line,
  allCategories,
  isFixed,
  onClose,
  onEditCategory,
  onTransactionsChanged,
}: CategoryDetailProps) {
  const [rows, setRows] = useState<TxRow[]>(() => loadCategoryTransactions(line.key));
  const [activeTx, setActiveTx] = useState<TxRow | null>(null);

  const refresh = () => {
    setRows(loadCategoryTransactions(line.key));
    onTransactionsChanged();
  };

  const pct = line.budget > 0 ? Math.round((line.actual / line.budget) * 100) : 0;
  const tone =
    line.status === "over"
      ? "var(--morning-coral)"
      : line.status === "warning"
      ? "var(--morning-warning)"
      : "var(--morning-forest)";

  return (
    <SheetShell ariaLabel={`קטגוריה: ${line.label}`} onClose={onClose}>
      {/* Header — category summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: line.color || "var(--morning-forest)",
            }}
          />
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{line.label}</h2>
        </div>
        {!isFixed && (
          <button
            type="button"
            onClick={onEditCategory}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--morning-forest)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            ערוך קטגוריה
          </button>
        )}
      </div>
      <div
        style={{
          marginBottom: 14,
          fontSize: 13,
          color: "var(--morning-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        בוצע{" "}
        <span style={{ fontWeight: 700, color: tone }}>{fmtILS(line.actual)}</span>{" "}
        מתוך {fmtILS(line.budget)} ({pct}%)
      </div>

      {/* Transactions list */}
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--morning-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        הוצאות החודש ({rows.length})
      </h3>

      {rows.length === 0 ? (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            fontSize: 13,
            color: "var(--morning-muted)",
            background: "var(--morning-bg)",
            border: "1px dashed var(--morning-border-strong)",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          אין הוצאות בקטגוריה זו החודש.
        </div>
      ) : (
        <div
          style={{
            background: "var(--morning-bg)",
            border: "1px solid var(--morning-border)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {rows.map((row, i) => (
            <button
              key={`${row.storageIndex}-${row.tx.date}`}
              type="button"
              onClick={() => setActiveTx(row)}
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "transparent",
                border: "none",
                borderBottom:
                  i < rows.length - 1 ? "1px solid var(--morning-border)" : "none",
                cursor: "pointer",
                textAlign: "start",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                color: "var(--morning-ink)",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.tx.description || row.tx.categoryLabel}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--morning-muted)",
                    marginTop: 2,
                  }}
                >
                  {formatTxDate(row.tx.date)}
                  {row.tx.sourceFile && row.tx.sourceFile !== "mobile" && (
                    <span style={{ marginInlineStart: 6, opacity: 0.7 }}>
                      · מהבנק
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {fmtILS(row.tx.amount)}
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        style={{
          width: "100%",
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
        סגירה
      </button>

      {activeTx && (
        <TransactionActionSheet
          row={activeTx}
          allCategories={allCategories}
          onClose={() => setActiveTx(null)}
          onDelete={() => {
            deleteTransactionAt(activeTx.storageIndex);
            setActiveTx(null);
            refresh();
          }}
          onMove={(newKey, newLabel) => {
            updateTransactionCategoryAt(activeTx.storageIndex, newKey, newLabel);
            setActiveTx(null);
            refresh();
          }}
        />
      )}
    </SheetShell>
  );
}

/* ─────────────────────────────────────────────── */
/* Transaction Action Sheet                        */
/*   Inner sheet — move category / delete one tx.  */
/* ─────────────────────────────────────────────── */

function TransactionActionSheet({
  row,
  allCategories,
  onClose,
  onDelete,
  onMove,
}: {
  row: TxRow;
  allCategories: BudgetLine[];
  onClose: () => void;
  onDelete: () => void;
  onMove: (newKey: string, newLabel: string) => void;
}) {
  const [mode, setMode] = useState<"menu" | "move" | "confirmDelete">("menu");

  return (
    <SheetShell ariaLabel="פעולות על הוצאה" onClose={onClose}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
        {row.tx.description || row.tx.categoryLabel}
      </h2>
      <div
        style={{
          fontSize: 13,
          color: "var(--morning-muted)",
          marginBottom: 14,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtILS(row.tx.amount)} · {formatTxDate(row.tx.date)} · {row.tx.categoryLabel}
      </div>

      {mode === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("move")}
            style={menuButtonStyle("default")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              swap_horiz
            </span>
            שינוי קטגוריה
          </button>
          <button
            type="button"
            onClick={() => setMode("confirmDelete")}
            style={menuButtonStyle("danger")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              delete
            </span>
            מחיקת ההוצאה
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ ...menuButtonStyle("ghost"), marginTop: 4 }}
          >
            ביטול
          </button>
        </div>
      )}

      {mode === "move" && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--morning-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            לאיזו קטגוריה להעביר?
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {allCategories
              .filter((c) => c.key !== row.tx.category)
              .map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onMove(c.key, c.label)}
                  style={{
                    border: "1px solid var(--morning-border)",
                    background: "var(--morning-surface)",
                    color: "var(--morning-ink)",
                    padding: "8px 13px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {c.label}
                </button>
              ))}
          </div>
          <button
            type="button"
            onClick={() => setMode("menu")}
            style={menuButtonStyle("ghost")}
          >
            חזרה
          </button>
        </div>
      )}

      {mode === "confirmDelete" && (
        <div>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: "var(--morning-coral-soft)",
              color: "var(--morning-coral)",
              fontSize: 14,
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            למחוק את ההוצאה {fmtILS(row.tx.amount)} מ-{row.tx.categoryLabel}? לא ניתן
            לבטל.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setMode("menu")}
              style={{ ...menuButtonStyle("ghost"), flex: "0 0 auto" }}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{
                ...menuButtonStyle("danger"),
                flex: 1,
                background: "var(--morning-coral)",
                color: "#ffffff",
                borderColor: "var(--morning-coral)",
              }}
            >
              מחק
            </button>
          </div>
        </div>
      )}
    </SheetShell>
  );
}

/* ─────────────────────────────────────────────── */
/* Edit Category Sheet                             */
/*   - Create new variable category, or edit/delete*/
/*     an existing one.                            */
/* ─────────────────────────────────────────────── */

const COLOR_PRESETS = [
  "#2C7A5A", // forest (brand)
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
];

interface EditCategoryProps {
  /** undefined = create mode; defined = edit mode. */
  line?: BudgetLine;
  onClose: () => void;
  onSaved: () => void;
}

function genKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  const suffix = Math.random().toString(36).slice(2, 6);
  return slug ? `${slug}_${suffix}` : `cat_${suffix}`;
}

export function EditCategorySheet({ line, onClose, onSaved }: EditCategoryProps) {
  const isEdit = !!line;
  const [name, setName] = useState(line?.label ?? "");
  const [amount, setAmount] = useState(String(line?.budget ?? ""));
  const [color, setColor] = useState(line?.color || COLOR_PRESETS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const numericAmount = Number(amount.replace(/[^\d.]/g, "")) || 0;
  const canSave = name.trim().length > 0 && numericAmount > 0;

  const handleSave = () => {
    if (!canSave) return;
    const all = loadBudgets();
    if (isEdit && line) {
      const next: BudgetCategory[] = all.map((c) =>
        c.key === line.key
          ? { ...c, label: name.trim(), budget: numericAmount, color }
          : c
      );
      saveBudgets(next);
    } else {
      const newCategory: BudgetCategory = {
        key: genKey(name),
        label: name.trim(),
        budget: numericAmount,
        color,
      };
      saveBudgets([...all, newCategory]);
    }
    onSaved();
  };

  const handleDelete = () => {
    if (!isEdit || !line) return;
    const all = loadBudgets();
    saveBudgets(all.filter((c) => c.key !== line.key));
    onSaved();
  };

  return (
    <SheetShell ariaLabel={isEdit ? "עריכת קטגוריה" : "קטגוריה חדשה"} onClose={onClose}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>
        {isEdit ? "עריכת קטגוריה" : "קטגוריה חדשה"}
      </h2>

      <label style={{ display: "block", marginBottom: 14 }}>
        <span style={fieldLabelStyle}>שם</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="לדוגמה: ספורט וכושר"
          autoFocus={!isEdit}
          style={textInputStyle}
        />
      </label>

      <label style={{ display: "block", marginBottom: 14 }}>
        <span style={fieldLabelStyle}>תקציב חודשי (₪)</span>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          style={amountInputStyle}
        />
      </label>

      <div style={{ marginBottom: 16 }}>
        <span style={fieldLabelStyle}>צבע</span>
        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {COLOR_PRESETS.map((c) => {
            const active = c === color;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`צבע ${c}`}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: c,
                  border: active ? `3px solid var(--morning-ink)` : "2px solid #ffffff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      </div>

      {confirmDelete && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "var(--morning-coral-soft)",
            color: "var(--morning-coral)",
            fontSize: 13,
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          למחוק את הקטגוריה {line?.label}? התקציב המתוכנן יוסר. הוצאות עבר ישארו
          בהיסטוריה.
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        {isEdit && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{
              flex: "0 0 auto",
              padding: "14px 16px",
              fontSize: 13,
              fontWeight: 700,
              background: "transparent",
              color: "var(--morning-coral)",
              border: "1px solid var(--morning-coral)",
              borderRadius: 12,
              cursor: "pointer",
            }}
            aria-label="מחק קטגוריה"
          >
            מחק
          </button>
        )}
        {isEdit && confirmDelete && (
          <button
            type="button"
            onClick={handleDelete}
            style={{
              flex: 1,
              padding: "14px 18px",
              fontSize: 14,
              fontWeight: 700,
              background: "var(--morning-coral)",
              color: "#ffffff",
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            כן, למחוק
          </button>
        )}
        {!confirmDelete && (
          <>
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
              onClick={handleSave}
              disabled={!canSave}
              style={{
                flex: 1,
                padding: "14px 18px",
                fontSize: 15,
                fontWeight: 700,
                background: canSave
                  ? "var(--morning-forest)"
                  : "var(--morning-surface-3)",
                color: canSave ? "#ffffff" : "var(--morning-subtle)",
                border: "none",
                borderRadius: 12,
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              שמירה
            </button>
          </>
        )}
      </div>
    </SheetShell>
  );
}

/* ─────────────────────────────────────────────── */
/* Style primitives                                */
/* ─────────────────────────────────────────────── */

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--morning-muted)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const textInputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "12px 14px",
  fontSize: 15,
  border: "1px solid var(--morning-border)",
  borderRadius: 12,
  background: "var(--morning-bg)",
  color: "var(--morning-ink)",
  outline: "none",
};

const amountInputStyle: React.CSSProperties = {
  ...textInputStyle,
  fontSize: 24,
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
  textAlign: "end",
};

function menuButtonStyle(
  variant: "default" | "danger" | "ghost"
): React.CSSProperties {
  if (variant === "ghost") {
    return {
      width: "100%",
      padding: "12px 14px",
      background: "transparent",
      color: "var(--morning-muted)",
      border: "none",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
    };
  }
  if (variant === "danger") {
    return {
      width: "100%",
      padding: "14px 16px",
      background: "var(--morning-surface)",
      color: "var(--morning-coral)",
      border: "1px solid var(--morning-coral-soft)",
      borderRadius: 12,
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    };
  }
  return {
    width: "100%",
    padding: "14px 16px",
    background: "var(--morning-surface)",
    color: "var(--morning-ink)",
    border: "1px solid var(--morning-border)",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}

function formatTxDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
  } catch {
    return iso;
  }
}
