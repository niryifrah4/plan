"use client";

/**
 * DocumentsTab — orchestrator for the "תחנת אימות מסמכים" flow.
 *
 * Phases:
 *   idle      → empty drop zone + upload zones + history
 *   uploading → spinner with per-file progress
 *   preview   → review parsed transactions (split: לבדיקה / מופה)
 *   saved     → success screen
 *
 * State + side-effects live here. Per-phase rendering is delegated to:
 *   - `_documents-tab/IdleView.tsx`
 *   - `_documents-tab/PreviewView.tsx`
 *   - `_documents-tab/SavedView.tsx`
 *
 * Storage layout (all scoped per household):
 *   • verdant:parsed_transactions — saved cashflow (accumulating)
 *   • verdant:doc_draft           — current in-flight review (auto-saved every change)
 *   • verdant:doc_history         — per-file upload log (last 50)
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { triggerFullSync, markUpdated } from "@/lib/sync-engine";
import type { ParsedDocument, ParsedTransaction } from "@/lib/doc-parser/types";
import { scopedKey } from "@/lib/client-scope";
import { isBusinessScopeEnabled, BUSINESS_SCOPE_EVENT } from "@/lib/business-scope";
import { CAT_OPTIONS, UNMAPPED_KEYS, CONFIDENCE_THRESHOLD } from "@/lib/documents-categories";
import {
  STORAGE_KEY,
  DRAFT_KEY,
  loadDocHistory,
  saveDocHistory,
  type DocHistoryEntry,
} from "@/lib/documents-store";
import { IdleView } from "./_documents-tab/IdleView";
import { PreviewView } from "./_documents-tab/PreviewView";
import { SavedView } from "./_documents-tab/SavedView";
import type { Scope } from "@/lib/scope-types";

type Phase = "idle" | "uploading" | "preview" | "saved";

export function DocumentsTab() {
  /* ── Phase + result of the latest parse ── */
  const [phase, setPhase] = useState<Phase>("idle");
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);

  /* ── Review-phase mutations layered on top of the parsed doc ── */
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [crossDupsSkipped, setCrossDupsSkipped] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, { key: string; label: string }>>({});
  const [scopeOverrides, setScopeOverrides] = useState<Record<number, Scope | undefined>>({});
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [expandedMappedCats, setExpandedMappedCats] = useState<Set<string>>(new Set());

  /* ── Sibling state from elsewhere in the app ── */
  const [docHistory, setDocHistory] = useState<DocHistoryEntry[]>([]);
  const [businessEnabled, setBusinessEnabled] = useState(false);

  /* ── Business-scope toggle: listen for changes elsewhere in the app ── */
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

  /* ── Draft auto-save whenever doc/overrides/deletes change in preview phase ── */
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

  /* ── Split into review / mapped, sort א-ת ──
     Review = anything the user should touch: unmapped categories OR low-confidence.
     Mapped = confident + categorized. One simple binary. */
  const { toReview, mapped, mappedGroups } = useMemo(() => {
    const toReview: (ParsedTransaction & { _idx: number })[] = [];
    const mapped: (ParsedTransaction & { _idx: number })[] = [];
    for (const t of effectiveTx) {
      const isOverridden = !!overrides[t._idx];
      const isUnmapped = UNMAPPED_KEYS.has(t.category);
      const isLowConf =
        !isOverridden && typeof t.confidence === "number" && t.confidence < CONFIDENCE_THRESHOLD;
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
      const tx = doc.transactions[idx];
      const desc = tx?.description;
      if (desc) {
        learnOverride(desc, newKey);
        // Full audit trail — old category + when + source. Feeds the AI
        // categorizer as a learning example later.
        const { recordCorrection } = await import("@/lib/doc-parser/correction-history");
        recordCorrection(desc, tx.category, newKey, "user");
      }
    },
    [doc, deletedIndices]
  );

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
      // Merge detected financial instruments into persistent storage AND
      // auto-link them into AccountsTab so the user never has to add a
      // bank/credit card by hand — uploading is enough.
      if (parsed.instruments && parsed.instruments.length > 0) {
        const { mergeAndSaveInstruments } = await import("@/lib/doc-parser/instruments");
        mergeAndSaveInstruments(parsed.instruments);
        const { syncInstrumentsToAccounts } = await import("@/lib/accounts-sync");
        syncInstrumentsToAccounts();
      }
      setPhase("preview");
    } catch {
      setUploadProgress(null);
      setError("שגיאה בהעלאת הקבצים. נסה שוב.");
      setPhase("idle");
    }
  }, []);

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
            .replace(/["‏‎]/g, "")
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
        // Persist detected instruments from the new file as well + auto-link
        if (added.instruments && added.instruments.length > 0) {
          const { mergeAndSaveInstruments } = await import("@/lib/doc-parser/instruments");
          mergeAndSaveInstruments(added.instruments);
          const { syncInstrumentsToAccounts } = await import("@/lib/accounts-sync");
          syncInstrumentsToAccounts();
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
          .replace(/["‏‎]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 20);
        return `${t.date || ""}|${amt}|${supplier}`;
      };
      const existingKeys = new Set(existing.map(keyOf));
      let crossDupsSkippedLocal = 0;
      const fresh = txToSave.filter((t) => {
        if (existingKeys.has(keyOf(t))) {
          crossDupsSkippedLocal++;
          return false;
        }
        return true;
      });
      localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify([...existing, ...fresh]));
      setCrossDupsSkipped(crossDupsSkippedLocal);

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
        crossDupsSkipped: crossDupsSkippedLocal > 0 ? crossDupsSkippedLocal : undefined,
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

  /* ── Reset everything back to idle ── */
  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setDoc(null);
    setOverrides({});
    setScopeOverrides({});
    setDeletedIndices(new Set());
    try {
      localStorage.removeItem(scopedKey(DRAFT_KEY));
    } catch {}
  }, []);

  /* ── Remove a history entry (doesn't delete transactions, just the record) ── */
  const handleRemoveHistory = useCallback((id: string) => {
    const next = loadDocHistory().filter((h) => h.id !== id);
    saveDocHistory(next);
    setDocHistory(next);
  }, []);

  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="mx-auto max-w-5xl" dir="rtl">
      <PageHeader
        subtitle="Parsing Station · תחנת אימות"
        title="תחנת אימות מסמכים"
        description="העלאה, זיהוי אוטומטי ואישור של תנועות פיננסיות — בנק, אשראי, לוחות סילוקין ומסלקה פנסיונית"
      />

      {(phase === "idle" || phase === "uploading") && (
        <IdleView
          phase={phase}
          error={error}
          onClearError={() => {
            setError("");
            setPhase("idle");
          }}
          uploadProgress={uploadProgress}
          docHistory={docHistory}
          onFiles={uploadFiles}
          onRemoveHistory={handleRemoveHistory}
        />
      )}

      {phase === "preview" && doc && (
        <PreviewView
          doc={doc}
          effectiveTx={effectiveTx}
          toReview={toReview}
          mapped={mapped}
          mappedGroups={mappedGroups}
          deletedIndicesSize={deletedIndices.size}
          overrideCount={overrideCount}
          duplicatesRemoved={duplicatesRemoved}
          expandedMappedCats={expandedMappedCats}
          businessEnabled={businessEnabled}
          onAppendFiles={appendFiles}
          onCategoryChange={handleCategoryChange}
          onDelete={handleDelete}
          onToggleBusiness={toggleRowBusiness}
          onToggleMappedCat={toggleMappedCat}
          onCancel={resetToIdle}
          onSave={handleTransfer}
        />
      )}

      {phase === "saved" && doc && (
        <SavedView
          effectiveTxCount={effectiveTx.length}
          crossDupsSkipped={crossDupsSkipped}
          duplicatesRemoved={duplicatesRemoved}
          overrideCount={overrideCount}
          onUploadAnother={resetToIdle}
        />
      )}
    </div>
  );
}
