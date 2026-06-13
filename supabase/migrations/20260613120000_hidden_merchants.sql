-- =============================================================================
-- Hidden merchants — two-layer "hide this business?" model
-- =============================================================================
--   Layer 1: hidden_merchant_overrides — per-household client decisions.
--            "For THIS client, hide / show merchant X." Client decision wins.
--   Layer 2: hidden_merchants_catalog  — system-wide default-hide catalog,
--            advisor-editable (e.g. internal transfers, Bit, loan repayments).
--
-- Same shape and security model as the subscriptions tables. A hidden merchant
-- is dropped from the unmapped-mapping queue and from cashflow, but its
-- transactions stay in storage for full provenance.
-- =============================================================================

-- ── Layer 1: per-household client decisions ─────────────────────────────────
create table if not exists public.hidden_merchant_overrides (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  normalized_key text not null,
  aliases        text[] not null default '{}',
  decision       text not null check (decision in ('hidden', 'visible')),
  label          text,
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (household_id, normalized_key)
);

create index if not exists hidden_merchant_overrides_household_idx
  on public.hidden_merchant_overrides(household_id);
create index if not exists hidden_merchant_overrides_key_idx
  on public.hidden_merchant_overrides(normalized_key);

alter table public.hidden_merchant_overrides enable row level security;

drop policy if exists "advisor_owns_hidden_overrides" on public.hidden_merchant_overrides;
create policy "advisor_owns_hidden_overrides" on public.hidden_merchant_overrides
  for all using (
    exists (
      select 1 from public.households h
      where h.id = hidden_merchant_overrides.household_id
        and h.advisor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.households h
      where h.id = hidden_merchant_overrides.household_id
        and h.advisor_id = auth.uid()
    )
  );

-- ── Layer 2: system-wide catalog ────────────────────────────────────────────
create table if not exists public.hidden_merchants_catalog (
  id              uuid primary key default gen_random_uuid(),
  normalized_key  text not null unique,
  aliases         text[] not null default '{}',
  is_hidden       boolean not null default true,
  label           text,
  learn_count     integer not null default 0,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

create index if not exists hidden_merchants_catalog_key_idx
  on public.hidden_merchants_catalog(normalized_key);

alter table public.hidden_merchants_catalog enable row level security;

drop policy if exists "hidden_catalog_select_auth" on public.hidden_merchants_catalog;
create policy "hidden_catalog_select_auth" on public.hidden_merchants_catalog
  for select using (auth.uid() is not null);

drop policy if exists "hidden_catalog_write_advisor" on public.hidden_merchants_catalog;
create policy "hidden_catalog_write_advisor" on public.hidden_merchants_catalog
  for all using (
    exists (select 1 from public.advisors a where a.id = auth.uid())
  )
  with check (
    exists (select 1 from public.advisors a where a.id = auth.uid())
  );

-- ── Auto-touch updated_at (reuse the shared trigger fn from subscriptions) ───
drop trigger if exists tg_hidden_overrides_touch on public.hidden_merchant_overrides;
create trigger tg_hidden_overrides_touch
  before update on public.hidden_merchant_overrides
  for each row execute function public.tg_subscriptions_touch();

drop trigger if exists tg_hidden_catalog_touch on public.hidden_merchants_catalog;
create trigger tg_hidden_catalog_touch
  before update on public.hidden_merchants_catalog
  for each row execute function public.tg_subscriptions_touch();

-- ── Learning aggregation (PII-free, advisor-gated) ──────────────────────────
create or replace function public.hidden_merchant_learning_suggestions()
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
      select 1 from public.hidden_merchants_catalog m
      where m.normalized_key = o.normalized_key
    )                                                   as in_catalog
  from public.hidden_merchant_overrides o
  where o.decision = 'hidden'
    and exists (select 1 from public.advisors a where a.id = auth.uid())
  group by o.normalized_key
  order by count(*) desc;
$$;

revoke all on function public.hidden_merchant_learning_suggestions() from public;
grant execute on function public.hidden_merchant_learning_suggestions() to authenticated;

-- ── Advisor visibility overrides: clients who chose to show catalog-hidden merchants ──
create or replace function public.hidden_merchant_visible_clients()
returns table (
  normalized_key text,
  household_id   uuid,
  family_name    text,
  label          text,
  updated_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.normalized_key,
    h.id as household_id,
    h.family_name,
    coalesce(o.label, o.normalized_key) as label,
    o.updated_at
  from public.hidden_merchant_overrides o
  join public.households h on h.id = o.household_id
  where o.decision = 'visible'
    and h.advisor_id = auth.uid()
  order by o.updated_at desc;
$$;

revoke all on function public.hidden_merchant_visible_clients() from public;
grant execute on function public.hidden_merchant_visible_clients() to authenticated;
