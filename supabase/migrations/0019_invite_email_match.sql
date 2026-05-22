-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Invite token must match the signup email (security hardening)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Closes the gap flagged by security-agent on 2026-05-19:
-- the previous `handle_new_auth_user()` trigger consumed any valid token
-- regardless of which email signed up. So a leaked / forwarded invite link
-- could be redeemed by an attacker with a completely different email, and
-- they'd be linked to the household as a client_user.
--
-- Fix: when an invite_token is present in raw_user_meta_data, require
-- `NEW.email = client_invites.email` to consume it. If the emails don't
-- match, fall through to the self-signup path (Path 3) — the user still
-- gets an account but is NOT auto-linked to the household.
--
-- This mirrors how Supabase's own `inviteUserByEmail` flow works: the
-- email on the invite IS the email of the resulting auth user. Breaking
-- that linkage was always wrong, just not enforced at the DB layer.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- ── Path 1: Invite-based signup ────────────────────────────────────────
  -- 2026-05-21 — added `and lower(email) = lower(NEW.email)` so a stolen
  -- token can't link a different email to the household.
  v_token := NEW.raw_user_meta_data->>'invite_token';
  if v_token is not null then
    select * into v_invite
    from public.client_invites
    where token = v_token
      and consumed_at is null
      and expires_at > now()
      and lower(email) = lower(NEW.email);

    if found then
      insert into public.client_users (user_id, household_id, full_name, email)
      values (NEW.id, v_invite.household_id, v_name, NEW.email)
      on conflict (user_id) do nothing;

      update public.client_invites
        set consumed_at = now()
        where token = v_token;

      return NEW;
    end if;
    -- Invalid token / expired / EMAIL MISMATCH → fall through to self-signup.
    -- The attacker would still create an auth user, but they'd land on the
    -- generic self-signup path and get their own empty household, not the
    -- victim's household.
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

  -- ── Path 3: Self-signup (default) — paste from 0016 untouched ──────────
  -- Find the "system" advisor (Nir) to attach the household to. This is
  -- the first advisor row by created_at — assumes single-advisor mode for
  -- the B2C course flow.
  select id into v_system_advisor from public.advisors order by created_at asc limit 1;

  if v_system_advisor is not null then
    insert into public.households (advisor_id, family_name, members_count, stage, signup_source)
    values (v_system_advisor, coalesce(v_name, 'משפחה'), 2, 'onboarding', 'self_signup')
    returning id into v_hh_id;

    insert into public.profiles (household_id, head_name)
    values (v_hh_id, v_name)
    on conflict (household_id) do nothing;

    insert into public.client_users (user_id, household_id, full_name, email)
    values (NEW.id, v_hh_id, v_name, NEW.email)
    on conflict (user_id) do nothing;
  end if;

  return NEW;
end;
$$;

-- Recreate the trigger only if it doesn't already exist (no-op if 0011
-- already wired it up).
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_auth_user();
  end if;
end$$;

comment on function public.handle_new_auth_user is
  'Auth trigger — links new auth.users to households. Invite path requires '
  'email match (0019, security hardening). Falls back to self-signup if no '
  'token or token+email mismatch.';
