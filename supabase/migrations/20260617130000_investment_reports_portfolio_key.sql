-- =============================================================================
-- Investment reports — one current snapshot per portfolio
-- =============================================================================
--   A household can hold several portfolios across several brokers. A portfolio
--   is identified by (household_id, broker, account_number). Uploading a newer
--   statement for the same portfolio REPLACES the previous snapshot (the app
--   guards on report_date so an older upload can't clobber a newer one).
--
--   report_date is the statement "as of" date ("מצב חשבונך ליום") — the
--   relevant timestamp for each portfolio.
-- =============================================================================

-- Normalize identity columns so the unique key treats "no account" consistently
-- (Postgres unique indexes treat NULLs as distinct, which would allow dupes).
update public.investment_reports set broker = coalesce(broker, '');
update public.investment_reports set account_number = coalesce(account_number, '');

alter table public.investment_reports alter column broker set default '';
alter table public.investment_reports alter column broker set not null;
alter table public.investment_reports alter column account_number set default '';
alter table public.investment_reports alter column account_number set not null;

-- One current snapshot per portfolio.
create unique index if not exists investment_reports_portfolio_key
  on public.investment_reports(household_id, broker, account_number);
