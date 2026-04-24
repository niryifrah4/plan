-- ═══════════════════════════════════════════════════════════
--  Docs storage bucket + RLS policies for file uploads
-- ═══════════════════════════════════════════════════════════
-- Creates a private bucket `docs` and wires RLS on storage.objects
-- so each advisor can only access files under households they own
-- (path convention: <household_id>/<filename>).

INSERT INTO storage.buckets (id, name, public)
VALUES ('docs', 'docs', false)
ON CONFLICT (id) DO NOTHING;

-- Extract household_id from the first segment of storage path
-- Path convention enforced by lib/storage/file-storage.ts: "<household_id>/<timestamp>_<name>"

-- Drop existing policies if re-running (safe)
DROP POLICY IF EXISTS docs_select_own ON storage.objects;
DROP POLICY IF EXISTS docs_insert_own ON storage.objects;
DROP POLICY IF EXISTS docs_update_own ON storage.objects;
DROP POLICY IF EXISTS docs_delete_own ON storage.objects;

CREATE POLICY docs_select_own ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'docs'
    AND public.owns_household((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY docs_insert_own ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'docs'
    AND public.owns_household((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY docs_update_own ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'docs'
    AND public.owns_household((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY docs_delete_own ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'docs'
    AND public.owns_household((split_part(name, '/', 1))::uuid)
  );
