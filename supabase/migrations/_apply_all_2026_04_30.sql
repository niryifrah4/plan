-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLED MIGRATION — 2026-04-30
-- Concatenation of 0011 → 0015. Paste-and-run in Supabase SQL Editor.
-- All statements idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────
-- 0011_client_users_and_invites.sql
-- ───────────────────────────────────────────────────────
-- =============================================================================
-- 0011 — Client users + invite flow
-- =============================================================================
-- Adds a second class of auth users (clients) alongside advisors.
--
--   advisors      — the financial planner (multi-tenant owner)
--   client_users  — the advisor's client, logs in with their own email
--   client_invites — pending invitation tokens an advisor sends by email
--
-- When someone signs up:
--   • If `raw_user_meta_data.invite_token` matches an open invite →
--     they become a CLIENT linked to that invite's household.
--   • Otherwise → they become an ADVISOR (self-signup path), and a
--     default household is seeded for them.
-- =============================================================================

-- ---------- Client users ----------
create table if not exists public.client_users (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  full_name     text,
  email         text,
  created_at    timestamptz not null default now()
);
create index if not exists client_users_household_idx on public.client_users(household_id);

-- ---------- Client invites ----------
create table if not exists public.client_invites (
  token         text primary key,
  advisor_id    uuid not null references public.advisors(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  email         text not null,
  created_at    timestamptz not null default now(),
  consumed_at   timestamptz,
  expires_at    timestamptz not null default (now() + interval '14 days')
);
create index if not exists client_invites_email_idx on public.client_invites(email);
create index if not exists client_invites_advisor_idx on public.client_invites(advisor_id);

-- =============================================================================
-- Rewritten auth trigger — handles BOTH advisor and client signups
-- =============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   text;
  v_invite  record;
  v_name    text;
  v_hh_id   uuid;
begin
  v_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- ── Client signup path ─────────────────────────────────────
  v_token := NEW.raw_user_meta_data->>'invite_token';
  if v_token is not null then
    select * into v_invite
    from public.client_invites
    where token = v_token
      and consumed_at is null
      and expires_at > now();

    if found then
      insert into public.client_users (user_id, household_id, full_name, email)
      values (NEW.id, v_invite.household_id, v_name, NEW.email)
      on conflict (user_id) do nothing;

      update public.client_invites
        set consumed_at = now()
        where token = v_token;

      return NEW;
    end if;
    -- Invalid / expired token → fall through to advisor path so the
    -- user still gets an account. Advisor can manually relink later.
  end if;

  -- ── Advisor signup path (default) ──────────────────────────
  insert into public.advisors (id, full_name, email, role)
  values (NEW.id, v_name, NEW.email, 'advisor')
  on conflict (id) do nothing;

  insert into public.households (advisor_id, family_name, members_count, stage)
  values (NEW.id, coalesce(v_name, 'משפחה'), 2, 'onboarding')
  returning id into v_hh_id;

  insert into public.profiles (household_id, head_name)
  values (v_hh_id, v_name)
  on conflict (household_id) do nothing;

  return NEW;
end;
$$;

-- Point the trigger at the new function (drop the old one first)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- Old name kept around? Drop if present — we use handle_new_auth_user now.
drop function if exists public.handle_new_advisor();

-- =============================================================================
-- RLS — let clients read their linked household + nested data
-- =============================================================================

alter table public.client_users     enable row level security;
alter table public.client_invites   enable row level security;

-- Client can read only their own mapping row
drop policy if exists "client_self_read" on public.client_users;
create policy "client_self_read" on public.client_users
  for select using (user_id = auth.uid());

-- Advisors can manage the mapping rows for their households
drop policy if exists "client_users_advisor_manage" on public.client_users;
create policy "client_users_advisor_manage" on public.client_users
  for all using (
    household_id in (select id from public.households where advisor_id = auth.uid())
  );

-- Invites: advisor manages their own
drop policy if exists "invites_advisor_rw" on public.client_invites;
create policy "invites_advisor_rw" on public.client_invites
  for all using (advisor_id = auth.uid());

-- ---------- Extend households access ----------
-- Advisor still has full read/write on their households.
-- Clients get SELECT on their linked household (UPDATE stays advisor-only).

drop policy if exists "hh_owner_rw" on public.households;
drop policy if exists "hh_advisor_rw" on public.households;
create policy "hh_advisor_rw" on public.households
  for all using (advisor_id = auth.uid());

drop policy if exists "hh_client_read" on public.households;
create policy "hh_client_read" on public.households
  for select using (
    id in (select household_id from public.client_users where user_id = auth.uid())
  );

-- ---------- Update owns_household() to cover clients too ----------
-- The generic tenant_rw policies on profiles/cashflow/assets/etc. all call
-- owns_household(). Extending this one function grants clients the same
-- read/write access to their own household's nested data — which is exactly
-- what we want (they can fill onboarding, enter transactions, etc.).

create or replace function public.owns_household(hh_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.households h
    where h.id = hh_id and h.advisor_id = auth.uid()
  )
  or exists (
    select 1 from public.client_users cu
    where cu.household_id = hh_id and cu.user_id = auth.uid()
  );
$$;


-- ───────────────────────────────────────────────────────
-- 0012_fix_client_policies_recursion.sql
-- ───────────────────────────────────────────────────────
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


-- ───────────────────────────────────────────────────────
-- 0013_security_definer_search_path.sql
-- ───────────────────────────────────────────────────────
-- 0013 — lock SECURITY DEFINER functions to a known search_path
--
-- Why: a SECURITY DEFINER function runs with the OWNER's privileges.
-- If search_path is unset, an attacker who can create a same-named
-- object in a writable schema (e.g. public) can hijack the function's
-- lookups. Postgres best practice is to pin search_path explicitly.
--
-- This migration is idempotent — re-running is a no-op.

-- handle_new_auth_user (defined in 0011)
alter function public.handle_new_auth_user()
  set search_path = pg_catalog, public;

-- Touch trigger for client_state.updated_at (defined in 0009)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_client_state_touch'
  ) then
    execute 'alter function public.tg_client_state_touch() set search_path = pg_catalog, public';
  end if;
end$$;

-- Any other SECURITY DEFINER fn in public — scan and lock down.
-- This guards against future drift; idempotent because alter is a no-op
-- when search_path is already correct.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, p.proname as func_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public',
      r.schema_name, r.func_name, r.args
    );
  end loop;
end$$;


-- ───────────────────────────────────────────────────────
-- 0014_client_state_rls_hardening.sql
-- ───────────────────────────────────────────────────────
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


-- ───────────────────────────────────────────────────────
-- 0015_client_state_for_clients.sql
-- ───────────────────────────────────────────────────────
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

