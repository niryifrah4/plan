-- =============================================================================
-- Verdant Ledger · Initial Schema
-- Multi-tenant financial planning DB (Supabase / PostgreSQL)
-- =============================================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- ENUMs ----------
create type planner_role       as enum ('advisor','admin','viewer');
create type household_stage    as enum ('onboarding','actuals','planning','active');
create type tx_kind             as enum ('income','expense');
create type tx_cat_group        as enum ('income','fixed','variable','installments');
create type asset_group         as enum ('liquid','investments','pension','realestate','other');
create type liability_group     as enum ('mortgage','loans','cc');
create type goal_track          as enum ('on','behind','at_risk');
create type task_severity       as enum ('low','medium','high');
create type task_status         as enum ('open','done','snoozed');

-- =============================================================================
-- 1. ADVISORS (Auth) & HOUSEHOLDS (Clients)
-- =============================================================================

-- Advisor profile (linked to auth.users)
create table public.advisors (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text        not null,
  email           text        not null unique,
  role            planner_role not null default 'advisor',
  created_at      timestamptz not null default now()
);

-- Client household (multi-tenant root)
create table public.households (
  id              uuid primary key default uuid_generate_v4(),
  advisor_id      uuid        not null references public.advisors(id) on delete cascade,
  family_name     text        not null,
  members_count   int         not null default 2 check (members_count > 0),
  stage           household_stage not null default 'onboarding',
  onboarded_at    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.households(advisor_id);

-- =============================================================================
-- 2. PROFILES — BDO onboarding questionnaire answers
-- =============================================================================
create table public.profiles (
  household_id    uuid primary key references public.households(id) on delete cascade,
  head_name       text,
  partner_name    text,
  kids_under_5    int  default 0,
  kids_6_17       int  default 0,
  occupation      text,
  net_salary      numeric(12,2),
  risk_appetite   text check (risk_appetite in ('low','medium','high')),
  notes           text,
  answered_at     timestamptz default now()
);

-- =============================================================================
-- 3. CASH FLOW — months + transactions (actuals) + budget plan (plan)
-- =============================================================================
create table public.cashflow_months (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  year            int  not null,
  month           int  not null check (month between 1 and 12),
  closed          boolean not null default false,
  closed_at       timestamptz,
  unique (household_id, year, month)
);
create index on public.cashflow_months(household_id);

create table public.cashflow_tx (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  month_id        uuid not null references public.cashflow_months(id) on delete cascade,
  kind            tx_kind        not null,
  cat_group       tx_cat_group   not null,
  category        text           not null, -- e.g. 'salary','housing','food'
  subcategory     text,
  merchant        text,
  amount          numeric(12,2)  not null check (amount >= 0),
  tx_date         date,
  source          text default 'manual', -- 'manual','scan','import'
  created_at      timestamptz default now()
);
create index on public.cashflow_tx(household_id);
create index on public.cashflow_tx(month_id);
create index on public.cashflow_tx(category);

-- Budget plan (planned vs actuals comparison)
create table public.budget_plan (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  category        text not null,
  cat_group       tx_cat_group not null,
  planned_monthly numeric(12,2) not null default 0,
  unique (household_id, category)
);
create index on public.budget_plan(household_id);

-- =============================================================================
-- 4. ASSETS & LIABILITIES — wealth map
-- =============================================================================
create table public.assets (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  asset_group     asset_group not null,
  name            text not null,
  balance         numeric(14,2) not null default 0,
  yield_annual_pct numeric(5,2),
  auto_sourced    boolean not null default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on public.assets(household_id);

create table public.liabilities (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  liability_group liability_group not null,
  name            text not null,
  balance         numeric(14,2) not null default 0,
  monthly_payment numeric(12,2) not null default 0,
  rate_pct        numeric(5,2)  not null default 0,
  prepay_fee      numeric(12,2) not null default 0,
  from_scanner    boolean not null default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on public.liabilities(household_id);

-- Loan amortization rows (scanner output)
create table public.loan_schedule (
  id              uuid primary key default uuid_generate_v4(),
  liability_id    uuid not null references public.liabilities(id) on delete cascade,
  payment_no      int  not null,
  principal       numeric(12,2) not null,
  interest        numeric(12,2) not null,
  balance_after   numeric(14,2) not null
);
create index on public.loan_schedule(liability_id);

-- =============================================================================
-- 5. GOALS — aspirational targets (e.g. bar-mitzvah trip, down payment, pension)
-- =============================================================================
create table public.goals (
  id                uuid primary key default uuid_generate_v4(),
  household_id      uuid not null references public.households(id) on delete cascade,
  name              text not null,
  target_amount     numeric(14,2) not null,
  target_date       date  not null,
  lump_today        numeric(14,2) not null default 0,
  monthly_contrib   numeric(12,2) not null default 0,
  instrument        text, -- 'kupat_gemel','etf','cash',...
  linked_asset_id   uuid references public.assets(id) on delete set null,
  track             goal_track not null default 'on',
  fv_projected      numeric(14,2),
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);
create index on public.goals(household_id);

-- =============================================================================
-- 6. TASKS — auto-generated recommendations
-- =============================================================================
create table public.tasks (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  rule_id         text not null, -- idempotency key per rule
  title           text not null,
  detail          text,
  severity        task_severity not null default 'medium',
  status          task_status   not null default 'open',
  cta_href        text,
  done_at         timestamptz,
  created_at      timestamptz default now(),
  unique (household_id, rule_id)
);
create index on public.tasks(household_id, status);

-- =============================================================================
-- 7. SCENARIOS — Toolbox comparisons (real estate vs compound, etc.)
-- =============================================================================
create table public.scenarios (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references public.households(id) on delete cascade,
  kind            text not null, -- 'realestate','compound','mortgage','consolidation'
  label           text not null,
  inputs_json     jsonb not null,
  outputs_json    jsonb not null,
  saved_at        timestamptz default now()
);
create index on public.scenarios(household_id, kind);

-- =============================================================================
-- 8. Timestamps auto-update trigger
-- =============================================================================
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger touch_households      before update on public.households    for each row execute function public.tg_touch_updated_at();
create trigger touch_assets          before update on public.assets        for each row execute function public.tg_touch_updated_at();
create trigger touch_liabilities     before update on public.liabilities   for each row execute function public.tg_touch_updated_at();
create trigger touch_goals           before update on public.goals         for each row execute function public.tg_touch_updated_at();
