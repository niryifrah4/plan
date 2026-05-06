"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { triggerFullSync, markUpdated } from "@/lib/sync-engine";
import type { ParsedDocument, ParsedTransaction } from "@/lib/doc-parser/types";
import { scopedKey } from "@/lib/client-scope";
import type { Scope } from "@/lib/scope-types";
import { isBusinessScopeEnabled, BUSINESS_SCOPE_EVENT } from "@/lib/business-scope";

type Phase = "idle" | "uploading" | "preview" | "saved";

const fmtILS = (v: number) => "₪" + Math.abs(Math.round(v)).toLocaleString("he-IL");

const CAT_OPTIONS = [
  { key: "food", label: "מזון וצריכה" },
  { key: "housing", label: "דיור ומגורים" },
  { key: "transport", label: "תחבורה ורכב" },
  { key: "utilities", label: "חשבונות שוטפים" },
  { key: "health", label: "בריאות" },
  { key: "education", label: "חינוך וילדים" },
  { key: "insurance", label: "ביטוח" },
  { key: "leisure", label: "פנאי ובידור" },
  { key: "shopping", label: "קניות" },
  { key: "salary", label: "משכורת" },
  { key: "pension", label: "פנסיה וחיסכון" },
  { key: "transfers", label: "העברות" },
  { key: "cash", label: "מזומן" },
  { key: "subscriptions", label: "מנויים" },
  { key: "refunds", label: "זיכויים באשראי" },
  { key: "fees", label: "עמלות וריביות" },
  { key: "dining_out", label: "אוכל בחוץ ובילויים" },
  { key: "home_maintenance", label: "תחזוקת בית" },
  { key: "misc", label: "שונות" },
  { key: "other", label: "אחר" },
];

const CAT_COLORS: Record<string, string> = {
  food: "#2B694D",
  housing: "#1B4332",
  transport: "#3b82f6",
  utilities: "#f59e0b",
  health: "#ef4444",
  education: "#2B694D",
  insurance: "#06b6d4",
  leisure: "#ec4899",
  shopping: "#f97316",
  salary: "#2B694D",
  pension: "#1a6b42",
  transfers: "#64748b",
  cash: "#78716c",
  subscriptions: "#2B694D",
  refunds: "#059669",
  other: "#94a3b8",
  fees: "#dc2626",
  dining_out: "#e11d48",
  home_maintenance: "#0e7490",
  misc: "#64748b",
};

/** Categories considered "unmapped" — need manual attention */
const UNMAPPED_KEYS = new Set(["other", "transfers"]);

const BANK_ICONS: Record<string, { icon: string; color: string }> = {
  "בנק הפועלים": { icon: "account_balance", color: "#c41230" },
  "בנק לאומי": { icon: "account_balance", color: "#009639" },
  "בנק דיסקונט": { icon: "account_balance", color: "#003399" },
  "מזרחי-טפחות": { icon: "account_balance", color: "#8b0000" },
  הבינלאומי: { icon: "account_balance", color: "#004d99" },
  ישראכרט: { icon: "credit_card", color: "#1a237e" },
  כאל: { icon: "credit_card", color: "#e65100" },
  מקס: { icon: "credit_card", color: "#0d47a1" },
  "ויזה כאל": { icon: "credit_card", color: "#1a237e" },
  "אמריקן אקספרס": { icon: "credit_card", color: "#006fcf" },
  "לא זוהה": { icon: "help_outline", color: "#94a3b8" },
};

const STORAGE_KEY = "verdant:parsed_transactions";
const DRAFT_KEY = "verdant:doc_draft"; // persists unsaved review state
const HISTORY_KEY = "verdant:doc_history"; // persistent list of uploaded documents

interface DocHistoryEntry {
  id: string;
  filename: string;
  bankHint: string;
  uploadedAt: string; // ISO
  txCount: number;
  chargesSum: number;
  creditsSum: number;
  /** Mapped = category is NOT "other"/"transfers". */
  mappedCount?: number;
  unmappedCount?: number;
  /** Date range of transactions in the file. */
  periodFrom?: string;
  periodTo?: string;
  /** True when every transaction was mapped at save time. */
  fullyMapped?: boolean;
  /** Count of cross-session duplicates skipped on save (e.g. same charge already in a previous upload). */
  crossDupsSkipped?: number;
}

