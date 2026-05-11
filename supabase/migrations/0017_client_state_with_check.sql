-- 0017 — add WITH CHECK to client_state client policy
--
-- Per security audit 2026-05-11: the client policy added in 0015 was
-- declared with USING only, no WITH CHECK clause. USING gates SELECT
-- and the row-as-it-exists side of UPDATE/DELETE; WITH CHECK gates the
-- row-as-it-will-be side of INSERT/UPDATE. Without WITH CHECK, a
-- malicious client_user could craft an INSERT/UPDATE whose payload
-- household_id points at a household they do NOT belong to, and the
-- row would be persisted under that foreign tenant.
--
-- The advisor policy (tightened in 0014) already has WITH CHECK; this
-- migration brings the client policy to the same standard. Idempotent
-- via DROP POLICY IF EXISTS.

DROP POLICY IF EXISTS "client_user_owns_state" ON public.client_state;

CREATE POLICY "client_user_owns_state" ON public.client_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.household_id = client_state.household_id
        AND cu.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.household_id = client_state.household_id
        AND cu.user_id = auth.uid()
    )
  );
