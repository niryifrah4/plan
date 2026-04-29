-- 0015 — extend client_state RLS to cover client_users
--
-- Per security audit 2026-04-29: the original 0009 policy only allowed
-- advisors (households.advisor_id) to read/write client_state. After
-- 0011 introduced client_users (clients log in with their own email),
-- those clients silently get 403 when their pages try to write state,
-- and their localStorage never syncs to remote.
--
-- This migration adds a parallel policy: a logged-in client_user can
-- read/write rows for the household they belong to. Idempotent — the
-- DROP POLICY IF EXISTS guard makes re-runs safe.

DROP POLICY IF EXISTS "client_user_owns_state" ON public.client_state;

CREATE POLICY "client_user_owns_state" ON public.client_state
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.household_id = client_state.household_id
        AND cu.user_id = auth.uid()
    )
  );
