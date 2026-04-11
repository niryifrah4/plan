"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BudgetVsActual } from "@/components/cashflow/BudgetVsActual";
import { fmtILS } from "@/lib/format";
import type { ParsedTransaction } from "@/lib/doc-parser/types";
import type { Bucket } from "@/lib/doc-parser/buckets";
import {
  SUB_CATEGORIES_BY_BUCKET,
  assignSubCategory,
  learnSubRule,
  type SubCategory,
} from "@/lib/doc-parser/sub-categories";
import type { FinancialInstrument } from "@/lib/doc-parser/instruments";

/* ─── Storage ─── */
const STORAGE_KEY = "verdant:parsed_transactions";

/* ─── Bucket config ─── */
const BUCKET_META: Record<Bucket, { label: string; icon: string; color: string; bgLight: string }> = {
  fixed:        { label: "הוצאות קבועות",  icon: "lock",            color: "#0a7a4a", bgLight: "#eef7f1" },
  variable:     { label: "הוצאות משתנות",  icon: "shuffle",         color: "#f59e0b", bgLight: "#fffbeb" },
  installments: { label: "תשלומים",        icon: "credit_score",    color: "#3b82f6", bgLight: "#eff6ff" },
  loans:        { label: "הלוואות",        icon: "account_balance", color: "#b91c1c", bgLight: "#fef2f2" },
  unmapped:     { label: "לא מופו",        icon: "help_outline",    color: "#94a3b8", bgLight: "#f8fafc" },
};
const BUCKET_ORDER: Bucket[] = ["fixed", "variable", "installments", "loans"];

const CAT_TO_BUCKET: Record<string, Bucket> = {
  housing: "fixed", utilities: "fixed", insurance: "fixed", education: "fixed",
  subscriptions: "fixed", pension: "fixed", fees: "fixed",
  food: "variable", transport: "variable", health: "variable", leisure: "variable",
  shopping: "variable", cash: "variable", refunds: "variable", dining_out: "variable",
  transfers: "unmapped", other: "unmapped", salary: "variable",
};
const INSTALLMENT_RX = [/תשלום\s*\d+\s*מתוך\s*\d+/i, /\d+\/\d+\s*תשלומים/i, /תש(לום|\.)\s*\d/i, /installment/i, /תשלומים/i];
const LOAN_RX = [/הלוואה/i, /החזר\s*הלוואה/i, /loan/i, /משכנתא/i];

/* ─── Full category + sub-category options for unmapped dropdown ─── */
const ALL_SUB_OPTIONS: { key: string; subKey: string; label: string; bucket: Bucket }[] = [];
for (const bucket of BUCKET_ORDER) {
  const subs = SUB_CATEGORIES_BY_BUCKET[bucket] || [];
  for (const sc of subs) {
    ALL_SUB_OPTIONS.push({
      key: sc.categoryKeys[0] || sc.key,
      subKey: sc.key,
      label: `${BUCKET_META[bucket].label} → ${sc.label}`,
      bucket,
    });
  }
}

const CAT_COLORS: Record<string, string> = {
  food: "#10b981", housing: "#0a7a4a", transport: "#3b82f6", utilities: "#f59e0b",
  health: "#ef4444", education: "#8b5cf6", insurance: "#06b6d4", leisure: "#ec4899",
  shopping: "#f97316", salary: "#10b981", pension: "#1a6b42", transfers: "#64748b",
  cash: "#78716c", subscriptions: "#a855f7", refunds: "#059669", other: "#94a3b8",
  fees: "#dc2626", dining_out: "#e11d48",
};

const HE_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

type TxWithIdx = ParsedTransaction & { _idx: number };

