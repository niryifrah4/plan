-- =============================================================================
-- Verdant Ledger · Financial Instruments Table
-- Stores detected bank accounts and credit cards per household.
-- =============================================================================

create type instrument_type as enum ('bank_account', 'credit_card');

create table public.client_instruments (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  type            instrument_type not null,
  institution     text not null,                 -- e.g. "בנק הפועלים", "ישראכרט"
  identifier      text not null,                 -- account number or last 4 digits
  label           text not null,                 -- display string
  source_file     text,                          -- filename that first detected this
  detected_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  -- Unique per household: same type + institution + identifier = same instrument
  unique (household_id, type, institution, identifier)
);

-- Index for fast lookup by household
create index idx_client_instruments_household on public.client_instruments(household_id);

-- RLS
alter table public.client_instruments enable row level security;

-- Advisors can see instruments for their households
create policy "advisors_read_instruments" on public.client_instruments
  for select using (
    household_id in (
      select id from public.households where advisor_id = auth.uid()
    )
  );

-- Advisors can insert instruments for their households
create policy "advisors_insert_instruments" on public.client_instruments
  for insert with check (
    household_id in (
      select id from public.households where advisor_id = auth.uid()
    )
  );

-- Advisors can delete instruments for their households
create policy "advisors_delete_instruments" on public.client_instruments
  for delete using (
    household_id in (
      select id from public.households where advisor_id = auth.uid()
    )
  );
