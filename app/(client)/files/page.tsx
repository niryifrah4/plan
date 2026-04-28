"use client";

/**
 * /files — "קבצים במיפוי"
 *
 * Created 2026-04-28 by splitting /balance per Nir's brief: balance is
 * about WHAT YOU OWN (assets + accounts); files is about WHAT YOU UPLOADED
 * AND THE SYSTEM IS WORKING ON (bank statements, credit-card files, Mislaka,
 * pension PDFs).
 *
 * Two sections, no tabs — stacked top-to-bottom:
 *   1. Documents archive — every file uploaded, with status + provenance
 *   2. Mapping queue ("לא מופה") — transactions awaiting manual triage
 */

import { DocumentsTab } from "../balance/DocumentsTab";
import { UnmappedQueueTab } from "../balance/UnmappedQueueTab";

export default function FilesPage() {
  return (
    <div className="max-w-6xl mx-auto" dir="rtl">
      {/* Documents = master file list (banks/credit/Mislaka/PDFs).
          UnmappedQueueTab handles row-level triage of imported transactions. */}
      <DocumentsTab />

      <div className="mt-10 pt-6 border-t v-divider">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[20px] text-verdant-emerald">inbox</span>
          <h2 className="text-base font-extrabold text-verdant-ink">תור פענוח — לא מופה</h2>
        </div>
        <UnmappedQueueTab />
      </div>
    </div>
  );
}
