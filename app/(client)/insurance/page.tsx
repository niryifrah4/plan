"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SolidKpi, SolidKpiRow } from "@/components/ui/SolidKpi";
import {
  RISK_CATEGORIES,
  loadRiskItems,
  saveRiskItems,
  updateRiskItem,
  addRiskItem,
  deleteRiskItem,
  computeRiskStats,
  getCategoryStats,
  RISK_EVENT,
  type RiskItem,
  type CoverageStatus,
  type RiskCategory,
} from "@/lib/risk-store";

/* ── Status config ── */

const STATUS_CONFIG: Record<
  CoverageStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  covered: { label: "מכוסה", color: "#2B694D", bg: "#ecfdf5", icon: "check_circle" },
  partial: { label: "חלקי", color: "#f59e0b", bg: "#fffbeb", icon: "warning" },
  missing: { label: "חסר", color: "#ef4444", bg: "#fef2f2", icon: "cancel" },
  not_relevant: { label: "לא רלוונטי", color: "#94a3b8", bg: "#f8fafc", icon: "do_not_disturb_on" },
};

const STATUS_ORDER: CoverageStatus[] = ["covered", "partial", "missing", "not_relevant"];

/* ── Formatters ── */

const fmtCurrency = (n: number) => (n ? `₪${n.toLocaleString("he-IL")}` : "—");

/* ── Main Page ── */

