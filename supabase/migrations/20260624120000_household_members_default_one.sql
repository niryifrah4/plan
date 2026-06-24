-- 2026-06-24 - Household member count starts as one person.
--
-- The family structure is now selected in onboarding, so new households should
-- not assume "2 family members" before the advisor/client explicitly chooses
-- whether the file is single, couple, or family with children.

alter table public.households
  alter column members_count set default 1;

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

  -- Path 1: Invite-based signup. Require token email to match auth email.
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
  end if;

  -- Path 2: Explicit advisor signup.
  v_signup_role := NEW.raw_user_meta_data->>'signup_role';
  if v_signup_role = 'advisor' then
    insert into public.advisors (id, full_name, email, role)
    values (NEW.id, v_name, NEW.email, 'advisor')
    on conflict (id) do nothing;

    insert into public.households (advisor_id, family_name, members_count, stage, signup_source)
    values (NEW.id, coalesce(v_name, 'משפחה'), 1, 'onboarding', 'admin_signup')
    returning id into v_hh_id;

    insert into public.profiles (household_id, head_name)
    values (v_hh_id, v_name)
    on conflict (household_id) do nothing;

    return NEW;
  end if;

  -- Path 3: Self-signup under the system advisor.
  select id into v_system_advisor from public.advisors order by created_at asc limit 1;

  if v_system_advisor is not null then
    insert into public.households (advisor_id, family_name, members_count, stage, signup_source)
    values (v_system_advisor, coalesce(v_name, 'משפחה'), 1, 'onboarding', 'self_signup')
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

comment on function public.handle_new_auth_user is
  'Auth trigger - links new auth.users to households. Invite path requires email match. New households default to one member until onboarding chooses family structure.';
