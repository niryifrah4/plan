"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { CAT_OPTIONS } from "@/lib/documents-categories";
import { groupOptionsByParent } from "@/lib/doc-parser/category-tree";

type MerchantRule = {
  merchantKey: string;
  categoryKey: string;
  count: number;
  sampleDescription?: string;
  updatedAt: string;
};

const PAGE_SIZE = 50;

export default function MappingsSettingsPage() {
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newMerchantKey, setNewMerchantKey] = useState("");
  const [newCategoryKey, setNewCategoryKey] = useState("food");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCategoryKey, setEditCategoryKey] = useState<string>("");

  const { confirm, modal } = useConfirm();

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/merchant-category-rules");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.rules)) {
          setRules(data.rules);
        }
      }
    } catch (err) {
      console.error("Failed to fetch merchant rules", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchantKey.trim()) return;

    try {
      const res = await fetch("/api/merchant-category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote: {
            merchantKey: newMerchantKey.trim(),
            categoryKey: newCategoryKey,
            txCount: 1,
            sampleDescription: newMerchantKey.trim(),
          },
        }),
      });

      if (res.ok) {
        setNewMerchantKey("");
        setIsAdding(false);
        fetchRules();
      } else {
        const errData = await res.json();
        alert("שגיאה בהוספת ספק: " + (errData.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("שגיאה בהוספת ספק: " + err.message);
    }
  };

  const handleUpdate = async (merchantKey: string) => {
    if (!editCategoryKey) {
      setEditingKey(null);
      return;
    }

    try {
      // First delete existing rule for this merchant
      await fetch(`/api/merchant-category-rules?merchantKey=${encodeURIComponent(merchantKey)}`, {
        method: "DELETE",
      });

      // Then add new rule
      const res = await fetch("/api/merchant-category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote: {
            merchantKey: merchantKey,
            categoryKey: editCategoryKey,
            txCount: 10, // Ensure it outweighs past conflicts
            sampleDescription: merchantKey,
          },
        }),
      });

      if (res.ok) {
        setEditingKey(null);
        fetchRules();
      } else {
        alert("שגיאה בעדכון הספק");
      }
    } catch (err: any) {
      alert("שגיאה בעדכון הספק: " + err.message);
    }
  };

  const handleDelete = async (rule: MerchantRule) => {
    const ok = await confirm({
      title: "מחיקת שיוך",
      body: `האם אתה בטוח שברצונך למחוק את השיוך עבור הספק "${rule.merchantKey}"?`,
      variant: "danger",
      confirmLabel: "מחק",
      cancelLabel: "ביטול",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/merchant-category-rules?merchantKey=${encodeURIComponent(rule.merchantKey)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const next = new Set(selectedIds);
        next.delete(rule.merchantKey);
        setSelectedIds(next);
        fetchRules();
      } else {
        alert("שגיאה במחיקת הספק");
      }
    } catch (err: any) {
      alert("שגיאה במחיקת הספק: " + err.message);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: "מחיקת שיוכים מרובים",
      body: `האם אתה בטוח שברצונך למחוק ${selectedIds.size} ספקים שנבחרו?`,
      variant: "danger",
      confirmLabel: "מחק הכל",
      cancelLabel: "ביטול",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/merchant-category-rules?merchantKeys=${encodeURIComponent(JSON.stringify(Array.from(selectedIds)))}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSelectedIds(new Set());
        fetchRules();
      } else {
        alert("שגיאה במחיקת הספקים");
      }
    } catch (err: any) {
      alert("שגיאה במחיקת הספקים: " + err.message);
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter((r) =>
      r.merchantKey.toLowerCase().includes(search.toLowerCase()) || 
      (r.sampleDescription && r.sampleDescription.toLowerCase().includes(search.toLowerCase()))
    );
  }, [rules, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredRules.length / PAGE_SIZE));
  const paginatedRules = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRules.slice(start, start + PAGE_SIZE);
  }, [filteredRules, currentPage]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (paginatedRules.length === 0) return;
    const allCurrentPageSelected = paginatedRules.every((r) => selectedIds.has(r.merchantKey));

    const next = new Set(selectedIds);
    if (allCurrentPageSelected) {
      paginatedRules.forEach((r) => next.delete(r.merchantKey));
    } else {
      paginatedRules.forEach((r) => next.add(r.merchantKey));
    }
    setSelectedIds(next);
  };

  const isAllCurrentPageSelected = paginatedRules.length > 0 && paginatedRules.every(r => selectedIds.has(r.merchantKey));

  const getCategoryLabel = (key: string) => {
    const cat = CAT_OPTIONS.find((c) => c.key === key);
    return cat ? cat.label : key;
  };

  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-6 py-8"
      style={{ background: "var(--verdant-bg)" }}
    >
      {modal}
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-verdant-ink">ניהול ספקים וקטגוריות</h1>
            <p className="text-sm text-verdant-muted mt-1">
              הוספה, עריכה ומחיקה של החוקים שנלמדו לסיווג אוטומטי של בתי עסק לקטגוריות.
            </p>
          </div>
          <Link
            href="/crm/settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-verdant-muted transition-all hover:bg-gray-100 hover:text-verdant-ink"
            style={{ background: "#FAFAF7" }}
            title="חזרה להגדרות"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>

        <section className="card-pad flex flex-col relative">
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-xs">
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-verdant-muted">
                search
              </span>
              <input
                type="text"
                placeholder="חיפוש ספק..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="inp !py-1.5 !pr-10 text-sm w-full"
              />
            </div>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="btn-danger flex items-center gap-1.5 px-4 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  מחק {selectedIds.size} נבחרים
                </button>
              )}

              {!isAdding ? (
                <button
                  onClick={() => setIsAdding(true)}
                  className="btn-botanical flex items-center gap-1.5 px-4 py-1.5 text-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  הוסף שיוך ידני
                </button>
              ) : (
                <form onSubmit={handleAdd} className="flex gap-2 w-full sm:w-auto items-center">
                  <input
                    type="text"
                    placeholder="שם העסק..."
                    value={newMerchantKey}
                    onChange={(e) => setNewMerchantKey(e.target.value)}
                    className="inp !py-1.5 text-sm flex-1 sm:w-48"
                    autoFocus
                  />
                  <select
                    className="inp !py-1.5 text-sm"
                    value={newCategoryKey}
                    onChange={(e) => setNewCategoryKey(e.target.value)}
                  >
                    {groupOptionsByParent(CAT_OPTIONS).map((parentGroup) => (
                      <optgroup key={parentGroup.parent.key} label={parentGroup.parent.label}>
                        {parentGroup.options.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button type="submit" className="btn-botanical px-4 py-1.5 text-sm">
                    שמור
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="rounded-md bg-gray-100 px-4 py-1.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    ביטול
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm flex flex-col">
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {loading ? (
                <div className="p-8 text-center text-sm text-verdant-muted">טוען נתונים...</div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead className="bg-[#FAFAF7] text-verdant-muted sticky top-0 border-b border-gray-100 z-10">
                    <tr>
                      <th className="px-4 py-3 font-bold w-12 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-verdant-accent focus:ring-verdant-accent cursor-pointer"
                          checked={isAllCurrentPageSelected}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="px-4 py-3 font-bold">שם ספק / בית עסק</th>
                      <th className="px-4 py-3 font-bold">קטגוריה משויכת</th>
                      <th className="px-4 py-3 font-bold text-center">מופעים (למידה)</th>
                      <th className="px-4 py-3 font-bold w-24">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 relative">
                    {paginatedRules.map((rule) => {
                      const isEditing = editingKey === rule.merchantKey;
                      return (
                        <tr
                          key={rule.merchantKey}
                          className={`transition-colors ${selectedIds.has(rule.merchantKey) ? 'bg-verdant-accent/5' : 'hover:bg-gray-50/50'}`}
                        >
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-verdant-accent focus:ring-verdant-accent cursor-pointer"
                              checked={selectedIds.has(rule.merchantKey)}
                              onChange={() => toggleSelect(rule.merchantKey)}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-verdant-ink">
                            {rule.merchantKey}
                            {rule.sampleDescription && rule.sampleDescription !== rule.merchantKey && (
                              <div className="text-xs text-gray-400 font-normal mt-0.5">
                                דוגמה: {rule.sampleDescription}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <select
                                  className="inp !py-1 text-xs max-w-[200px]"
                                  value={editCategoryKey}
                                  onChange={(e) => setEditCategoryKey(e.target.value)}
                                >
                                  {groupOptionsByParent(CAT_OPTIONS).map((parentGroup) => (
                                    <optgroup key={parentGroup.parent.key} label={parentGroup.parent.label}>
                                      {parentGroup.options.map((option) => (
                                        <option key={option.key} value={option.key}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                                <button 
                                  onClick={() => handleUpdate(rule.merchantKey)}
                                  className="text-xs bg-verdant-accent text-white px-2 py-1 rounded"
                                >
                                  שמור
                                </button>
                                <button 
                                  onClick={() => setEditingKey(null)}
                                  className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                                >
                                  ביטול
                                </button>
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                                {getCategoryLabel(rule.categoryKey)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">
                            {rule.count}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {!isEditing && (
                                <button
                                  onClick={() => {
                                    setEditingKey(rule.merchantKey);
                                    setEditCategoryKey(rule.categoryKey);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                  title="ערוך קטגוריה"
                                >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(rule)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="מחק שיוך"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {paginatedRules.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-sm text-verdant-muted">
                          לא נמצאו שיוכים
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {!loading && filteredRules.length > 0 && (
              <div className="border-t border-gray-100 bg-[#FAFAF7] px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-verdant-muted">
                  מציג <span className="font-bold text-verdant-ink">{(currentPage - 1) * PAGE_SIZE + 1}</span> עד <span className="font-bold text-verdant-ink">{Math.min(currentPage * PAGE_SIZE, filteredRules.length)}</span> מתוך <span className="font-bold text-verdant-ink">{filteredRules.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                  <span className="text-sm font-medium text-verdant-ink px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
