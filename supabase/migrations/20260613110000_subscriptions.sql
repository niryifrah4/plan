-- =============================================================================
-- Subscriptions — two-layer "is this a subscription?" model
-- =============================================================================
--   Layer 1: subscription_overrides  — per-household client decisions.
--            "For THIS client, merchant X is / is not a subscription."
--            Client decision always wins over the system catalog.
--   Layer 2: subscription_merchants  — system-wide catalog (advisor-editable).
--            "In general, merchant X is a subscription." Learned default.
--
-- Both keep a normalized key (the match key) plus an `aliases` array that
-- remembers every raw merchant name that maps to that key, so a single
-- decision covers "שופרסל סניף 42" and "שופרסל אקספרס" alike, and new
-- variants can join the same key over time.
-- =============================================================================

-- ── Layer 1: per-household client decisions ─────────────────────────────────
create table if not exists public.subscription_overrides (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  normalized_key text not null,
  aliases        text[] not null default '{}',
  decision       text not null check (decision in ('subscription', 'not_subscription')),
  label          text,
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (household_id, normalized_key)
);

create index if not exists subscription_overrides_household_idx
  on public.subscription_overrides(household_id);
create index if not exists subscription_overrides_key_idx
  on public.subscription_overrides(normalized_key);

alter table public.subscription_overrides enable row level security;

-- Advisor can CRUD the overrides of households they own (same pattern as
-- client_state). RLS keeps each client's decisions isolated.
drop policy if exists "advisor_owns_sub_overrides" on public.subscription_overrides;
create policy "advisor_owns_sub_overrides" on public.subscription_overrides
  for all using (
    exists (
      select 1 from public.households h
      where h.id = subscription_overrides.household_id
        and h.advisor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.households h
      where h.id = subscription_overrides.household_id
        and h.advisor_id = auth.uid()
    )
  );

-- ── Layer 2: system-wide catalog ────────────────────────────────────────────
create table if not exists public.subscription_merchants (
  id              uuid primary key default gen_random_uuid(),
  normalized_key  text not null unique,
  aliases         text[] not null default '{}',
  is_subscription boolean not null default true,
  label           text,
  learn_count     integer not null default 0,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

create index if not exists subscription_merchants_key_idx
  on public.subscription_merchants(normalized_key);

alter table public.subscription_merchants enable row level security;

-- Everyone authenticated can READ the catalog (drives the default during
-- transaction classification). Only advisors can WRITE it.
drop policy if exists "sub_merchants_select_auth" on public.subscription_merchants;
create policy "sub_merchants_select_auth" on public.subscription_merchants
  for select using (auth.uid() is not null);

drop policy if exists "sub_merchants_write_advisor" on public.subscription_merchants;
create policy "sub_merchants_write_advisor" on public.subscription_merchants
  for all using (
    exists (select 1 from public.advisors a where a.id = auth.uid())
  )
  with check (
    exists (select 1 from public.advisors a where a.id = auth.uid())
  );

-- ── Auto-touch updated_at on both tables ────────────────────────────────────
create or replace function public.tg_subscriptions_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tg_sub_overrides_touch on public.subscription_overrides;
create trigger tg_sub_overrides_touch
  before update on public.subscription_overrides
  for each row execute function public.tg_subscriptions_touch();

drop trigger if exists tg_sub_merchants_touch on public.subscription_merchants;
create trigger tg_sub_merchants_touch
  before update on public.subscription_merchants
  for each row execute function public.tg_subscriptions_touch();

-- ── Learning aggregation ────────────────────────────────────────────────────
-- Advisors need to see "how many clients across the whole system marked
-- merchant X as a subscription" to decide what to promote into the catalog.
-- RLS on subscription_overrides hides other advisors' households, so we expose
-- an aggregate-only, PII-free SECURITY DEFINER function: it returns just the
-- normalized key, a sample label, and a count — never which household.
create or replace function public.subscription_learning_suggestions()
returns table (
  normalized_key text,
  sample_label   text,
  client_count   bigint,
  in_catalog     boolean
)
language sql
security definer
set search_path = public
as $$
  select
    o.normalized_key,
    (array_agg(o.label order by o.updated_at desc))[1] as sample_label,
    count(*)                                            as client_count,
    exists (
      select 1 from public.subscription_merchants m
      where m.normalized_key = o.normalized_key
    )                                                   as in_catalog
  from public.subscription_overrides o
  where o.decision = 'subscription'
    -- caller must be an advisor; otherwise return nothing
    and exists (select 1 from public.advisors a where a.id = auth.uid())
  group by o.normalized_key
  order by count(*) desc;
$$;

revoke all on function public.subscription_learning_suggestions() from public;
grant execute on function public.subscription_learning_suggestions() to authenticated;