export default function RiskManagementPage() {
  const [items, setItems] = useState<RiskItem[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const reload = useCallback(() => setItems(loadRiskItems()), []);

  useEffect(() => {
    reload();
    window.addEventListener(RISK_EVENT, reload);
    return () => window.removeEventListener(RISK_EVENT, reload);
  }, [reload]);

  const stats = useMemo(() => computeRiskStats(items), [items]);

  /* ── Handlers ── */

  const cycleStatus = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const idx = STATUS_ORDER.indexOf(item.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateRiskItem(id, { status: next });
    reload();
  };

  const handleFieldChange = (id: string, field: keyof RiskItem, value: string | number) => {
    updateRiskItem(id, { [field]: value } as Partial<RiskItem>);
    reload();
  };

  const handleAdd = (category: string) => {
    if (!newLabel.trim()) return;
    const maxSort = Math.max(
      0,
      ...items.filter((i) => i.category === category).map((i) => i.sortOrder)
    );
    addRiskItem({
      id: `risk_${Date.now()}`,
      category,
      label: newLabel.trim(),
      status: "missing",
      sortOrder: maxSort + 1,
    });
    setNewLabel("");
    setAddingTo(null);
    reload();
  };

  const handleDelete = (id: string) => {
    deleteRiskItem(id);
    setEditingItem(null);
    reload();
  };

  /* ── Coverage gauge ── */

  const pct = Math.round(stats.coveragePct * 100);

  return (
    <div className="mx-auto max-w-5xl pb-20" dir="rtl">
      <PageHeader
        subtitle="Risk Management · ניהול סיכונים"
        title="ניהול סיכונים"
        description="צ׳קליסט כיסויים, מעקב פוליסות וזיהוי פערים"
      />

      {/* ── Summary KPIs ── */}
      {/* Coverage tile uses SolidKpi with bg override so it matches the
          rest of the rail visually (2026-04-28 — was a custom ring div). */}
      <SolidKpiRow>
        <SolidKpi
          label="אחוז כיסוי"
          value={`${pct}%`}
          icon="verified"
          tone="forest"
          bg={pct >= 80 ? "#012D1D" : pct >= 50 ? "#B45309" : "#8B2E2E"}
          sub={pct >= 80 ? "כיסוי מלא" : pct >= 50 ? "פערים חלקיים" : "פערים מהותיים"}
        />
        <SolidKpi label="מכוסים" value={String(stats.covered)} icon="check_circle" tone="emerald" />
        <SolidKpi
          label="דורשים טיפול"
          value={String(stats.partial + stats.missing)}
          icon="warning"
          tone={stats.partial + stats.missing > 0 ? "amber" : "sage"}
        />
        <SolidKpi
          label="עלות חודשית"
          value={fmtCurrency(stats.totalMonthlyCost)}
          icon="payments"
          tone="ink"
        />
      </SolidKpiRow>

      {/* ── Category Cards ── */}
      <div className="space-y-4">
        {RISK_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.key}
            category={cat}
            items={items.filter((i) => i.category === cat.key)}
            stats={getCategoryStats(items, cat.key)}
            isExpanded={expandedCat === cat.key}
            onToggle={() => setExpandedCat(expandedCat === cat.key ? null : cat.key)}
            editingItem={editingItem}
            onEditItem={setEditingItem}
            onCycleStatus={cycleStatus}
            onFieldChange={handleFieldChange}
            onDelete={handleDelete}
            addingTo={addingTo}
            onAddingTo={setAddingTo}
            newLabel={newLabel}
            onNewLabelChange={setNewLabel}
            onAdd={handleAdd}
          />
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="card-pad mt-8">
        <div className="mb-2 text-xs font-bold" style={{ color: "var(--verdant-muted)" }}>
          מקרא סטטוסים
        </div>
        <div className="flex flex-wrap gap-4">
          {STATUS_ORDER.map((s) => {
            const c = STATUS_CONFIG[s];
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16, color: c.color }}
                >
                  {c.icon}
                </span>
                <span className="text-xs" style={{ color: "var(--verdant-ink)" }}>
                  {c.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Category Card ── */

interface CategoryCardProps {
  category: RiskCategory;
  items: RiskItem[];
  stats: ReturnType<typeof getCategoryStats>;
  isExpanded: boolean;
  onToggle: () => void;
  editingItem: string | null;
  onEditItem: (id: string | null) => void;
  onCycleStatus: (id: string) => void;
  onFieldChange: (id: string, field: keyof RiskItem, value: string | number) => void;
  onDelete: (id: string) => void;
  addingTo: string | null;
  onAddingTo: (cat: string | null) => void;
  newLabel: string;
  onNewLabelChange: (v: string) => void;
  onAdd: (cat: string) => void;
}

function CategoryCard({
  category,
  items,
  stats,
  isExpanded,
  onToggle,
  editingItem,
  onEditItem,
  onCycleStatus,
  onFieldChange,
  onDelete,
  addingTo,
  onAddingTo,
  newLabel,
  onNewLabelChange,
  onAdd,
}: CategoryCardProps) {
  const catPct = Math.round(stats.coveragePct * 100);
  const barColor = catPct >= 80 ? "#2B694D" : catPct >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-right transition-colors hover:bg-gray-50/60"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: barColor }}>
          {category.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold" style={{ color: "var(--verdant-ink)" }}>
            {category.label}
          </div>
          <div className="text-xs" style={{ color: "var(--verdant-muted)" }}>
            {category.description}
          </div>
        </div>

        {/* Mini progress */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {stats.covered > 0 && (
              <span className="text-xs font-bold" style={{ color: "#2B694D" }}>
                {stats.covered}
                <span className="material-symbols-outlined align-middle" style={{ fontSize: 14 }}>
                  check_circle
                </span>
              </span>
            )}
            {stats.missing > 0 && (
              <span className="text-xs font-bold" style={{ color: "#ef4444" }}>
                {stats.missing}
                <span className="material-symbols-outlined align-middle" style={{ fontSize: 14 }}>
                  cancel
                </span>
              </span>
            )}
          </div>
          <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${catPct}%`, background: barColor }}
            />
          </div>
          <span
            className="material-symbols-outlined transition-transform"
            style={{
              fontSize: 20,
              color: "var(--verdant-muted)",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            expand_more
          </span>
        </div>
      </button>

      {/* Expanded items */}
      {isExpanded && (
        <div className="border-t" style={{ borderColor: "var(--verdant-border)" }}>
          {items
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((ri) => {
              const sc = STATUS_CONFIG[ri.status];
              const isEditing = editingItem === ri.id;

              return (
                <div key={ri.id}>
                  <div
                    className="flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-gray-50/40"
                    style={{ borderColor: "var(--verdant-border)" }}
                  >
                    {/* Status button */}
                    <button
                      onClick={() => onCycleStatus(ri.id)}
                      className="shrink-0"
                      title={`לחץ לשינוי — ${sc.label}`}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 22, color: sc.color }}
                      >
                        {sc.icon}
                      </span>
                    </button>

                    {/* Label */}
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-sm font-semibold"
                        style={{ color: "var(--verdant-ink)" }}
                      >
                        {ri.label}
                      </div>
                      {ri.description && (
                        <div className="text-xs" style={{ color: "var(--verdant-muted)" }}>
                          {ri.description}
                        </div>
                      )}
                      {/* Inline info tags */}
                      <div className="mt-1 flex flex-wrap gap-2">
                        {ri.provider && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{ background: "#f1f5f9", color: "#64748b" }}
                          >
                            {ri.provider}
                          </span>
                        )}
                        {ri.coverageAmount ? (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{ background: "#ecfdf5", color: "#2B694D" }}
                          >
                            כיסוי: {fmtCurrency(ri.coverageAmount)}
                          </span>
                        ) : null}
                        {ri.monthlyCost ? (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{ background: "#eff6ff", color: "#3b82f6" }}
                          >
                            {fmtCurrency(ri.monthlyCost)}/חודש
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: sc.bg, color: sc.color }}
                    >
                      {sc.label}
                    </span>

                    {/* Edit toggle */}
                    <button
                      onClick={() => onEditItem(isEditing ? null : ri.id)}
                      className="shrink-0"
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 18, color: "var(--verdant-muted)" }}
                      >
                        {isEditing ? "close" : "edit"}
                      </span>
                    </button>
                  </div>

                  {/* Edit panel */}
                  {isEditing && (
                    <div
                      className="grid grid-cols-2 gap-3 border-b px-6 py-4 md:grid-cols-3"
                      style={{ background: "#fafbfc", borderColor: "var(--verdant-border)" }}
                    >
                      <Field label="ספק / חברה">
                        <input
                          className="v-input text-sm"
                          value={ri.provider || ""}
                          onChange={(e) => onFieldChange(ri.id, "provider", e.target.value)}
                          placeholder="מנורה, הראל..."
                        />
                      </Field>
                      <Field label="סכום כיסוי ₪">
                        <input
                          type="number"
                          className="v-input text-sm"
                          value={ri.coverageAmount || ""}
                          onChange={(e) =>
                            onFieldChange(ri.id, "coverageAmount", Number(e.target.value))
                          }
                        />
                      </Field>
                      <Field label="עלות חודשית ₪">
                        <input
                          type="number"
                          className="v-input text-sm"
                          value={ri.monthlyCost || ""}
                          onChange={(e) =>
                            onFieldChange(ri.id, "monthlyCost", Number(e.target.value))
                          }
                        />
                      </Field>
                      <Field label="מספר פוליסה">
                        <input
                          className="v-input text-sm"
                          value={ri.policyNumber || ""}
                          onChange={(e) => onFieldChange(ri.id, "policyNumber", e.target.value)}
                        />
                      </Field>
                      <Field label="תוקף (YYYY-MM)">
                        <input
                          className="v-input text-sm"
                          value={ri.expiryDate || ""}
                          onChange={(e) => onFieldChange(ri.id, "expiryDate", e.target.value)}
                          placeholder="2026-12"
                        />
                      </Field>
                      <Field label="הערות">
                        <input
                          className="v-input text-sm"
                          value={ri.notes || ""}
                          onChange={(e) => onFieldChange(ri.id, "notes", e.target.value)}
                        />
                      </Field>
                      <div className="col-span-full flex justify-end">
                        <button
                          onClick={() => onDelete(ri.id)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                            delete
                          </span>
                          מחק פריט
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          {/* Add new item */}
          <div className="px-4 py-3">
            {addingTo === category.key ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className="v-input flex-1 text-sm"
                  value={newLabel}
                  onChange={(e) => onNewLabelChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAdd(category.key)}
                  placeholder="שם הפריט החדש..."
                />
                <button
                  onClick={() => onAdd(category.key)}
                  className="btn-botanical !px-3 !py-1.5 text-xs"
                >
                  הוסף
                </button>
                <button
                  onClick={() => {
                    onAddingTo(null);
                    onNewLabelChange("");
                  }}
                  className="text-xs text-gray-400"
                >
                  ביטול
                </button>
              </div>
            ) : (
              <button
                onClick={() => onAddingTo(category.key)}
                className="flex items-center gap-1 text-xs hover:opacity-70"
                style={{ color: "var(--verdant-emerald)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  add_circle
                </span>
                הוסף פריט
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tiny field wrapper ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="mb-0.5 block text-[10px] font-bold"
        style={{ color: "var(--verdant-muted)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