function assignBucket(categoryKey: string, description: string): Bucket {
  const lower = description.toLowerCase().replace(/[\u200F\u200E"]/g, "");
  if (LOAN_RX.some(rx => rx.test(lower))) return "loans";
  if (INSTALLMENT_RX.some(rx => rx.test(lower))) return "installments";
  return CAT_TO_BUCKET[categoryKey] || "unmapped";
}

function gapColor(gap: number): string {
  if (gap > 1000) return "#10b981";
  if (gap >= 0) return "#f59e0b";
  return "#ef4444";
}

/* ═══════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════ */
export default function CashflowMapPage() {
  const [allTx, setAllTx] = useState<ParsedTransaction[]>([]);
  const [overrides, setOverrides] = useState<Record<number, { key: string; label: string }>>({});
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [expandedBucket, setExpandedBucket] = useState<Bucket | null>(null);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [instruments, setInstruments] = useState<FinancialInstrument[]>([]);

  /* ── Load ── */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      setAllTx(stored);
      const savedOv = localStorage.getItem("verdant:cf_overrides");
      if (savedOv) setOverrides(JSON.parse(savedOv));
      const savedDel = localStorage.getItem("verdant:cf_deleted");
      if (savedDel) setDeletedIndices(new Set(JSON.parse(savedDel)));
    } catch { /* empty */ }
    // Load financial instruments
    import("@/lib/doc-parser/instruments").then(({ loadInstruments }) => {
      setInstruments(loadInstruments());
    });
  }, []);

  /* ── Persist ── */
  useEffect(() => {
    if (allTx.length === 0) return;
    try {
      if (Object.keys(overrides).length > 0) localStorage.setItem("verdant:cf_overrides", JSON.stringify(overrides));
      if (deletedIndices.size > 0) localStorage.setItem("verdant:cf_deleted", JSON.stringify([...deletedIndices]));
    } catch { /* empty */ }
  }, [overrides, deletedIndices, allTx]);

  /* ── Effective transactions ── */
  const effectiveTx = useMemo((): TxWithIdx[] => {
    return allTx.map((t, i) => {
      if (deletedIndices.has(i)) return null;
      const ov = overrides[i];
      if (ov) {
        const isRefund = ov.key === "refunds";
        // Refund fix: ensure refunds become negative (income-like).
        // If amount > 0 (was parsed as expense), negate it.
        // If amount is already ≤ 0 (credit column), keep it as-is.
        const amt = isRefund && t.amount > 0 ? -t.amount : t.amount;
        return { ...t, category: ov.key, categoryLabel: ov.label, amount: amt, _idx: i };
      }
      // Auto-detect: if category is "refunds" from the parser itself, ensure amount is negative
      if (t.category === "refunds" && t.amount > 0) {
        return { ...t, amount: -t.amount, _idx: i };
      }
      return { ...t, _idx: i };
    }).filter(Boolean) as TxWithIdx[];
  }, [allTx, overrides, deletedIndices]);

  /* ── Monthly data (last 3) ── */
  const monthlyData = useMemo(() => {
    if (!effectiveTx.length) return [];
    const months: Record<string, { income: number; expense: number }> = {};
    effectiveTx.forEach(t => {
      const m = t.date?.substring(0, 7);
      if (!m) return;
      if (!months[m]) months[m] = { income: 0, expense: 0 };
      if (t.amount > 0) months[m].expense += t.amount;
      else months[m].income += Math.abs(t.amount);
    });
    return Object.entries(months)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 3)
      .reverse()
      .map(([m, d]) => {
        const [, mo] = m.split("-");
        return { month: m, label: HE_MONTHS[parseInt(mo) - 1] || m, income: d.income, expense: d.expense, gap: d.income - d.expense };
      });
  }, [effectiveTx]);

  /* ── Average ── */
  const avg = useMemo(() => {
    if (!monthlyData.length) return null;
    const n = monthlyData.length;
    const avgInc = monthlyData.reduce((s, d) => s + d.income, 0) / n;
    const avgExp = monthlyData.reduce((s, d) => s + d.expense, 0) / n;
    return { income: avgInc, expense: avgExp, gap: avgInc - avgExp, n };
  }, [monthlyData]);

  /* ── Bucket → Sub-category → Transactions (nested groups) ── */
  const nestedGroups = useMemo(() => {
    type SubGroup = { sub: SubCategory; items: TxWithIdx[]; total: number };
    type BucketGroup = { bucket: Bucket; subs: SubGroup[]; ungrouped: TxWithIdx[]; total: number };

    const result: Record<Bucket, BucketGroup> = {} as any;
    for (const b of [...BUCKET_ORDER, "unmapped" as Bucket]) {
      result[b] = { bucket: b, subs: [], ungrouped: [], total: 0 };
    }

    // Assign each expense tx to bucket, then sub-category
    const subAccum: Record<string, { sub: SubCategory; items: TxWithIdx[] }> = {};

    effectiveTx.forEach(t => {
      if (t.amount <= 0) return;
      const bucket = assignBucket(t.category, t.description);
      result[bucket].total += t.amount;

      const sc = assignSubCategory(t.category, t.description, bucket);
      if (sc) {
        const k = `${bucket}::${sc.key}`;
        if (!subAccum[k]) subAccum[k] = { sub: sc, items: [] };
        subAccum[k].items.push(t);
      } else {
        result[bucket].ungrouped.push(t);
      }
    });

    // Attach sub-groups and sort
    for (const [k, { sub, items }] of Object.entries(subAccum)) {
      const bucket = k.split("::")[0] as Bucket;
      items.sort((a, b) => a.description.localeCompare(b.description, "he"));
      const total = items.reduce((s, t) => s + t.amount, 0);
      result[bucket].subs.push({ sub, items, total });
    }

    // Sort subs by total descending
    for (const b of [...BUCKET_ORDER, "unmapped" as Bucket]) {
      result[b].subs.sort((a, b2) => b2.total - a.total);
      result[b].ungrouped.sort((a, b2) => a.description.localeCompare(b2.description, "he"));
    }

    return result;
  }, [effectiveTx]);

  /* ── Category change (for unmapped) — saves category + sub-category ── */
  const handleSubCategoryAssign = useCallback(async (idx: number, optionValue: string) => {
    // optionValue = "categoryKey::subCategoryKey"
    const [catKey, subKey] = optionValue.split("::");
    if (!catKey) return;

    const opt = ALL_SUB_OPTIONS.find(o => o.key === catKey && o.subKey === subKey);
    const label = opt?.label.split(" → ")[1] || catKey;

    const { learnOverride, findSimilarIndices } = await import("@/lib/doc-parser/categorizer");
    const similarIndices = findSimilarIndices(allTx, idx);
    setOverrides(prev => {
      const next = { ...prev };
      for (const i of similarIndices) {
        if (!deletedIndices.has(i)) next[i] = { key: catKey, label };
      }
      return next;
    });

    const desc = allTx[idx]?.description;
    if (desc) {
      learnOverride(desc, catKey);
      if (subKey) learnSubRule(desc, subKey);
    }
    flashSaved();
  }, [allTx, deletedIndices]);

  /* ── Delete ── */
  const handleDelete = useCallback((idx: number) => {
    setDeletedIndices(prev => { const next = new Set(prev); next.add(idx); return next; });
    setOverrides(prev => { const next = { ...prev }; delete next[idx]; return next; });
    flashSaved();
  }, []);

  const flashSaved = useCallback(() => {
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  }, []);

  const hasData = effectiveTx.length > 0;
  const overrideCount = Object.keys(overrides).length;
  const deleteCount = deletedIndices.size;

  const maxBarValue = useMemo(() => {
    if (!monthlyData.length || !avg) return 1;
    return Math.max(...monthlyData.flatMap(d => [d.income, d.expense]), avg.income, avg.expense, 1);
  }, [monthlyData, avg]);

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <PageHeader
        subtitle="Cashflow Hub · מרכז תזרים"
        title="מאזן ותזרים"
        description="ניהול מרכזי — מגמות, היררכיית הוצאות, דריל-דאון"
      />

      {/* Toast */}
      {showSaved && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-pulse" style={{ background: "#012d1d", color: "#fff" }}>
          <span className="material-symbols-outlined text-[16px] text-emerald-300">cloud_done</span>
          <span className="text-xs font-bold" style={{ fontFamily: "Assistant" }}>נשמר</span>
        </div>
      )}

      {/* ═══ Empty ═══ */}
      {!hasData && (
        <div className="p-12 rounded-2xl text-center" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", borderRadius: "1rem" }}>
          <span className="material-symbols-outlined text-[48px] mb-3 block" style={{ color: "#5a7a6a" }}>account_balance_wallet</span>
          <h3 className="text-lg mb-2" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>אין נתונים עדיין</h3>
          <p className="text-sm mb-4" style={{ color: "#5a7a6a" }}>העלה דפי חשבון בעמוד &laquo;טעינת מסמכים&raquo; והעבר לתזרים.</p>
          <a href="/documents"
            className="inline-flex items-center gap-2 text-white text-sm py-2.5 px-6"
            style={{ background: "#012d1d", borderRadius: "0.75rem", fontFamily: "Assistant", fontWeight: 700 }}>
            <span className="material-symbols-outlined text-[16px]">upload_file</span>טען מסמכים
          </a>
        </div>
      )}

      {hasData && avg && (
        <div className="space-y-5">

          {/* ═══ 0. Budget vs Actual — Real-Time ═══ */}
          <BudgetVsActual />

          {/* ═══ 1. KPIs — 3 Cards ═══ */}
          <div className="grid grid-cols-3 gap-4">
            <KPICard icon="account_balance_wallet" label="הכנסה ממוצעת" value={fmtILS(avg.income)} color="#10b981" bgTint="rgba(16,185,129,0.08)" />
            <KPICard icon="shopping_cart" label="הוצאה ממוצעת" value={fmtILS(avg.expense)} color="#b91c1c" bgTint="rgba(185,28,28,0.06)" />
            <KPICard icon="account_balance" label="תזרים חודשי" value={`${avg.gap >= 0 ? "+" : ""}${fmtILS(avg.gap)}`} color={gapColor(avg.gap)}
              bgTint={avg.gap > 1000 ? "rgba(16,185,129,0.08)" : avg.gap >= 0 ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)"} />
          </div>

          {/* ═══ 1b. Financial Instruments Widget ═══ */}
          {instruments.length > 0 && <InstrumentsWidget instruments={instruments} />}

          {/* ═══ 2. Performance Grid — 3 Months + Average ═══ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {monthlyData.map(d => (
              <MiniChart key={d.month} title={d.label} income={d.income} expense={d.expense} gap={d.gap} maxVal={maxBarValue} />
            ))}
            <MiniChart title="ממוצע" income={avg.income} expense={avg.expense} gap={avg.gap} maxVal={maxBarValue} isAvg />
          </div>

          {/* ═══ 3. Nested Accordion — Bucket → Sub-category → Transactions ═══ */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: "#5a7a6a" }}>פירוט הוצאות</div>

            {BUCKET_ORDER.map(bk => {
              const bg = nestedGroups[bk];
              if (bg.total === 0) return null;
              const meta = BUCKET_META[bk];
              const isOpen = expandedBucket === bk;

              return (
                <div key={bk} style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", borderRadius: "1rem", overflow: "hidden" }}>
                  {/* ── Bucket header ── */}
                  <button
                    onClick={() => { setExpandedBucket(isOpen ? null : bk); setExpandedSub(null); }}
                    className="w-full px-5 py-4 flex items-center gap-3 transition-colors"
                    style={{ background: isOpen ? meta.bgLight : "#fff" }}
                    onMouseEnter={e => { if (!isOpen) (e.currentTarget.style.background = "#f9faf2"); }}
                    onMouseLeave={e => { if (!isOpen) (e.currentTarget.style.background = "#fff"); }}
                  >
                    <span className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ background: meta.bgLight, borderRadius: "0.75rem" }}>
                      <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>{meta.icon}</span>
                    </span>
                    <div className="flex-1 text-right">
                      <div className="text-sm" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>{meta.label}</div>
                      <div className="text-[10px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#5a7a6a" }}>{bg.subs.length} תתי-קטגוריות · {bg.subs.reduce((s, g) => s + g.items.length, 0) + bg.ungrouped.length} תנועות</div>
                    </div>
                    <div className="text-lg tabular flex-shrink-0" style={{ fontFamily: "Assistant", fontWeight: 700, color: meta.color }}>{fmtILS(bg.total)}</div>
                    <span className="material-symbols-outlined text-[20px] transition-transform mr-1" style={{ color: "#5a7a6a", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>
                      expand_more
                    </span>
                  </button>

                  {/* ── Sub-category list ── */}
                  {isOpen && (
                    <div style={{ borderTop: "1px solid #eef2e8" }}>
                      {bg.subs.map(sg => {
                        const subOpen = expandedSub === sg.sub.key;
                        const pctOfBucket = bg.total > 0 ? Math.round((sg.total / bg.total) * 100) : 0;

                        return (
                          <div key={sg.sub.key}>
                            {/* Sub-category header */}
                            <button
                              onClick={() => setExpandedSub(subOpen ? null : sg.sub.key)}
                              className="w-full px-6 py-3 flex items-center gap-3 transition-colors"
                              style={{ background: subOpen ? "#f9faf2" : "#fff", borderBottom: "1px solid #f4f7ed" }}
                              onMouseEnter={e => { if (!subOpen) (e.currentTarget.style.background = "#fafcf6"); }}
                              onMouseLeave={e => { if (!subOpen) (e.currentTarget.style.background = "#fff"); }}
                            >
                              <span className="material-symbols-outlined text-[16px]" style={{ color: meta.color }}>{sg.sub.icon}</span>
                              <span className="flex-1 text-right text-sm" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>{sg.sub.label}</span>
                              <span className="text-[10px] px-2 py-0.5" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#5a7a6a", background: meta.bgLight, borderRadius: "0.375rem" }}>
                                {sg.items.length} תנועות · {pctOfBucket}%
                              </span>
                              <span className="text-sm tabular" style={{ fontFamily: "Assistant", fontWeight: 700, color: meta.color }}>{fmtILS(sg.total)}</span>
                              <span className="material-symbols-outlined text-[16px] transition-transform" style={{ color: "#5a7a6a", transform: subOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>
                                expand_more
                              </span>
                            </button>

                            {/* Transaction list */}
                            {subOpen && (
                              <div style={{ background: "#fafcf6" }}>
                                <table className="w-full text-sm">
                                  <tbody>
                                    {sg.items.slice(0, 60).map((t, ri) => (
                                      <tr key={`${t._idx}-${ri}`} className="group transition-colors" style={{ borderBottom: "1px solid #eef2e8" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "#f4f7ed")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                      >
                                        <td className="px-6 py-2 text-xs tabular w-20" dir="ltr" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#012d1d" }}>{t.date}</td>
                                        <td className="px-3 py-2 text-xs truncate max-w-[220px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#012d1d" }}>{t.description}</td>
                                        <td className="px-3 py-2 text-xs tabular text-left w-24" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#b91c1c" }}>-{fmtILS(t.amount)}</td>
                                        <td className="px-3 py-2 w-8 text-center">
                                          <button onClick={() => handleDelete(t._idx)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5" style={{ borderRadius: "0.375rem" }}
                                            onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                            title="מחק">
                                            <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>delete_outline</span>
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {sg.items.length > 60 && (
                                  <div className="px-6 py-2 text-center text-[10px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#5a7a6a" }}>
                                    מציג 60 מתוך {sg.items.length}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Ungrouped within this bucket */}
                      {bg.ungrouped.length > 0 && (
                        <div style={{ borderTop: "1px solid #eef2e8", background: "#fafcf6" }}>
                          <div className="px-6 py-2 text-[10px]" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#5a7a6a" }}>
                            אחר ({bg.ungrouped.length} תנועות)
                          </div>
                          <table className="w-full text-sm">
                            <tbody>
                              {bg.ungrouped.slice(0, 20).map((t, ri) => (
                                <tr key={`ug-${t._idx}-${ri}`} className="group transition-colors" style={{ borderBottom: "1px solid #eef2e8" }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "#f4f7ed")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                  <td className="px-6 py-2 text-xs tabular w-20" dir="ltr" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#012d1d" }}>{t.date}</td>
                                  <td className="px-3 py-2 text-xs truncate max-w-[220px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#012d1d" }}>{t.description}</td>
                                  <td className="px-3 py-2 text-xs tabular text-left w-24" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#b91c1c" }}>-{fmtILS(t.amount)}</td>
                                  <td className="px-3 py-2 w-8 text-center">
                                    <button onClick={() => handleDelete(t._idx)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5" title="מחק">
                                      <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>delete_outline</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ═══ Unmapped — with bucket+sub-category selector ═══ */}
            {nestedGroups.unmapped.total > 0 && (
              <div style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", borderRadius: "1rem", overflow: "hidden", border: "1px dashed #d8e0d0" }}>
                <button
                  onClick={() => setExpandedBucket(expandedBucket === "unmapped" ? null : "unmapped")}
                  className="w-full px-5 py-4 flex items-center gap-3 transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = "#f9faf2")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                >
                  <span className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ background: "#f8fafc", borderRadius: "0.75rem" }}>
                    <span className="material-symbols-outlined text-[18px]" style={{ color: "#94a3b8" }}>help_outline</span>
                  </span>
                  <div className="flex-1 text-right">
                    <div className="text-sm" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>לא מופו</div>
                    <div className="text-[10px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#f59e0b" }}>
                      {nestedGroups.unmapped.ungrouped.length + nestedGroups.unmapped.subs.reduce((s, g) => s + g.items.length, 0)} תנועות ממתינות לסיווג
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[20px] transition-transform mr-1" style={{ color: "#5a7a6a", transform: expandedBucket === "unmapped" ? "rotate(0deg)" : "rotate(-90deg)" }}>
                    expand_more
                  </span>
                </button>

                {expandedBucket === "unmapped" && (
                  <div style={{ borderTop: "1px solid #eef2e8" }}>
                    <table className="w-full text-sm">
                      <thead style={{ background: "#f8fafc" }}>
                        <tr className="text-right">
                          <th className="px-4 py-2 text-[10px] uppercase tracking-[0.1em] w-20" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#5a7a6a" }}>תאריך</th>
                          <th className="px-3 py-2 text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#5a7a6a" }}>תיאור</th>
                          <th className="px-3 py-2 text-[10px] uppercase tracking-[0.1em] w-48" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#5a7a6a" }}>שייך לקטגוריה</th>
                          <th className="px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-left w-24" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#5a7a6a" }}>סכום</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...nestedGroups.unmapped.ungrouped, ...nestedGroups.unmapped.subs.flatMap(s => s.items)].slice(0, 50).map((t, ri) => (
                          <tr key={`um-${t._idx}-${ri}`} className="group transition-colors" style={{ borderBottom: "1px solid #f4f7ed" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f9faf2")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <td className="px-4 py-2 text-xs tabular" dir="ltr" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#012d1d" }}>{t.date}</td>
                            <td className="px-3 py-2 text-xs truncate max-w-[200px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#012d1d" }}>{t.description}</td>
                            <td className="px-3 py-1.5">
                              <select
                                defaultValue=""
                                onChange={e => { if (e.target.value) handleSubCategoryAssign(t._idx, e.target.value); }}
                                className="w-full text-[11px] px-2 py-1.5 border outline-none cursor-pointer transition-all"
                                style={{
                                  fontFamily: "Assistant", fontWeight: 700,
                                  borderColor: overrides[t._idx] ? "#93c5fd" : "#d8e0d0",
                                  background: overrides[t._idx] ? "#eff6ff" : "#fff",
                                  color: overrides[t._idx] ? "#1d4ed8" : "#5a7a6a",
                                  borderRadius: "0.5rem",
                                }}
                              >
                                <option value="">בחר קטגוריה...</option>
                                {BUCKET_ORDER.map(bk => {
                                  const subs = SUB_CATEGORIES_BY_BUCKET[bk] || [];
                                  return (
                                    <optgroup key={bk} label={BUCKET_META[bk].label}>
                                      {subs.map(sc => (
                                        <option key={sc.key} value={`${sc.categoryKeys[0]}::${sc.key}`}>{sc.label}</option>
                                      ))}
                                    </optgroup>
                                  );
                                })}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-xs tabular text-left" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#b91c1c" }}>-{fmtILS(t.amount)}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => handleDelete(t._idx)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5" title="מחק">
                                <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>delete_outline</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status */}
          {(overrideCount > 0 || deleteCount > 0) && (
            <div className="px-5 py-3 flex items-center gap-3 text-[11px]" style={{ background: "#eff6ff", borderRadius: "1rem", fontFamily: "Assistant", fontWeight: 700, color: "#1d4ed8" }}>
              <span className="material-symbols-outlined text-[14px]">cloud_done</span>
              {overrideCount > 0 && `${overrideCount} תיקונים`}{overrideCount > 0 && deleteCount > 0 && " · "}{deleteCount > 0 && `${deleteCount} מחיקות`}
              <span style={{ color: "#5a7a6a" }}> · נשמר אוטומטית</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   KPICard
   ═══════════════════════════════════════════════════ */
function KPICard({ icon, label, value, color, bgTint }: {
  icon: string; label: string; value: string; color: string; bgTint: string;
}) {
  return (
    <div className="p-5" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", borderRadius: "1rem" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 flex items-center justify-center" style={{ background: bgTint, borderRadius: "0.5rem" }}>
          <span className="material-symbols-outlined text-[18px]" style={{ color }}>{icon}</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#5a7a6a" }}>{label}</span>
      </div>
      <div className="text-xl tabular" style={{ fontFamily: "Assistant", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MiniChart — Pure CSS bar pair
   ═══════════════════════════════════════════════════ */
function MiniChart({ title, income, expense, gap, maxVal, isAvg }: {
  title: string; income: number; expense: number; gap: number; maxVal: number; isAvg?: boolean;
}) {
  const barH = 100;
  const incH = Math.max((income / maxVal) * barH, 3);
  const expH = Math.max((expense / maxVal) * barH, 3);

  return (
    <div
      className="p-4 flex flex-col items-center"
      style={{
        background: isAvg ? "#f9faf2" : "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
        borderRadius: "1rem",
        border: isAvg ? "2px solid #d8e0d0" : "none",
      }}
    >
      <div className="text-xs mb-3" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>{title}</div>
      <div className="flex items-end gap-3 mb-2" style={{ height: barH }}>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] tabular" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#10b981" }}>{fmtILS(income)}</span>
          <div className="w-7" style={{ height: incH, background: "#10b981", borderRadius: "4px 4px 0 0", transition: "height 0.5s" }} />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] tabular" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#b91c1c" }}>{fmtILS(expense)}</span>
          <div className="w-7" style={{ height: expH, background: "#b91c1c", borderRadius: "4px 4px 0 0", transition: "height 0.5s" }} />
        </div>
      </div>
      <div className="text-[10px] tabular" style={{ fontFamily: "Assistant", fontWeight: 700, color: gapColor(gap) }}>
        {gap >= 0 ? "+" : ""}{fmtILS(gap)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   InstrumentsWidget — "מכשירים פיננסיים מקושרים"
   ═══════════════════════════════════════════════════ */
function InstrumentsWidget({ instruments }: { instruments: FinancialInstrument[] }) {
  const banks = instruments.filter(i => i.type === "bank_account");
  const cards = instruments.filter(i => i.type === "credit_card");

  return (
    <div className="p-5" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", borderRadius: "1rem" }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-8 h-8 flex items-center justify-center" style={{ background: "rgba(1,45,29,0.08)", borderRadius: "0.5rem" }}>
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#012d1d" }}>account_balance_wallet</span>
        </span>
        <h3 className="text-sm" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>
          מכשירים פיננסיים מקושרים
        </h3>
      </div>

      {/* Instrument list */}
      <div className="space-y-2">
        {banks.map((inst, i) => (
          <div key={`bank-${i}`} className="flex items-center gap-3 px-3 py-2.5" style={{ background: "#f9faf2", borderRadius: "0.75rem" }}>
            <span className="text-[18px]">🏦</span>
            <div className="flex-1">
              <div className="text-xs" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>
                {inst.institution}
              </div>
              <div className="text-[10px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#5a7a6a" }}>
                חשבון {inst.identifier}
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5" style={{
              fontFamily: "Assistant", fontWeight: 700,
              background: "rgba(10,122,74,0.1)", color: "#0a7a4a", borderRadius: "0.375rem",
            }}>
              בנק
            </span>
          </div>
        ))}
        {cards.map((inst, i) => (
          <div key={`card-${i}`} className="flex items-center gap-3 px-3 py-2.5" style={{ background: "#f9faf2", borderRadius: "0.75rem" }}>
            <span className="text-[18px]">💳</span>
            <div className="flex-1">
              <div className="text-xs" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#012d1d" }}>
                {inst.institution}
              </div>
              <div className="text-[10px]" style={{ fontFamily: "Assistant", fontWeight: 400, color: "#5a7a6a" }}>
                סיומת {inst.identifier}
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5" style={{
              fontFamily: "Assistant", fontWeight: 700,
              background: "rgba(59,130,246,0.1)", color: "#3b82f6", borderRadius: "0.375rem",
            }}>
              אשראי
            </span>
          </div>
        ))}
      </div>

      {/* Summary footer */}
      <div className="mt-3 pt-3 text-center" style={{ borderTop: "1px solid #eef2e8" }}>
        <span className="text-[10px]" style={{ fontFamily: "Assistant", fontWeight: 700, color: "#5a7a6a" }}>
          סה&quot;כ: {cards.length} כרטיסי אשראי, {banks.length} חשבונות בנק
        </span>
      </div>
    </div>
  );
}
