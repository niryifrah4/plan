-- =============================================================================
-- 0016 — Flip signup default: couples (households) by default, advisors by exception
-- =============================================================================
--
-- Context (2026-05-04):
--   The system was originally built advisor-first. Trigger 0011 made every
--   self-signup an advisor unless they had an `invite_token`. That blocked
--   the B2C course flow — couples buying the digital course need to register
--   themselves and land in /onboarding, not /crm.
--
-- New behavior:
--   1. Has `invite_token` (existing path, unchanged)
--        → client_user linked to advisor's household. Goes to /onboarding.
--   2. Has `signup_role = 'advisor'` in metadata (NEW, for admin creation)
--        → advisor + own household. Goes to /crm.
--   3. Default (NEW — what course buyers experience)
--        → household under the SYSTEM ADVISOR (oldest advisor in the system,
--          which is Nir) + client_user linked to it. Goes to /onboarding.
--          The new household is tagged signup_source='self_signup' so Nir's
--          CRM can filter "self-signup couples" vs "manually invited clients".
--   4. Bootstrap (no advisors exist yet — first user in a fresh DB)
--        → user becomes the first advisor. Same as the old default.
--          This protects clean installs (e.g. a fresh staging environment).
--
-- Existing users are NOT affected — trigger only runs on INSERT into auth.users.
-- This migration is safe to apply with users present.
-- =============================================================================

-- ── 1. Add signup_source column to households (idempotent) ───────────────
alter table public.households
  add column if not exists signup_source text not null default 'manual_invite'
  check (signup_source in ('manual_invite', 'self_signup', 'admin_signup'));

comment on column public.households.signup_source is
  'How this household was created: manual_invite (advisor invited via CRM), '
  'self_signup (course buyer registered themselves), '
  'admin_signup (advisor signed themselves up via ?admin=1 flag).';

create index if not exists households_signup_source_idx
  on public.households(signup_source);

-- ── 2. Rewrite the auth trigger function ─────────────────────────────────
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token            text;
  v_invite           record;
  v_name             text;
  v_hh_id            uuid;
  v_signup_role      text;
  v_system_advisor   uuid;
begin
  v_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- ── Path 1: Invite-based signup (existing flow, no change) ─────────────
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
    -- Invalid/expired token → fall through to self-signup path
  end if;

  -- ── Path 2: Explicit advisor signup (admin creation) ────────────────────
  v_signup_role := NEW.raw_user_meta_data->>'signup_role';
  if v_signup_role = 'advisor' then
    insert into public.advisors (id, full_name, email, role)
    values (NEW.id, v_name, NEW.email, 'advisor')
    on conflict (id) do nothing;

    insert into public.households (advisor_id, family_name, members_count, stage, signup_source)
    values (NEW.id, coalesce(v_name, 'משפחה'), 2, 'onboarding', 'admin_signup')
    returning id into v_hh_id;

    insert into public.profiles (household_id, head_name)
    values (v_hh_id, v_name)
    on conflict (household_id) do nothing;

    return NEW;
  end if;

  -- ── Path 3: Self-signup (course buyer) — DEFAULT ───────────────────────
  -- Find the system advisor: the oldest advisor in the system.
  -- This will be Nir on the production project.
  select id into v_system_advisor
  from public.advisors
  order by created_at asc
  limit 1;

  if v_system_advisor is not null then
    -- Normal self-signup: create household under the system advisor + client_user
    insert into public.households (advisor_id, family_name, members_count, stage, signup_source)
    values (v_system_advisor, coalesce(v_name, 'משפחה'), 2, 'onboarding', 'self_signup')
    returning id into v_hh_id;

    insert into public.profiles (household_id, head_name)
    values (v_hh_id, v_name)
    on conflict (household_id) do nothing;

    insert into public.client_users (user_id, household_id, full_name, email)
    values (NEW.id, v_hh_id, v_name, NEW.email)
    on conflict (user_id) do nothing;

    return NEW;
  end if;

  -- ── Path 4: Bootstrap (fresh DB — no advisors exist yet) ────────────────
  -- The very first user becomes the first advisor. Protects fresh installs
  -- (e.g. a new staging environment) from getting stuck with no advisor.
  insert into public.advisors (id, full_name, email, role)
  values (NEW.id, v_name, NEW.email, 'advisor')
  on conflict (id) do nothing;

  insert into public.households (advisor_id, family_name, members_count, stage, signup_source)
  values (NEW.id, coalesce(v_name, 'משפחה'), 2, 'onboarding', 'admin_signup')
  returning id into v_hh_id;

  insert into public.profiles (household_id, head_name)
  values (v_hh_id, v_name)
  on conflict (household_id) do nothing;

  return NEW;
end;
$$;

-- The trigger itself (on_auth_user_created) was created in 0011 / _apply_all
-- and points at handle_new_auth_user. Function replacement above is enough —
-- no need to touch the trigger.
