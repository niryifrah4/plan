-- 0014 — extra hardening on client_state RLS + indexes
--
-- The original 0009 created the table + a policy for advisors. After
-- 0011 introduced client_users, the security audit (2026-04-29) flagged:
--
--  1. Missing index on (household_id, state_key) — selects scan the table.
--  2. Policy uses USING but not WITH CHECK — INSERTs bypass household scope.
--  3. service_role bypasses RLS by design; ensure the table doesn't grant
--     public/anon access through any leftover policy.
--
-- 0015 will add the parallel client_users policy. This migration is the
-- step before that — making sure the foundation is sound.

-- 1. Composite index for the dominant access pattern
create unique index if not exists client_state_hh_key_idx
  on public.client_state(household_id, state_key);

-- 2. Add WITH CHECK to the existing advisor policy so INSERT/UPDATE
--    payloads can't write rows pointing at a different household.
drop policy if exists "advisor_owns_state" on public.client_state;

create policy "advisor_owns_state" on public.client_state
  for all
  using (
    exists (
      select 1 from public.households h
      where h.id = client_state.household_id
        and h.advisor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.households h
      where h.id = client_state.household_id
        and h.advisor_id = auth.uid()
    )
  );

-- 3. Belt-and-braces: revoke any public/anon grant. RLS still blocks them
--    via the policies, but explicit revoke prevents future accidents.
revoke all on public.client_state from public;
revoke all on public.client_state from anon;
grant select, insert, update, delete on public.client_state to authenticated;
