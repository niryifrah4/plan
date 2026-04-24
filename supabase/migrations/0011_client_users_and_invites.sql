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
