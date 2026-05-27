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
    <div className="mx-auto max-w-6xl" dir="rtl">
      {/* Documents = master file list (banks/credit/Mislaka/PDFs).
          UnmappedQueueTab handles row-level triage of imported transactions. */}
      <DocumentsTab />

      <div className="mt-10 border-t pt-6">
        <UnmappedQueueTab />
      </div>
    </div>
  );
}
