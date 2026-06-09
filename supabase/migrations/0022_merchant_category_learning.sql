-- =============================================================================
-- Merchant category learning — shared across users
-- Stores every manual category confirmation for a merchant and derives the
-- current winner by weighted majority, then earliest first-seen tie-break.
-- =============================================================================

create table public.merchant_category_votes (
  id                 uuid primary key default uuid_generate_v4(),
  created_by         uuid not null references auth.users(id) on delete cascade,
  merchant_key       text not null,
  category_key       text not null,
  tx_count           int  not null default 1 check (tx_count > 0),
  sample_description text,
  source_file        text,
  created_at         timestamptz not null default now()
);

create index on public.merchant_category_votes(merchant_key);
create index on public.merchant_category_votes(category_key);
create index on public.merchant_category_votes(created_by);
create index on public.merchant_category_votes(created_at);

alter table public.merchant_category_votes enable row level security;

create policy "merchant_category_votes_select_auth" on public.merchant_category_votes
  for select using (auth.uid() is not null);

create policy "merchant_category_votes_insert_auth" on public.merchant_category_votes
  for insert with check (auth.uid() = created_by);

create or replace view public.v_merchant_category_rules as
with per_category as (
  select
    merchant_key,
    category_key,
    sum(tx_count)::int as count,
    min(created_at) as first_seen_at,
    max(created_at) as updated_at,
    min(sample_description) as sample_description
  from public.merchant_category_votes
  group by merchant_key, category_key
),
ranked as (
  select
    *,
    row_number() over (
      partition by merchant_key
      order by count desc, first_seen_at asc, category_key asc
    ) as rn
  from per_category
)
select
  merchant_key,
  category_key,
  count,
  first_seen_at,
  updated_at,
  sample_description
from ranked
where rn = 1;
