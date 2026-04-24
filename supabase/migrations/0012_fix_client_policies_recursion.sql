-- =============================================================================
-- 0012 — Fix infinite recursion between households ↔ client_users policies
-- =============================================================================
-- Problem:
--   households.hh_client_read  → queries client_users
--   client_users.advisor_manage → queries households
--   → infinite recursion
--
-- Fix:
--   Use SECURITY DEFINER helper functions that bypass RLS for the checks.
-- =============================================================================

-- Helper: is the current user an advisor owning this household?
create or replace function public.is_advisor_of(hh_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.households
    where id = hh_id and advisor_id = auth.uid()
  );
$$;

-- Helper: is the current user the client linked to this household?
create or replace function public.is_client_of(hh_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.client_users
    where household_id = hh_id and user_id = auth.uid()
  );
$$;

-- ─── Rebuild households policies ─────────────────────────────────────
drop policy if exists "hh_advisor_rw"   on public.households;
drop policy if exists "hh_client_read"  on public.households;
drop policy if exists "hh_owner_rw"     on public.households;

create policy "hh_advisor_rw" on public.households
  for all using (advisor_id = auth.uid());

create policy "hh_client_read" on public.households
  for select using (public.is_client_of(id));

-- ─── Rebuild client_users policies (no direct households lookup) ─────
drop policy if exists "client_self_read"           on public.client_users;
drop policy if exists "client_users_advisor_manage" on public.client_users;

create policy "client_self_read" on public.client_users
  for select using (user_id = auth.uid());

create policy "client_users_advisor_manage" on public.client_users
  for all using (public.is_advisor_of(household_id));
