-- Security hardening: future objects must not inherit broad authenticated grants.
-- Existing table grants remain intentionally unchanged until per-table matrix is
-- verified in staging. This prevents new tables/functions from silently widening
-- the public database surface.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