function loadDocHistory(): DocHistoryEntry[] {
  try {
    const raw = localStorage.getItem(scopedKey(HISTORY_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDocHistory(history: DocHistoryEntry[]) {
  try {
    localStorage.setItem(scopedKey(HISTORY_KEY), JSON.stringify(history));
  } catch {}
}

export function DocumentsTab() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [crossDupsSkipped, setCrossDupsSkipped] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, { key: string; label: string }>>({});
  const [scopeOverrides, setScopeOverrides] = useState<Record<number, Scope | undefined>>({});
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [expandedMappedCats, setExpandedMappedCats] = useState<Set<string>>(new Set());
  const [docHistory, setDocHistory] = useState<DocHistoryEntry[]>([]);
  /** Whether business scope toggle column should be shown. */
  const [businessEnabled, setBusinessEnabled] = useState(false);
  useEffect(() => {
    setBusinessEnabled(isBusinessScopeEnabled());
    const handler = () => setBusinessEnabled(isBusinessScopeEnabled());
    window.addEventListener(BUSINESS_SCOPE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(BUSINESS_SCOPE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  /* ── Load document history on mount ── */
  useEffect(() => {
    setDocHistory(loadDocHistory());
  }, []);

  /* ── Draft restore on mount: bring back unsaved review state ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(scopedKey(DRAFT_KEY));
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.doc) {
        setDoc(draft.doc);
        setOverrides(draft.overrides || {});
        setScopeOverrides(draft.scopeOverrides || {});
        setDeletedIndices(new Set(draft.deletedIndices || []));
        setPhase("preview");
      }
    } catch {}
  }, []);

  /* ── Draft auto-save: whenever doc/overrides/deletes change in preview phase ── */
  useEffect(() => {
    if (phase !== "preview" || !doc) return;
    try {
      localStorage.setItem(
        scopedKey(DRAFT_KEY),
        JSON.stringify({
          doc,
          overrides,
          scopeOverrides,
          deletedIndices: Array.from(deletedIndices),
          savedAt: new Date().toISOString(),
        })
      );
    } catch {}
  }, [doc, overrides, scopeOverrides, deletedIndices, phase]);

  /* ── Warn on navigation if unsaved draft exists ── */
  useEffect(() => {
    if (phase !== "preview") return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase]);

  /* ── Effective transactions (with overrides + deletes applied) ── */
  const effectiveTx = useMemo(() => {
    if (!doc) return [];
    return doc.transactions
      .map((t, i) => {
        if (deletedIndices.has(i)) return null;
        const ov = overrides[i];
        const scopeOv = scopeOverrides[i];
        // scopeOv undefined = use original; null-marker semantics: we explicitly store
        // "personal" as undefined-scope (since undefined === personal by convention).
        const scopeVal: Scope | undefined = i in scopeOverrides ? scopeOv : t.scope;
        if (ov) {
          const isRefund = ov.key === "refunds";
          const adjustedAmount = isRefund && t.amount > 0 ? -t.amount : t.amount;
          return {
            ...t,
            category: ov.key,
            categoryLabel: ov.label,
            amount: adjustedAmount,
            scope: scopeVal,
            _idx: i,
          };
        }
        return { ...t, scope: scopeVal, _idx: i };
      })
      .filter(Boolean) as (ParsedTransaction & { _idx: number })[];
  }, [doc, overrides, scopeOverrides, deletedIndices]);

  /* ── Toggle a single row scope: personal ↔ business ── */
  const toggleRowBusiness = useCallback(
    (idx: number) => {
      setScopeOverrides((prev) => {
        const next = { ...prev };
        const current = idx in prev ? prev[idx] : doc?.transactions[idx]?.scope;
        next[idx] = current === "business" ? undefined : "business";
        return next;
      });
    },
    [doc]
  );

  /* ── Split into review / mapped, sort א-ת ──
     Review = anything the user should touch: unmapped categories OR low-confidence.
     Mapped = confident + categorized. One simple binary. */
  const { toReview, mapped, mappedGroups } = useMemo(() => {
    const toReview: (ParsedTransaction & { _idx: number })[] = [];
    const mapped: (ParsedTransaction & { _idx: number })[] = [];
    for (const t of effectiveTx) {
      const isOverridden = !!overrides[t._idx];
      const isUnmapped = UNMAPPED_KEYS.has(t.category);
      const isLowConf = !isOverridden && typeof t.confidence === "number" && t.confidence < 0.7;
      if (isUnmapped || isLowConf) toReview.push(t);
      else mapped.push(t);
    }
    toReview.sort((a, b) => a.description.localeCompare(b.description, "he"));
    const groups: Record<string, (ParsedTransaction & { _idx: number })[]> = {};
    for (const t of mapped) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.description.localeCompare(b.description, "he"));
    }
    return { toReview, mapped, mappedGroups: groups };
  }, [effectiveTx, overrides]);

  /* ── Category override + lateral learning ── */
  const handleCategoryChange = useCallback(
    async (idx: number, newKey: string) => {
      const cat = CAT_OPTIONS.find((c) => c.key === newKey);
      if (!cat || !doc) return;
      const { learnOverride, findSimilarIndices } = await import("@/lib/doc-parser/categorizer");
      const similarIndices = findSimilarIndices(doc.transactions, idx);
      setOverrides((prev) => {
        const next = { ...prev };
        for (const i of similarIndices) {
          if (!deletedIndices.has(i)) next[i] = { key: cat.key, label: cat.label };
        }
        return next;
      });
      const desc = doc.transactions[idx]?.description;
      if (desc) learnOverride(desc, newKey);
    },
    [doc, deletedIndices]
  );

  /* ── Delete from preview ── */
  const handleDelete = useCallback((idx: number) => {
    setDeletedIndices((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }, []);

  /* ── Toggle mapped category accordion ── */
  const toggleMappedCat = useCallback((catKey: string) => {
    setExpandedMappedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey);
      else next.add(catKey);
      return next;
    });
  }, []);

  /* ── BULK UPLOAD ── */
  const uploadFiles = useCallback(async (files: File[]) => {
    setError("");
    setOverrides({});
    setScopeOverrides({});
    setDeletedIndices(new Set());
    setDuplicatesRemoved(0);
    setCrossDupsSkipped(0);
    setExpandedMappedCats(new Set());
    setPhase("uploading");
    try {
      setUploadProgress({ current: 0, total: files.length, name: "" });
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        fd.append("file", files[i]);
        setUploadProgress({ current: i + 1, total: files.length, name: files[i].name });
      }
      const res = await fetch("/api/documents/parse", { method: "POST", body: fd });
      const data = await res.json();
      setUploadProgress(null);
      if (!res.ok) {
        setError(data.error || "שגיאה");
        setPhase("idle");
        return;
      }
      const parsed = data as ParsedDocument & { duplicatesRemoved?: number };
      setDoc(parsed);
      setDuplicatesRemoved(parsed.duplicatesRemoved || 0);
      // Merge detected financial instruments into persistent storage
      if (parsed.instruments && parsed.instruments.length > 0) {
        const { mergeAndSaveInstruments } = await import("@/lib/doc-parser/instruments");
        mergeAndSaveInstruments(parsed.instruments);
      }
      setPhase("preview");
    } catch {
      setUploadProgress(null);
      setError("שגיאה בהעלאת הקבצים. נסה שוב.");
      setPhase("idle");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0);
      if (files.length > 0) uploadFiles(files);
    },
    [uploadFiles]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter((f) => f.size > 0);
      if (files.length > 0) uploadFiles(files);
      // Reset so selecting the same file again re-triggers onChange
      e.target.value = "";
    },
    [uploadFiles]
  );

  /* ── APPEND MORE FILES during preview (merge into current doc) ── */
  const appendFiles = useCallback(
    async (files: File[]) => {
      if (!doc) return;
      setError("");
      setPhase("uploading");
      try {
        setUploadProgress({ current: 0, total: files.length, name: "" });
        const fd = new FormData();
        for (let i = 0; i < files.length; i++) {
          fd.append("file", files[i]);
          setUploadProgress({ current: i + 1, total: files.length, name: files[i].name });
        }
        const res = await fetch("/api/documents/parse", { method: "POST", body: fd });
        const data = await res.json();
        setUploadProgress(null);
        if (!res.ok) {
          setError(data.error || "שגיאה");
          setPhase("preview");
          return;
        }
        const added = data as ParsedDocument & { duplicatesRemoved?: number };

        // ── In-memory dedup: suppress new txns that match an existing one ──
        const keyOf = (t: ParsedTransaction) => {
          const amt = Math.abs(Math.round((t.amount || 0) * 100));
          const supplier = (t.description || "")
            .toLowerCase()
            .replace(/["\u200F\u200E]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 20);
          return `${t.date || ""}|${amt}|${supplier}`;
        };
        const existingKeys = new Set(doc.transactions.map(keyOf));
        let newDups = 0;
        const freshTx = added.transactions.filter((t) => {
          if (existingKeys.has(keyOf(t))) {
            newDups++;
            return false;
          }
          return true;
        });

        // Merge — append new transactions at the end so existing indices
        // (used by overrides / deletedIndices / scopeOverrides) stay valid.
        const mergedFilename = [doc.filename, added.filename].filter(Boolean).join(" + ");
        const mergedInstruments: NonNullable<ParsedDocument["instruments"]> = [
          ...(doc.instruments || []),
        ];
        const seenInst = new Set(
          mergedInstruments.map((i) => `${i.type}::${i.institution}::${i.identifier}`)
        );
        for (const inst of added.instruments || []) {
          const k = `${inst.type}::${inst.institution}::${inst.identifier}`;
          if (!seenInst.has(k)) {
            seenInst.add(k);
            mergedInstruments.push(inst);
          }
        }

        const mergedAll: ParsedTransaction[] = [...doc.transactions, ...freshTx];
        const totalDebit = mergedAll.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        const totalCredit = mergedAll
          .filter((t) => t.amount < 0)
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        const allDates = mergedAll
          .map((t) => t.date)
          .filter(Boolean)
          .sort();

        const combinedWarnings = [
          ...doc.warnings,
          ...added.warnings.map((w) => `[${added.filename}] ${w}`),
        ];
        if (newDups > 0)
          combinedWarnings.push(`${newDups} תנועות הופיעו כבר בקבצים הקודמים — הוסרו`);

        setDoc({
          ...doc,
          filename: mergedFilename,
          bankHint:
            doc.bankHint === added.bankHint ? doc.bankHint : `${doc.bankHint} + ${added.bankHint}`,
          transactions: mergedAll,
          totalDebit,
          totalCredit,
          dateRange: {
            from: allDates[0] || doc.dateRange.from,
            to: allDates[allDates.length - 1] || doc.dateRange.to,
          },
          warnings: combinedWarnings,
          instruments: mergedInstruments,
          // Reconciliation no longer meaningful after merging multiple sources
          reconciliation: undefined,
        });
        // Persist detected instruments from the new file as well
        if (added.instruments && added.instruments.length > 0) {
          const { mergeAndSaveInstruments } = await import("@/lib/doc-parser/instruments");
          mergeAndSaveInstruments(added.instruments);
        }
        setDuplicatesRemoved((d) => d + (added.duplicatesRemoved || 0) + newDups);
        setPhase("preview");
      } catch {
        setUploadProgress(null);
        setError("שגיאה בהוספת הקבצים. נסה שוב.");
        setPhase("preview");
      }
    },
    [doc]
  );

  const onAppendFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter((f) => f.size > 0);
      if (files.length > 0) appendFiles(files);
      e.target.value = "";
    },
    [appendFiles]
  );

  /* ── Save to cashflow (append to localStorage history) ── */
  const handleTransfer = useCallback(() => {
    if (!doc) return;
    try {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Tag every saved transaction with the source doc so we can trace it later.
      const txToSave = effectiveTx.map(({ _idx, ...rest }) => ({
        ...rest,
        sourceDocId: docId,
        sourceFile: doc.filename,
      }));
      const existing: ParsedTransaction[] = JSON.parse(
        localStorage.getItem(scopedKey(STORAGE_KEY)) || "[]"
      );

      // ── Cross-session dedup ──
      // If a tx was already saved from a previous upload (e.g. credit-card
      // charge appeared in both the bank statement AND the credit statement),
      // suppress the duplicate instead of double-counting.
      const keyOf = (t: ParsedTransaction) => {
        const amt = Math.abs(Math.round((t.amount || 0) * 100));
        const supplier = (t.description || "")
          .toLowerCase()
          .replace(/["\u200F\u200E]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 20);
        return `${t.date || ""}|${amt}|${supplier}`;
      };
      const existingKeys = new Set(existing.map(keyOf));
      let crossDupsSkipped = 0;
      const fresh = txToSave.filter((t) => {
        if (existingKeys.has(keyOf(t))) {
          crossDupsSkipped++;
          return false;
        }
        return true;
      });
      localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify([...existing, ...fresh]));
      setCrossDupsSkipped(crossDupsSkipped);

      // Record in persistent document history (counts reflect `fresh` —
      // cross-session duplicates are excluded so totals stay honest).
      const chargesSum = fresh.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const creditsSum = fresh
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      const unmappedCount = fresh.filter((t) => UNMAPPED_KEYS.has(t.category)).length;
      const mappedCount = fresh.length - unmappedCount;
      const dates = fresh
        .map((t) => t.date)
        .filter(Boolean)
        .sort();
      const entry: DocHistoryEntry = {
        id: docId,
        filename: doc.filename,
        bankHint: doc.bankHint || "לא זוהה",
        uploadedAt: new Date().toISOString(),
        txCount: fresh.length,
        chargesSum,
        creditsSum,
        mappedCount,
        unmappedCount,
        periodFrom: dates[0],
        periodTo: dates[dates.length - 1],
        fullyMapped: unmappedCount === 0,
        crossDupsSkipped: crossDupsSkipped > 0 ? crossDupsSkipped : undefined,
      };
      const newHistory = [entry, ...loadDocHistory()].slice(0, 50); // keep last 50
      saveDocHistory(newHistory);
      setDocHistory(newHistory);

      localStorage.removeItem(scopedKey(DRAFT_KEY)); // draft consumed
      markUpdated("docs");
      triggerFullSync();
      setPhase("saved");
    } catch {
      setError("שגיאה בשמירה");
    }
  }, [doc, effectiveTx]);

  /* ── Remove a history entry (doesn't delete transactions, just the record) ── */
  const handleRemoveHistory = useCallback((id: string) => {
    const next = loadDocHistory().filter((h) => h.id !== id);
    saveDocHistory(next);
    setDocHistory(next);
  }, []);

  /* ── Derived ── */
  const overrideCount = Object.keys(overrides).length;
  const deleteCount = deletedIndices.size;
  const bankHint = doc?.bankHint || "לא זוהה";
  const bankIcon = BANK_ICONS[bankHint] || BANK_ICONS["לא זוהה"];
  const allMapped = toReview.length === 0;
  const reviewPct =
    effectiveTx.length > 0 ? Math.round((mapped.length / effectiveTx.length) * 100) : 100;
  const netCharges = effectiveTx.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="mx-auto max-w-5xl" dir="rtl">
      <PageHeader
        subtitle="Parsing Station · תחנת אימות"
        title="תחנת אימות מסמכים"
        description="העלאה, זיהוי אוטומטי ואישור של תנועות פיננסיות — בנק, אשראי, לוחות סילוקין ומסלקה פנסיונית"
      />

      {/* ═══ Three Upload Zones (idle only) ═══ */}
      {phase === "idle" && !error && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Zone 1 — Bank / Credit */}
          <div
            onClick={() => inputRef.current?.click()}
            className="card-pad cursor-pointer text-center transition-all duration-200"
            style={{ borderTop: "3px solid #2B694D" }}
          >
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(16,185,129,0.08)" }}
            >
              <span className="material-symbols-outlined text-[28px] text-verdant-emerald">
                account_balance
              </span>
            </div>
            <h3 className="mb-1 text-sm font-extrabold text-verdant-ink">דפי בנק וכרטיסי אשראי</h3>
            <p className="text-[11px] leading-relaxed text-verdant-muted">
              העלה PDF/Excel מעו&quot;ש או כרטיס אשראי — המערכת תזהה תנועות, תסווג אוטומטית ותעביר
              לתזרים
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-verdant-emerald">
              <span className="material-symbols-outlined text-[14px]">upload_file</span>
              PDF · XLSX · CSV
            </div>
          </div>

          {/* Zone 2 — Amortization Schedules */}
          <div
            onClick={() => inputRef.current?.click()}
            className="card-pad cursor-pointer text-center transition-all duration-200"
            style={{ borderTop: "3px solid #3b82f6" }}
          >
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(59,130,246,0.08)" }}
            >
              <span className="material-symbols-outlined text-[28px]" style={{ color: "#3b82f6" }}>
                table_chart
              </span>
            </div>
            <h3 className="mb-1 text-sm font-extrabold text-verdant-ink">לוחות סילוקין</h3>
            <p className="text-[11px] leading-relaxed text-verdant-muted">
              העלה לוח סילוקין של משכנתא או הלוואה — המערכת תזהה מסלולים, ריביות ויתרות ותטען לעמוד
              ההלוואות
            </p>
            <div
              className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold"
              style={{ color: "#3b82f6" }}
            >
              <span className="material-symbols-outlined text-[14px]">upload_file</span>
              PDF · XLSX
            </div>
          </div>

          {/* Zone 3 — Pension XML */}
          <a
            href="/pension"
            className="card-pad block text-center transition-all duration-200"
            style={{ borderTop: "3px solid #2B694D" }}
          >
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(139,92,246,0.08)" }}
            >
              <span className="material-symbols-outlined text-[28px]" style={{ color: "#2B694D" }}>
                elderly
              </span>
            </div>
            <h3 className="mb-1 text-sm font-extrabold text-verdant-ink">מסלקה פנסיונית (XML)</h3>
            <p className="text-[11px] leading-relaxed text-verdant-muted">
              קובץ XML מהמסלקה הפנסיונית — יפוענח אוטומטית בעמוד פנסיה ופרישה עם קרנות, דמי ניהול
              ומסלולים
            </p>
            <div
              className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold"
              style={{ color: "#2B694D" }}
            >
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              עבור לעמוד פנסיה
            </div>
          </a>
        </div>
      )}

      {/* ═══ Upload Area — Drag & Drop ═══ */}
      {(phase === "idle" || phase === "uploading") && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-2xl transition-all duration-300"
          style={{
            minHeight: 280,
            border: dragOver ? "2px dashed #2B694D" : "2px dashed #d8e0d0",
            background: dragOver ? "rgba(16,185,129,0.04)" : "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.xlsx,.xls,.csv"
            multiple
            onChange={onFileChange}
          />
          <div className="flex h-full flex-col items-center justify-center py-14">
            {phase === "uploading" ? (
              <>
                <span className="material-symbols-outlined mb-3 animate-pulse text-[48px] text-verdant-emerald">
                  cloud_sync
                </span>
                <div
                  className="mb-1 text-lg font-extrabold text-verdant-ink"
                  style={{ fontFamily: "Assistant" }}
                >
                  מעבד קבצים...
                </div>
                {uploadProgress && (
                  <div className="text-sm text-verdant-muted">
                    קובץ {uploadProgress.current} מתוך {uploadProgress.total}:{" "}
                    <span className="font-bold">{uploadProgress.name}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: "rgba(16,185,129,0.08)" }}
                >
                  <span className="material-symbols-outlined text-[32px] text-verdant-emerald">
                    cloud_upload
                  </span>
                </div>
                <div
                  className="mb-1 text-lg font-extrabold text-verdant-ink"
                  style={{ fontFamily: "Assistant" }}
                >
                  גרור לכאן קבצי PDF או Excel
                </div>
                <div className="mb-1 text-sm text-verdant-muted">
                  ניתן להעלות מספר קבצים בו-זמנית
                </div>
                <div className="mb-5 text-xs text-verdant-muted">
                  עו&quot;ש + כרטיס אשראי = איחוד אוטומטי ללא כפילויות
                </div>
                <button type="button" className="btn-botanical px-6 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>בחר
                    קבצים מהמחשב
                  </span>
                </button>
                <div className="caption mt-3 flex items-center gap-3">
                  <span>PDF</span>
                  <span style={{ color: "#d8e0d0" }}>·</span>
                  <span>XLSX</span>
                  <span style={{ color: "#d8e0d0" }}>·</span>
                  <span>CSV</span>
                  <span style={{ color: "#d8e0d0" }}>|</span>
                  <span>עד 10MB לקובץ</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          className="mt-4 flex items-center gap-3 rounded-2xl p-4"
          style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ color: "#b91c1c" }}>
            error
          </span>
          <span className="text-sm font-bold" style={{ color: "#b91c1c" }}>
            {error}
          </span>
          <button
            onClick={() => {
              setError("");
              setPhase("idle");
            }}
            className="mr-auto text-xs font-bold text-verdant-muted hover:underline"
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* ═══ PREVIEW — Clean split: לבדיקה / מופה ═══ */}
      {phase === "preview" && doc && (
        <div className="mt-2 space-y-3">
          {/* ── Header card: file + 3 KPIs + progress ── */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: bankIcon.color + "14" }}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ color: bankIcon.color }}
                  >
                    {bankIcon.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <h2
                    className="truncate text-base font-extrabold text-verdant-ink"
                    style={{ fontFamily: "Assistant" }}
                  >
                    {doc.filename}
                  </h2>
                  <div className="text-[11px] font-bold text-verdant-muted">{bankHint}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  ref={appendInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.csv"
                  multiple
                  onChange={onAppendFileChange}
                />
                <button
                  onClick={() => appendInputRef.current?.click()}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-extrabold transition-colors hover:opacity-90"
                  style={{ background: "#1B4332", color: "#fff" }}
                  title="הוסף קובץ לסקירה הזאת — יתמזג עם דה-דופ"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>קובץ
                </button>
                <button
                  onClick={() => {
                    setPhase("idle");
                    setDoc(null);
                    setOverrides({});
                    setScopeOverrides({});
                    setDeletedIndices(new Set());
                    try {
                      localStorage.removeItem(scopedKey(DRAFT_KEY));
                    } catch {}
                  }}
                  className="rounded-lg px-2.5 py-2 text-xs font-bold text-verdant-muted transition-colors hover:bg-verdant-bg hover:text-verdant-ink"
                  title="התחל מחדש"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                </button>
              </div>
            </div>
            {/* 3 KPIs */}
            <div className="mb-3 grid grid-cols-3 gap-3">
              <MiniKPI
                label="תנועות"
                value={`${effectiveTx.length}${deleteCount > 0 ? ` (-${deleteCount})` : ""}`}
              />
              <MiniKPI
                label="מצב מיפוי"
                value={
                  allMapped
                    ? `✓ ${mapped.length} מופו`
                    : `${toReview.length} לבדיקה · ${mapped.length} מופו`
                }
                color={allMapped ? "#1B4332" : "#B45309"}
              />
              <MiniKPI
                label="חיובים נטו"
                value={(netCharges >= 0 ? "-" : "+") + fmtILS(netCharges)}
                color={netCharges >= 0 ? "#8B2E2E" : "#1B4332"}
              />
            </div>
            {/* Progress bar */}
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#eef7f1" }}>
              <div
                className="h-full transition-all"
                style={{ width: `${reviewPct}%`, background: allMapped ? "#1B4332" : "#B45309" }}
              />
            </div>
          </div>

          {/* ── Compact info strip: warnings + dedup + reconciliation ── */}
          {(doc.warnings.length > 0 ||
            duplicatesRemoved > 0 ||
            (doc.reconciliation && doc.reconciliation.severity !== "skipped")) && (
            <div
              className="flex flex-wrap items-start gap-2 rounded-xl px-4 py-2 text-[11px] font-bold"
              style={{ background: "#f9faf2", color: "#5a6b52" }}
            >
              {duplicatesRemoved > 0 && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">merge</span>
                  {duplicatesRemoved} כפילויות הוסרו
                </span>
              )}
              {doc.reconciliation && doc.reconciliation.severity !== "skipped" && (
                <span className="flex items-center gap-1">
                  <span style={{ color: "#d8e0d0" }}>·</span>
                  <span
                    className="material-symbols-outlined text-[13px]"
                    style={{
                      color:
                        doc.reconciliation.severity === "clean"
                          ? "#1B4332"
                          : doc.reconciliation.severity === "minor"
                            ? "#B45309"
                            : "#8B2E2E",
                    }}
                  >
                    {doc.reconciliation.severity === "clean" ? "verified" : "info"}
                  </span>
                  {doc.reconciliation.message}
                </span>
              )}
              {doc.warnings.map((w, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span style={{ color: "#d8e0d0" }}>·</span>
                  <span
                    className="material-symbols-outlined text-[13px]"
                    style={{ color: "#B45309" }}
                  >
                    info
                  </span>
                  {w}
                </span>
              ))}
            </div>
          )}

          {/* ═══ REVIEW ZONE — לבדיקה (unmapped + low-confidence, unified) ═══ */}
          {toReview.length > 0 && (
            <div
              className="overflow-hidden rounded-2xl"
              style={{
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                borderRight: "3px solid #B45309",
              }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-3"
                style={{ borderColor: "#f4f7ed" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ color: "#B45309" }}
                  >
                    help_outline
                  </span>
                  <h3
                    className="text-sm font-extrabold text-verdant-ink"
                    style={{ fontFamily: "Assistant" }}
                  >
                    לבדיקה · {toReview.length} תנועות
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-verdant-muted">
                  בחר קטגוריה · המערכת תלמד
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {toReview.map((t) => {
                      const isBiz = t.scope === "business";
                      return (
                        <tr
                          key={t._idx}
                          className="group border-b transition-colors hover:bg-verdant-bg/30"
                          style={{ borderColor: "#f4f7ed" }}
                        >
                          <td
                            className="tabular w-20 px-5 py-2 text-xs font-bold text-verdant-ink"
                            dir="ltr"
                          >
                            {t.date}
                          </td>
                          <td className="max-w-[220px] px-3 py-2 text-xs font-bold text-verdant-ink">
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(t.description + " ישראל")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group/link inline-flex items-center gap-1 truncate hover:text-verdant-emerald hover:underline"
                              title="חפש בגוגל כדי לזהות את בית העסק"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="truncate">{t.description}</span>
                              <span
                                className="material-symbols-outlined flex-shrink-0 text-[11px] opacity-0 transition-opacity group-hover/link:opacity-100"
                                style={{ color: "#B45309" }}
                              >
                                open_in_new
                              </span>
                            </a>
                          </td>
                          <td className="w-44 px-3 py-1.5">
                            <select
                              value={t.category}
                              onChange={(e) => handleCategoryChange(t._idx, e.target.value)}
                              className="w-full cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none transition-all focus:ring-2"
                              style={{
                                borderColor: "#fcd9a8",
                                background: "#fffbeb",
                                color: "#1B4332",
                              }}
                            >
                              {CAT_OPTIONS.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          {businessEnabled && (
                            <td className="w-20 px-2 py-1.5 text-center">
                              <button
                                onClick={() => toggleRowBusiness(t._idx)}
                                title={isBiz ? "עסקי — לחץ להחזרה לפרטי" : "סמן כהוצאה עסקית"}
                                className="rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition-all"
                                style={
                                  isBiz
                                    ? {
                                        borderColor: "#1B4332",
                                        background: "#eef7f1",
                                        color: "#1B4332",
                                      }
                                    : {
                                        borderColor: "#e5e7eb",
                                        background: "#fff",
                                        color: "#9ca3af",
                                      }
                                }
                              >
                                {isBiz ? "עסקי" : "פרטי"}
                              </button>
                            </td>
                          )}
                          <td
                            className="tabular w-24 px-3 py-2 text-left text-xs font-extrabold"
                            style={{ color: t.amount > 0 ? "#8B2E2E" : "#1B4332" }}
                          >
                            {t.amount > 0 ? "-" : "+"}
                            {fmtILS(t.amount)}
                          </td>
                          <td className="w-10 px-3 py-2 text-center">
                            <button
                              onClick={() => handleDelete(t._idx)}
                              className="rounded-md p-1 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                              title="מחק"
                            >
                              <span
                                className="material-symbols-outlined text-[14px]"
                                style={{ color: "#8B2E2E" }}
                              >
                                delete_outline
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ MAPPED ZONE — grouped by category (monochrome emerald) ═══ */}
          {mapped.length > 0 && (
            <div
              className="overflow-hidden rounded-2xl"
              style={{
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                borderRight: "3px solid #1B4332",
              }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-3"
                style={{ borderColor: "#f4f7ed" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ color: "#1B4332" }}
                  >
                    check_circle
                  </span>
                  <h3
                    className="text-sm font-extrabold text-verdant-ink"
                    style={{ fontFamily: "Assistant" }}
                  >
                    מופה · {mapped.length} תנועות
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-verdant-muted">מקובץ לפי קטגוריה</span>
              </div>
              <div className="divide-y" style={{ borderColor: "#f4f7ed" }}>
                {Object.entries(mappedGroups)
                  .sort((a, b) => {
                    const totalA = a[1].reduce((s, t) => s + Math.abs(t.amount), 0);
                    const totalB = b[1].reduce((s, t) => s + Math.abs(t.amount), 0);
                    return totalB - totalA;
                  })
                  .map(([catKey, txs]) => {
                    const catLabel = CAT_OPTIONS.find((c) => c.key === catKey)?.label || catKey;
                    const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
                    const isExpanded = expandedMappedCats.has(catKey);
                    return (
                      <div key={catKey}>
                        <button
                          onClick={() => toggleMappedCat(catKey)}
                          className="flex w-full items-center justify-between px-5 py-3 text-right transition-colors hover:bg-verdant-bg/30"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ background: "#1B4332" }}
                            />
                            <span
                              className="text-sm font-extrabold text-verdant-ink"
                              style={{ fontFamily: "Assistant" }}
                            >
                              {catLabel}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{ background: "#eef7f1", color: "#1B4332" }}
                            >
                              {txs.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="tabular text-sm font-extrabold text-verdant-ink">
                              {fmtILS(total)}
                            </span>
                            <span
                              className="material-symbols-outlined text-[16px] text-verdant-muted transition-transform"
                              style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                            >
                              expand_more
                            </span>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t" style={{ borderColor: "#f4f7ed" }}>
                            <table className="w-full text-sm">
                              <tbody>
                                {txs.map((t) => {
                                  const isBizM = t.scope === "business";
                                  return (
                                    <tr
                                      key={t._idx}
                                      className="group border-b transition-colors hover:bg-verdant-bg/20"
                                      style={{ borderColor: "#f9faf2" }}
                                    >
                                      <td
                                        className="tabular w-20 px-5 py-2 text-xs font-bold text-verdant-ink"
                                        dir="ltr"
                                      >
                                        {t.date}
                                      </td>
                                      <td className="max-w-[220px] truncate px-3 py-2 text-xs font-bold text-verdant-ink">
                                        {t.description}
                                      </td>
                                      <td className="w-44 px-3 py-1.5">
                                        <select
                                          value={t.category}
                                          onChange={(e) =>
                                            handleCategoryChange(t._idx, e.target.value)
                                          }
                                          className="w-full cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none transition-all focus:ring-2 focus:ring-verdant-accent/30"
                                          style={{
                                            borderColor: "#d8e0d0",
                                            background: "#fff",
                                            color: "#1B4332",
                                          }}
                                        >
                                          {CAT_OPTIONS.map((c) => (
                                            <option key={c.key} value={c.key}>
                                              {c.label}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      {businessEnabled && (
                                        <td className="w-20 px-2 py-1.5 text-center">
                                          <button
                                            onClick={() => toggleRowBusiness(t._idx)}
                                            title={
                                              isBizM
                                                ? "עסקי — לחץ להחזרה לפרטי"
                                                : "סמן כהוצאה עסקית"
                                            }
                                            className="rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition-all"
                                            style={
                                              isBizM
                                                ? {
                                                    borderColor: "#1B4332",
                                                    background: "#eef7f1",
                                                    color: "#1B4332",
                                                  }
                                                : {
                                                    borderColor: "#e5e7eb",
                                                    background: "#fff",
                                                    color: "#9ca3af",
                                                  }
                                            }
                                          >
                                            {isBizM ? "עסקי" : "פרטי"}
                                          </button>
                                        </td>
                                      )}
                                      <td
                                        className="tabular w-24 px-3 py-2 text-left text-xs font-extrabold"
                                        style={{ color: t.amount > 0 ? "#8B2E2E" : "#1B4332" }}
                                      >
                                        {t.amount > 0 ? "-" : "+"}
                                        {fmtILS(t.amount)}
                                      </td>
                                      <td className="w-10 px-3 py-2 text-center">
                                        <button
                                          onClick={() => handleDelete(t._idx)}
                                          className="rounded-md p-1 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                                          title="מחק"
                                        >
                                          <span
                                            className="material-symbols-outlined text-[14px]"
                                            style={{ color: "#8B2E2E" }}
                                          >
                                            delete_outline
                                          </span>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── Action bar ── */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => {
                setPhase("idle");
                setDoc(null);
                setOverrides({});
                setScopeOverrides({});
                setDeletedIndices(new Set());
                try {
                  localStorage.removeItem(scopedKey(DRAFT_KEY));
                } catch {}
              }}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-verdant-muted transition-colors hover:text-verdant-ink"
              style={{ background: "#f4f7ed" }}
            >
              <span className="material-symbols-outlined text-[16px]">close</span>בטל
            </button>
            <div className="flex items-center gap-3">
              {overrideCount > 0 && (
                <span
                  className="flex items-center gap-1 text-[11px] font-bold text-verdant-muted"
                  title="למידה רוחבית — בתי עסק דומים עודכנו אוטומטית"
                >
                  <span
                    className="material-symbols-outlined text-[13px]"
                    style={{ color: "#1B4332" }}
                  >
                    auto_fix_high
                  </span>
                  {overrideCount} תיקונים
                </span>
              )}
              <button
                onClick={handleTransfer}
                className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-extrabold text-white transition-all hover:scale-[0.98] hover:shadow-lg"
                style={{ background: "#1B4332", fontFamily: "Assistant" }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {allMapped ? "verified" : "save"}
                </span>
                {allMapped ? "אשר והעבר" : `שמור והעבר (${toReview.length} לא מסווגות)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SAVED — Success ═══ */}
      {phase === "saved" && doc && (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "rgba(16,185,129,0.1)" }}
          >
            <span className="material-symbols-outlined text-[28px] text-verdant-emerald">
              task_alt
            </span>
          </div>
          <h2
            className="mb-2 text-xl font-extrabold text-verdant-ink"
            style={{ fontFamily: "Assistant" }}
          >
            הנתונים הועברו לתזרים
          </h2>
          <p className="mb-1 text-sm text-verdant-muted">
            {effectiveTx.length - crossDupsSkipped} תנועות נוספו בהצלחה
          </p>
          {duplicatesRemoved > 0 && (
            <p className="mb-1 text-xs font-bold" style={{ color: "#1B4332" }}>
              {duplicatesRemoved} כפילויות בתוך הקובץ הוסרו
            </p>
          )}
          {crossDupsSkipped > 0 && (
            <p className="mb-1 text-xs font-bold" style={{ color: "#1B4332" }}>
              <span className="material-symbols-outlined ml-0.5 align-middle text-[12px]">
                link
              </span>
              {crossDupsSkipped} תנועות כבר קיימות מהעלאות קודמות (עו״ש ↔ אשראי) — לא נוספו פעמיים
            </p>
          )}
          {overrideCount > 0 && (
            <p className="mb-3 text-xs font-bold text-blue-600">
              {overrideCount} תיקוני קטגוריה (למידה רוחבית)
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setPhase("idle");
                setDoc(null);
                setOverrides({});
                setScopeOverrides({});
                setDeletedIndices(new Set());
                try {
                  localStorage.removeItem(scopedKey(DRAFT_KEY));
                } catch {}
              }}
              className="btn-botanical flex items-center gap-2 px-6 py-2.5 text-sm"
              style={{ fontFamily: "Assistant" }}
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>טען קובץ
              נוסף
            </button>
            <a
              href="/balance"
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-verdant-muted transition-colors hover:text-verdant-ink"
              style={{ background: "#f4f7ed" }}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>עבור לתזרים
            </a>
          </div>
        </div>
      )}

      {/* ═══ Mapping Progress Summary (idle only) ═══ */}
      {phase === "idle" &&
        !error &&
        docHistory.length > 0 &&
        (() => {
          const totalTx = docHistory.reduce((s, h) => s + (h.txCount || 0), 0);
          const totalUnmapped = docHistory.reduce((s, h) => s + (h.unmappedCount ?? 0), 0);
          const totalMapped = totalTx - totalUnmapped;
          const pct = totalTx > 0 ? Math.round((totalMapped / totalTx) * 100) : 100;
          const filesWithGaps = docHistory.filter((h) => (h.unmappedCount ?? 0) > 0).length;
          const allDates = docHistory
            .flatMap((h) => [h.periodFrom, h.periodTo])
            .filter(Boolean)
            .sort() as string[];
          const rangeFrom = allDates[0];
          const rangeTo = allDates[allDates.length - 1];
          const fmtDate = (iso?: string) =>
            iso
              ? new Date(iso).toLocaleDateString("he-IL", { month: "short", year: "numeric" })
              : "";
          return (
            <div
              className="mb-4 mt-6 rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg,#eef7f1 0%,#f9faf2 100%)",
                border: "1px solid #d8e0d0",
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ color: "#1B4332" }}
                  >
                    fact_check
                  </span>
                  <h3
                    className="text-sm font-extrabold text-verdant-ink"
                    style={{ fontFamily: "Assistant" }}
                  >
                    מצב המיפוי
                  </h3>
                </div>
                {rangeFrom && rangeTo && (
                  <span className="text-[10px] font-bold text-verdant-muted">
                    {fmtDate(rangeFrom)} → {fmtDate(rangeTo)}
                  </span>
                )}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-white p-3">
                  <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                    קבצים
                  </div>
                  <div className="tabular text-lg font-extrabold text-verdant-ink">
                    {docHistory.length}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                    תנועות
                  </div>
                  <div className="tabular text-lg font-extrabold text-verdant-ink">
                    {totalTx.toLocaleString("he-IL")}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                    אחוז ממופה
                  </div>
                  <div
                    className="tabular text-lg font-extrabold"
                    style={{ color: pct >= 95 ? "#2B694D" : pct >= 80 ? "#B45309" : "#8B2E2E" }}
                  >
                    {pct}%
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                    לא ממופה
                  </div>
                  <div
                    className="tabular text-lg font-extrabold"
                    style={{ color: totalUnmapped > 0 ? "#8B2E2E" : "#2B694D" }}
                  >
                    {totalUnmapped.toLocaleString("he-IL")}
                    {filesWithGaps > 0 && (
                      <span className="mr-1 text-[10px] font-bold text-verdant-muted">
                        · ב-{filesWithGaps} קבצים
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 95 ? "#2B694D" : pct >= 80 ? "#B45309" : "#8B2E2E",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              {totalUnmapped > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-verdant-muted">
                  <span
                    className="material-symbols-outlined text-[14px]"
                    style={{ color: "#B45309" }}
                  >
                    pending
                  </span>
                  <span>
                    יש {totalUnmapped.toLocaleString("he-IL")} תנועות שסווגו כ״אחר״ או ״העברות״ —
                    הקבצים המודגשים למטה דורשים טיפול נוסף
                  </span>
                </div>
              )}
            </div>
          );
        })()}

      {/* ═══ History of uploaded documents (idle only) ═══ */}
      {phase === "idle" && !error && docHistory.length > 0 && (
        <div
          className="mt-6 overflow-hidden rounded-2xl"
          style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ background: "linear-gradient(135deg,#012d1d 0%,#1B4332 100%)" }}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-white">history</span>
              <h3 className="text-sm font-extrabold text-white" style={{ fontFamily: "Assistant" }}>
                מסמכים שנטענו ({docHistory.length})
              </h3>
            </div>
            <span className="text-[10px] font-bold text-white/70">
              היסטוריית העלאות · רשומות אחרונות למעלה
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "#eef7f1" }}>
            {docHistory.map((h) => {
              const bankIcon = BANK_ICONS[h.bankHint] || BANK_ICONS["לא זוהה"];
              const dt = new Date(h.uploadedAt);
              const dateStr = dt.toLocaleDateString("he-IL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              });
              const timeStr = dt.toLocaleTimeString("he-IL", {
                hour: "2-digit",
                minute: "2-digit",
              });
              // Mapping status — legacy entries have no mappedCount; treat as "unknown".
              const hasStats = typeof h.unmappedCount === "number";
              const unmap = h.unmappedCount ?? 0;
              const mapPct =
                hasStats && h.txCount > 0
                  ? Math.round(((h.txCount - unmap) / h.txCount) * 100)
                  : null;
              const statusColor = !hasStats
                ? "#94a3b8"
                : unmap === 0
                  ? "#2B694D"
                  : unmap <= 5
                    ? "#B45309"
                    : "#8B2E2E";
              const statusBg = !hasStats
                ? "#f1f5f9"
                : unmap === 0
                  ? "#d6efdc"
                  : unmap <= 5
                    ? "#fef3c7"
                    : "#fee2e2";
              const statusLabel = !hasStats
                ? "—"
                : unmap === 0
                  ? "✓ 100% ממופה"
                  : `${unmap} לא ממופה · ${mapPct}%`;
              const periodStr =
                h.periodFrom && h.periodTo
                  ? `${new Date(h.periodFrom).toLocaleDateString("he-IL", { month: "short", year: "2-digit" })} → ${new Date(h.periodTo).toLocaleDateString("he-IL", { month: "short", year: "2-digit" })}`
                  : null;
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-verdant-bg/30"
                  style={{ borderRight: unmap > 0 ? "3px solid " + statusColor : "none" }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: bankIcon.color + "14" }}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ color: bankIcon.color }}
                    >
                      {bankIcon.icon}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="truncate text-[13px] font-extrabold text-verdant-ink"
                        style={{ fontFamily: "Assistant" }}
                      >
                        {h.filename}
                      </span>
                      <span
                        className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold"
                        style={{ color: statusColor, background: statusBg }}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-verdant-muted">
                      <span>{h.bankHint}</span>
                      <span style={{ color: "#d8e0d0" }}>·</span>
                      <span>
                        {dateStr} {timeStr}
                      </span>
                      {periodStr && (
                        <>
                          <span style={{ color: "#d8e0d0" }}>·</span>
                          <span className="flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[11px]">
                              calendar_month
                            </span>
                            {periodStr}
                          </span>
                        </>
                      )}
                      {typeof h.crossDupsSkipped === "number" && h.crossDupsSkipped > 0 && (
                        <>
                          <span style={{ color: "#d8e0d0" }}>·</span>
                          <span
                            className="flex items-center gap-0.5"
                            style={{ color: "#1B4332" }}
                            title="כפילויות מול העלאות קודמות — עו״ש ↔ אשראי"
                          >
                            <span className="material-symbols-outlined text-[11px]">link</span>
                            {h.crossDupsSkipped} מיוזגו
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="tabular hidden items-center gap-4 text-[11px] font-bold md:flex">
                    <div className="text-right">
                      <div className="text-[9px] text-verdant-muted">תנועות</div>
                      <div className="font-extrabold text-verdant-ink">{h.txCount}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-verdant-muted">חיובים</div>
                      <div className="font-extrabold" style={{ color: "#b91c1c" }}>
                        {fmtILS(h.chargesSum)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-verdant-muted">זיכויים</div>
                      <div className="font-extrabold" style={{ color: "#2B694D" }}>
                        {fmtILS(h.creditsSum)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveHistory(h.id)}
                    className="rounded-md p-1.5 transition-colors hover:bg-red-50"
                    title="הסר מההיסטוריה"
                  >
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ color: "#b91c1c" }}
                    >
                      delete_outline
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div
            className="px-5 py-2.5 text-[10px] font-bold text-verdant-muted"
            style={{ background: "#f9faf2" }}
          >
            <span className="material-symbols-outlined ml-1 align-middle text-[11px]">info</span>
            הסרה מההיסטוריה לא מוחקת את התנועות עצמן מהתזרים
          </div>
        </div>
      )}

      {/* Supported banks (idle only) */}
      {phase === "idle" && !error && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            className="rounded-2xl p-5"
            style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                account_balance
              </span>
              <h3
                className="text-sm font-extrabold text-verdant-ink"
                style={{ fontFamily: "Assistant" }}
              >
                בנקים נתמכים
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {["הפועלים", "לאומי", "דיסקונט", "מזרחי-טפחות", "הבינלאומי"].map((b) => (
                <span
                  key={b}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "#eef7f1", color: "#1B4332" }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div
            className="rounded-2xl p-5"
            style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
                credit_card
              </span>
              <h3
                className="text-sm font-extrabold text-verdant-ink"
                style={{ fontFamily: "Assistant" }}
              >
                חברות אשראי
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {["ישראכרט", "כאל", "מקס", "ויזה", "אמריקן אקספרס"].map((c) => (
                <span
                  key={c}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "#eef7f1", color: "#1B4332" }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mini KPI ── */
function MiniKPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#f9faf2" }}>
      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
        {label}
      </div>
      <div
        className="text-sm font-extrabold"
        style={{ color: color || "#012d1d", fontFamily: "Assistant" }}
      >
        {value}
      </div>
    </div>
  );
}
