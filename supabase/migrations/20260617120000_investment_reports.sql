-- =============================================================================
-- Investment broker reports — parsed holdings/transactions from a broker PDF
-- =============================================================================
--   A household uploads a PDF statement from their investment house (e.g. IBI),
--   the system decrypts it (password-protected files are supported), sends the
--   extracted text to Claude for structured analysis, and persists the parsed
--   result here. Only the *analyzed* data is stored — never the raw PDF.
--
--   `holdings` / `transactions` keep the full structured rows as JSONB so the
--   exact analyzed shape survives even as the parser evolves; the scalar
--   columns (broker, report_date, total_value_ils) are denormalized for cheap
--   listing/sorting.
-- =============================================================================

create table if not exists public.investment_reports (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  broker          text,
  account_number  text,
  report_date     date,
  currency        text not null default 'ILS',
  total_value_ils numeric,
  holdings        jsonb not null default '[]',
  transactions    jsonb not null default '[]',
  summary         jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists investment_reports_household_idx
  on public.investment_reports(household_id);
create index if not exists investment_reports_date_idx
  on public.investment_reports(household_id, report_date desc);

alter table public.investment_reports enable row level security;

-- Same access shape as client_state / blob sync: the advisor who owns the
-- household, or a client user who is a member of it, can read & write.
drop policy if exists "hh_access_investment_reports" on public.investment_reports;
create policy "hh_access_investment_reports" on public.investment_reports
  for all using (
    exists (
      select 1 from public.households h
      where h.id = investment_reports.household_id
        and h.advisor_id = auth.uid()
    )
    or exists (
      select 1 from public.client_users cu
      where cu.household_id = investment_reports.household_id
        and cu.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.households h
      where h.id = investment_reports.household_id
        and h.advisor_id = auth.uid()
    )
    or exists (
      select 1 from public.client_users cu
      where cu.household_id = investment_reports.household_id
        and cu.user_id = auth.uid()
    )
  );
