/**
 * ═══════════════════════════════════════════════════════════
 *  File Storage — Supabase Storage with documents table index
 * ═══════════════════════════════════════════════════════════
 *
 * Unified upload path for every file the user gives us:
 *   - Bank/credit PDFs, Excel statements
 *   - Pension XML (Maslaka) / PDF (annual report)
 *   - Property documents, insurance policies
 *
 * Flow:
 *   1. Upload bytes → Supabase Storage bucket "docs"
 *   2. Insert row into public.documents with {household_id, path, kind, ...}
 *   3. Parsers work from the stored file (or re-download signed URL)
 *
 * In demo mode (no Supabase): returns a mock "upload" that just keeps the
 * File object in memory so the in-page parsers still work.
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { getHouseholdId } from "@/lib/sync/remote-sync";

const BUCKET = "docs";

// Matches public.doc_type enum in supabase/migrations/0006
export type DocumentKind =
  | "bank_statement"
  | "pension_report"
  | "broker_report"
  | "insurance_policy"
  | "mortgage_schedule"
  | "tax_report"
  | "poa_signed"
  | "other";

export interface StoredDocument {
  id: string;
  path: string;
  name: string;
  size: number;
  kind: DocumentKind;
  uploadedAt: string;
  householdId: string;
  signedUrl?: string;
}

/**
 * Classify file by name + extension to a DocumentKind.
 * Used when user drops a file in the unified upload zone.
 */
export function classifyFile(name: string): DocumentKind {
  const n = name.toLowerCase();
  if (n.endsWith(".xml")) return "pension_report";
  if (n.includes("פנסי") || n.includes("דיוור") || n.includes("מסלקה")) return "pension_report";
  if (n.includes("משכנ") || n.includes("סילוק")) return "mortgage_schedule";
  if (n.includes("ביטוח") || n.includes("פוליס")) return "insurance_policy";
  if (n.includes("ברוקר") || n.includes("השקע")) return "broker_report";
  if (n.includes("מס ") || n.includes("דוח שנת")) return "tax_report";
  if (n.includes("בנק") || n.includes("עובר-ושב") || n.includes("עובר ושב") || n.includes("אשראי")) return "bank_statement";
  if (n.endsWith(".pdf")) return "bank_statement"; // best guess
  return "other";
}

/**
 * Upload a file to Supabase Storage and index it in the documents table.
 * Returns the stored document record or null on failure (never throws).
 */
export async function uploadFile(
  file: File,
  kind: DocumentKind = "other",
): Promise<StoredDocument | null> {
  if (!isSupabaseConfigured()) return null;
  const hh = getHouseholdId();
  if (!hh) return null;
  const sb = getSupabaseBrowser();
  if (!sb) return null;

  try {
    const safeName = file.name.replace(/[^\w\u0590-\u05FF.\-]/g, "_");
    const path = `${hh}/${Date.now()}_${safeName}`;

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) {
      console.warn("[storage] upload error:", upErr.message);
      return null;
    }

    const { data: doc, error: insErr } = await sb
      .from("documents")
      .insert({
        household_id: hh,
        storage_path: path,
        file_name: file.name,
        file_size_kb: Math.ceil(file.size / 1024),
        doc_type: kind,
        mime_type: file.type || null,
      })
      .select()
      .single();
    if (insErr) {
      console.warn("[storage] documents insert error:", insErr.message);
      return null;
    }

    return {
      id: doc.id,
      path,
      name: file.name,
      size: file.size,
      kind,
      uploadedAt: doc.created_at ?? new Date().toISOString(),
      householdId: hh,
    };
  } catch (e) {
    console.warn("[storage] uploadFile threw:", e);
    return null;
  }
}

/** List documents for the active household. */
export async function listDocuments(): Promise<StoredDocument[]> {
  if (!isSupabaseConfigured()) return [];
  const hh = getHouseholdId();
  if (!hh) return [];
  const sb = getSupabaseBrowser();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("documents")
      .select("id, storage_path, file_name, file_size_kb, doc_type, created_at")
      .eq("household_id", hh)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      path: r.storage_path,
      name: r.file_name,
      size: (r.file_size_kb ?? 0) * 1024,
      kind: r.doc_type,
      uploadedAt: r.created_at,
      householdId: hh,
    }));
  } catch {
    return [];
  }
}

/** Get a temporary signed URL to download a stored file. */
export async function getSignedUrl(path: string, seconds = 600): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, seconds);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Delete a document (file + row). */
export async function deleteDocument(doc: StoredDocument): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const sb = getSupabaseBrowser();
  if (!sb) return false;
  try {
    await sb.storage.from(BUCKET).remove([doc.path]);
    const { error } = await sb.from("documents").delete().eq("id", doc.id);
    return !error;
  } catch {
    return false;
  }
}
