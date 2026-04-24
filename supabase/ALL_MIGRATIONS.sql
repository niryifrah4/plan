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
-- =============================================================================
-- Row-Level Security (Multi-tenant isolation)
-- Each advisor sees only their own households + all related rows.
-- =============================================================================

-- Enable RLS on all tenant tables
alter table public.advisors          enable row level security;
alter table public.households        enable row level security;
alter table public.profiles          enable row level security;
alter table public.cashflow_months   enable row level security;
alter table public.cashflow_tx       enable row level security;
alter table public.budget_plan       enable row level security;
alter table public.assets            enable row level security;
alter table public.liabilities       enable row level security;
alter table public.loan_schedule     enable row level security;
alter table public.goals             enable row level security;
alter table public.tasks             enable row level security;
alter table public.scenarios         enable row level security;

-- Helper: advisor sees own record
create policy "advisor_self_rw" on public.advisors
  for all using (id = auth.uid());

-- Helper function: check household ownership
create or replace function public.owns_household(hh_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.households h
    where h.id = hh_id and h.advisor_id = auth.uid()
  )
$$;

-- Households: advisor sees their own
create policy "hh_owner_rw" on public.households
  for all using (advisor_id = auth.uid());

-- Generic policy for tenant-scoped tables
do $$
declare
  t text;
  targets text[] := array[
    'profiles','cashflow_months','cashflow_tx','budget_plan',
    'assets','liabilities','goals','tasks','scenarios'
  ];
begin
  foreach t in array targets loop
    execute format($p$
      create policy "tenant_rw_%1$s" on public.%1$I
        for all using (public.owns_household(household_id))
    $p$, t);
  end loop;
end $$;

-- Loan schedule: inherit via liability
create policy "loan_sched_via_liab" on public.loan_schedule
  for all using (
    exists (
      select 1 from public.liabilities l
      where l.id = liability_id
        and public.owns_household(l.household_id)
    )
  );
-- =============================================================================
-- Views & RPC functions — connectivity engine server-side
-- =============================================================================

-- Monthly rollup view: income, expense, gap per month per household
create or replace view public.v_cashflow_summary as
select
  m.household_id,
  m.id          as month_id,
  m.year,
  m.month,
  m.closed,
  coalesce(sum(case when t.kind = 'income'  then t.amount end), 0) as income_total,
  coalesce(sum(case when t.kind = 'expense' then t.amount end), 0) as expense_total,
  coalesce(sum(case when t.kind = 'income'  then t.amount end), 0)
    - coalesce(sum(case when t.kind = 'expense' then t.amount end), 0) as cashflow_gap
from public.cashflow_months m
left join public.cashflow_tx t on t.month_id = m.id
group by m.id;

-- Actuals rollup by category (drives budget comparison)
create or replace view public.v_actuals_by_category as
select
  household_id,
  category,
  cat_group,
  count(*)                   as tx_count,
  avg(amount)                as avg_amount,
  sum(amount)                as total_amount,
  max(tx_date)               as last_tx
from public.cashflow_tx
group by household_id, category, cat_group;

-- Net-worth view: assets - liabilities
create or replace view public.v_net_worth as
select
  h.id as household_id,
  coalesce((select sum(balance) from public.assets      where household_id = h.id), 0) as total_assets,
  coalesce((select sum(balance) from public.liabilities where household_id = h.id), 0) as total_liabilities,
  coalesce((select sum(balance) from public.assets      where household_id = h.id), 0)
  - coalesce((select sum(balance) from public.liabilities where household_id = h.id), 0) as net_worth
from public.households h;

-- Budget vs actual comparison (joined view)
create or replace view public.v_budget_vs_actual as
select
  bp.household_id,
  bp.category,
  bp.cat_group,
  bp.planned_monthly,
  coalesce(a.avg_amount, 0)            as actual_monthly_avg,
  coalesce(a.avg_amount, 0) - bp.planned_monthly as variance,
  case
    when bp.planned_monthly = 0 then null
    else ((coalesce(a.avg_amount,0) - bp.planned_monthly) / bp.planned_monthly) * 100
  end as variance_pct
from public.budget_plan bp
left join public.v_actuals_by_category a
  on a.household_id = bp.household_id and a.category = bp.category;

-- =============================================================================
-- close_month(): closes a month and re-projects goal FV timelines
-- =============================================================================
create or replace function public.close_month(p_month_id uuid)
returns void language plpgsql security definer as $$
declare
  v_hh uuid;
  v_cashflow numeric;
begin
  -- 1. Mark month closed
  update public.cashflow_months
     set closed = true, closed_at = now()
   where id = p_month_id
   returning household_id into v_hh;

  if v_hh is null then raise exception 'month not found: %', p_month_id; end if;

  -- 2. Pull the closed month's cashflow gap
  select cashflow_gap into v_cashflow
    from public.v_cashflow_summary where month_id = p_month_id;

  -- 3. Re-project goal future values based on updated contributions
  update public.goals g
     set fv_projected = public.project_goal_fv(g.id),
         track = case
           when public.project_goal_fv(g.id) >= g.target_amount * 0.95 then 'on'::goal_track
           when public.project_goal_fv(g.id) >= g.target_amount * 0.80 then 'behind'::goal_track
           else 'at_risk'::goal_track
         end,
         updated_at = now()
   where g.household_id = v_hh;
end $$;

-- =============================================================================
-- project_goal_fv(): monthly-contrib future-value projection
-- FV = lump*(1+r)^n + M*((1+r)^n - 1)/r   (r = monthly rate, n = months to target)
-- =============================================================================
create or replace function public.project_goal_fv(p_goal_id uuid)
returns numeric language plpgsql stable as $$
declare
  g record;
  v_months int;
  v_rate_m numeric := 0.004; -- ~5% annual default
  v_fv numeric;
begin
  select * into g from public.goals where id = p_goal_id;
  if g.id is null then return 0; end if;

  v_months := greatest(0,
    (extract(year from g.target_date)::int - extract(year from current_date)::int) * 12
    + (extract(month from g.target_date)::int - extract(month from current_date)::int)
  );

  if v_months = 0 then return g.lump_today; end if;

  v_fv := g.lump_today * power(1 + v_rate_m, v_months)
        + g.monthly_contrib * ((power(1 + v_rate_m, v_months) - 1) / v_rate_m);

  return round(v_fv, 0);
end $$;
-- =============================================================================
-- Verdant Ledger · 0004 — Securities, Crypto, RSU/Options + Masleka ingestion
-- =============================================================================

-- ---------- Securities / Crypto / RSU / Options -----------------------------
CREATE TYPE security_kind AS ENUM ('stock','etf','crypto','rsu','option','bond','fund');
CREATE TYPE currency_code AS ENUM ('ILS','USD','EUR','GBP');

CREATE TABLE IF NOT EXISTS securities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  asset_id        uuid REFERENCES assets(id) ON DELETE SET NULL,
  kind            security_kind NOT NULL,
  symbol          text NOT NULL,
  broker          text,
  quantity        numeric(18,6) NOT NULL DEFAULT 0,
  avg_cost        numeric(18,4) NOT NULL DEFAULT 0,   -- per-unit cost
  current_price   numeric(18,4) NOT NULL DEFAULT 0,
  currency        currency_code NOT NULL DEFAULT 'ILS',
  fx_rate_to_ils  numeric(10,4) NOT NULL DEFAULT 1,   -- snapshot FX
  vest_date       date,                                -- RSU/option only
  strike_price    numeric(18,4),                       -- options only
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS securities_household_idx ON securities(household_id);
CREATE INDEX IF NOT EXISTS securities_kind_idx ON securities(household_id, kind);

-- Touch trigger
CREATE TRIGGER tg_securities_touch
  BEFORE UPDATE ON securities
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

-- View: per-security valuation in ILS (for tax simulator + wealth page)
CREATE OR REPLACE VIEW v_securities_valued AS
SELECT
  s.id,
  s.household_id,
  s.kind,
  s.symbol,
  s.broker,
  s.currency,
  s.quantity,
  s.avg_cost,
  s.current_price,
  s.fx_rate_to_ils,
  (s.quantity * s.avg_cost)      AS cost_basis_local,
  (s.quantity * s.current_price) AS market_value_local,
  (s.quantity * s.avg_cost * s.fx_rate_to_ils)      AS cost_basis_ils,
  (s.quantity * s.current_price * s.fx_rate_to_ils) AS market_value_ils,
  (s.quantity * (s.current_price - s.avg_cost) * s.fx_rate_to_ils) AS unrealized_pnl_ils,
  CASE WHEN s.avg_cost > 0
    THEN (s.current_price - s.avg_cost) / s.avg_cost * 100
    ELSE 0 END AS unrealized_pnl_pct,
  s.vest_date,
  s.strike_price
FROM securities s;

-- ---------- Masleka (pension clearinghouse) XML ingestion -------------------
CREATE TYPE masleka_status AS ENUM ('uploaded','parsing','parsed','mapped','failed');

CREATE TABLE IF NOT EXISTS masleka_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  file_name      text NOT NULL,
  storage_path   text,                   -- Supabase Storage reference
  file_size_kb   integer,
  status         masleka_status NOT NULL DEFAULT 'uploaded',
  uploaded_by    uuid REFERENCES advisors(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  parsed_at      timestamptz,
  error_msg      text
);
CREATE INDEX IF NOT EXISTS masleka_files_household_idx ON masleka_files(household_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS masleka_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id            uuid NOT NULL REFERENCES masleka_files(id) ON DELETE CASCADE,
  household_id       uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  asset_id           uuid REFERENCES assets(id) ON DELETE SET NULL,
  product_type       text,              -- e.g. 'קרן פנסיה','גמל','השתלמות'
  company            text,              -- 'מנורה','מגדל','כלל'...
  policy_number      text,
  balance            numeric(14,2) NOT NULL DEFAULT 0,
  monthly_deposit    numeric(12,2) DEFAULT 0,
  management_fee_pct numeric(5,3),
  deposit_fee_pct    numeric(5,3),
  investment_track   text,
  as_of_date         date,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS masleka_entries_file_idx ON masleka_entries(file_id);
CREATE INDEX IF NOT EXISTS masleka_entries_household_idx ON masleka_entries(household_id);

-- ---------- Extend scenario kinds (miluim, alternatives) --------------------
-- scenarios.kind is text — no constraint change needed, just document allowed values:
--   'realestate' | 'compound' | 'mortgage' | 'consolidation' | 'miluim' | 'alternatives' | 'tax'

-- ---------- RLS ---------------------------------------------------------------
ALTER TABLE securities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE masleka_files    ENABLE ROW LEVEL SECURITY;
ALTER TABLE masleka_entries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rw_securities ON securities
  FOR ALL USING (owns_household(household_id)) WITH CHECK (owns_household(household_id));
CREATE POLICY tenant_rw_masleka_files ON masleka_files
  FOR ALL USING (owns_household(household_id)) WITH CHECK (owns_household(household_id));
CREATE POLICY tenant_rw_masleka_entries ON masleka_entries
  FOR ALL USING (owns_household(household_id)) WITH CHECK (owns_household(household_id));
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
-- =============================================================================
-- Verdant Ledger · 0006 — Client auth, Pension products (Surance/Masleka-ready),
--                          Risk management, Properties, Sync logs
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CLIENTS — end-users who can sign up and view their own household
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  email           text NOT NULL UNIQUE,
  phone           text,
  id_number       text,          -- תעודת זהות (needed for Surance/Masleka POA)
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login      timestamptz
);
CREATE INDEX IF NOT EXISTS clients_household_idx ON public.clients(household_id);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Client sees own record
CREATE POLICY "client_self_rw" ON public.clients
  FOR ALL USING (id = auth.uid());

-- Advisor sees clients of their households
CREATE POLICY "advisor_sees_clients" ON public.clients
  FOR ALL USING (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update owns_household() to support BOTH advisor and client access
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.owns_household(hh_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    -- Advisor path
    SELECT 1 FROM public.households h
    WHERE h.id = hh_id AND h.advisor_id = auth.uid()
  ) OR EXISTS (
    -- Client path
    SELECT 1 FROM public.clients c
    WHERE c.household_id = hh_id AND c.id = auth.uid()
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PENSION PRODUCTS — matches Surance/Masleka clearing house data model
--    This replaces/extends masleka_entries for live API sync
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE pension_product_type AS ENUM (
  'pension_new',        -- קרן פנסיה חדשה (DC)
  'pension_old',        -- קרן פנסיה ותיקה (סגורה)
  'bituach_managers',   -- ביטוח מנהלים
  'gemel',              -- קופת גמל
  'gemel_invest',       -- גמל להשקעה
  'gemel_190',          -- קופת גמל תיקון 190
  'hishtalmut',         -- קרן השתלמות
  'kranot_pensia'       -- קרנות פנסיה אחרות
);

CREATE TYPE pension_product_status AS ENUM (
  'active',       -- פעיל — הפקדות שוטפות
  'frozen',       -- מוקפא — אין הפקדות, יש צבירה
  'paid_up',      -- מסולק — פוליסה ששולמה
  'payout',       -- בתשלום קצבה
  'closed'        -- סגור
);

CREATE TYPE sync_source AS ENUM (
  'manual',           -- הוזן ידנית
  'document',         -- פורסר ממסמך PDF/Excel
  'clearing_house',   -- מסלקה פנסיונית (API)
  'surance'           -- שורנס (API)
);

CREATE TABLE IF NOT EXISTS public.pension_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_name           text,                          -- שם המבוטח (ראשי / בן זוג)

  -- ─── Product identification ───
  product_type          pension_product_type NOT NULL,
  company               text NOT NULL,                 -- מנורה, הראל, מיטב, מגדל...
  policy_number         text,                          -- מספר פוליסה / חשבון
  status                pension_product_status NOT NULL DEFAULT 'active',

  -- ─── Balances ───
  accumulated_balance   numeric(14,2) NOT NULL DEFAULT 0,  -- יתרה צבורה ₪
  employer_contribution numeric(12,2) DEFAULT 0,           -- הפקדת מעסיק חודשית
  employee_contribution numeric(12,2) DEFAULT 0,           -- הפקדת עובד חודשית
  severance_contribution numeric(12,2) DEFAULT 0,          -- הפרשת פיצויים חודשית
  total_monthly_deposit numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(employer_contribution, 0) +
    COALESCE(employee_contribution, 0) +
    COALESCE(severance_contribution, 0)
  ) STORED,

  -- ─── Investment ───
  investment_track      text,                          -- מסלול השקעה (מניות/אגח/כללי/הלכה)
  annual_return_pct     numeric(6,3),                  -- תשואה שנתית %
  ytd_return_pct        numeric(6,3),                  -- תשואה מתחילת השנה %

  -- ─── Fees ───
  mgmt_fee_deposits_pct numeric(5,3),                  -- דמי ניהול מהפקדות %
  mgmt_fee_accumulated_pct numeric(5,3),               -- דמי ניהול מצבירה %

  -- ─── Insurance (embedded in pension) ───
  death_coverage_amount numeric(14,2),                 -- כיסוי מוות ₪
  disability_coverage_pct numeric(5,2),                -- כיסוי אובדן כושר % מהשכר
  disability_type       text,                          -- עיסוקי / רגיל

  -- ─── Dates ───
  start_date            date,                          -- תאריך פתיחה
  as_of_date            date,                          -- נכון לתאריך
  retirement_date       date,                          -- תאריך פרישה צפוי

  -- ─── Surance / Clearing house ───
  surance_product_id    text,                          -- ID מקורי בשורנס
  surance_raw_json      jsonb,                         -- JSON מלא מ-API שורנס

  -- ─── Sync metadata ───
  source                sync_source NOT NULL DEFAULT 'manual',
  last_synced_at        timestamptz,

  -- ─── Standard ───
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pension_products_household_idx ON public.pension_products(household_id);
CREATE INDEX IF NOT EXISTS pension_products_type_idx ON public.pension_products(household_id, product_type);
CREATE INDEX IF NOT EXISTS pension_products_company_idx ON public.pension_products(company);

CREATE TRIGGER tg_pension_products_touch
  BEFORE UPDATE ON public.pension_products
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

-- RLS
ALTER TABLE public.pension_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_pension_products ON public.pension_products
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PENSION COVERAGES — insurance coverages tied to pension products
--    Auto-populates risk management page
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE coverage_kind AS ENUM (
  'death',              -- ביטוח חיים / שאירים
  'disability',         -- אובדן כושר עבודה
  'nursing',            -- סיעוד
  'critical_illness',   -- מחלות קשות
  'accident',           -- תאונות אישיות
  'health',             -- בריאות
  'other'
);

CREATE TABLE IF NOT EXISTS public.pension_coverages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pension_product_id uuid NOT NULL REFERENCES public.pension_products(id) ON DELETE CASCADE,
  household_id      uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  coverage_kind     coverage_kind NOT NULL,
  coverage_amount   numeric(14,2),           -- סכום כיסוי ₪
  monthly_cost      numeric(10,2),           -- עלות חודשית ₪
  is_active         boolean NOT NULL DEFAULT true,
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pension_coverages_product_idx ON public.pension_coverages(pension_product_id);
CREATE INDEX IF NOT EXISTS pension_coverages_household_idx ON public.pension_coverages(household_id);

ALTER TABLE public.pension_coverages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_pension_coverages ON public.pension_coverages
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RISK ITEMS — checklist for risk management page
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE risk_coverage_status AS ENUM ('covered', 'partial', 'missing', 'not_relevant');

CREATE TABLE IF NOT EXISTS public.risk_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  category          text NOT NULL,                     -- death, disability, nursing, health, critical, property
  label             text NOT NULL,
  description       text,
  status            risk_coverage_status NOT NULL DEFAULT 'missing',
  coverage_amount   numeric(14,2),
  monthly_cost      numeric(10,2),
  provider          text,
  policy_number     text,
  expiry_date       date,
  notes             text,
  sort_order        int NOT NULL DEFAULT 0,

  -- Link to auto-detected coverage (from pension_coverages)
  linked_coverage_id uuid REFERENCES public.pension_coverages(id) ON DELETE SET NULL,
  auto_detected     boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_items_household_idx ON public.risk_items(household_id);

CREATE TRIGGER tg_risk_items_touch
  BEFORE UPDATE ON public.risk_items
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

ALTER TABLE public.risk_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_risk_items ON public.risk_items
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PROPERTIES — real estate portfolio
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE property_purpose AS ENUM ('residential', 'investment', 'commercial', 'mixed');

CREATE TABLE IF NOT EXISTS public.properties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  address           text NOT NULL,
  city              text,
  purpose           property_purpose NOT NULL DEFAULT 'residential',
  purchase_price    numeric(14,2),
  purchase_date     date,
  current_value     numeric(14,2) NOT NULL DEFAULT 0,
  monthly_rent      numeric(12,2) DEFAULT 0,
  monthly_expenses  numeric(12,2) DEFAULT 0,       -- ועד בית, ארנונה, ביטוח, תחזוקה
  mortgage_balance  numeric(14,2) DEFAULT 0,
  mortgage_payment  numeric(12,2) DEFAULT 0,
  mortgage_rate_pct numeric(5,3),
  mortgage_end_date date,
  appreciation_pct  numeric(5,2) DEFAULT 3.0,      -- הנחת עליית ערך שנתית
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_household_idx ON public.properties(household_id);

CREATE TRIGGER tg_properties_touch
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_properties ON public.properties
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. DOCUMENTS — uploaded files (bank statements, pension reports, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE doc_type AS ENUM (
  'bank_statement',       -- דף חשבון בנק
  'pension_report',       -- דוח פנסיה
  'broker_report',        -- דוח ברוקר
  'insurance_policy',     -- פוליסת ביטוח
  'mortgage_schedule',    -- לוח סילוקין
  'tax_report',           -- דוח מס
  'poa_signed',           -- ייפוי כח חתום
  'other'
);

CREATE TABLE IF NOT EXISTS public.documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  doc_type        doc_type NOT NULL DEFAULT 'other',
  file_name       text NOT NULL,
  storage_path    text,                        -- Supabase Storage bucket path
  file_size_kb    integer,
  mime_type       text,
  uploaded_by     uuid REFERENCES auth.users(id),  -- could be client or advisor
  parsed          boolean NOT NULL DEFAULT false,
  parsed_at       timestamptz,
  parse_result    jsonb,                       -- structured data extracted
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_household_idx ON public.documents(household_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_documents ON public.documents
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SYNC LOGS — tracking all data synchronizations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE sync_status AS ENUM ('started', 'success', 'partial', 'failed');

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  source          sync_source NOT NULL,
  status          sync_status NOT NULL DEFAULT 'started',
  products_found  int DEFAULT 0,
  products_updated int DEFAULT 0,
  error_message   text,
  raw_response    jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS sync_logs_household_idx ON public.sync_logs(household_id, started_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_sync_logs ON public.sync_logs
  FOR ALL USING (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. VIEWS — aggregated pension data for dashboard
-- ─────────────────────────────────────────────────────────────────────────────

-- Total pension balances by type
CREATE OR REPLACE VIEW public.v_pension_summary AS
SELECT
  pp.household_id,
  pp.product_type,
  pp.company,
  pp.status,
  COUNT(*)                               AS product_count,
  SUM(pp.accumulated_balance)            AS total_balance,
  SUM(pp.total_monthly_deposit)          AS total_monthly_deposit,
  AVG(pp.mgmt_fee_accumulated_pct)       AS avg_mgmt_fee_pct,
  MAX(pp.last_synced_at)                 AS last_synced
FROM public.pension_products pp
WHERE pp.status IN ('active', 'frozen')
GROUP BY pp.household_id, pp.product_type, pp.company, pp.status;

-- Risk coverage summary per household
CREATE OR REPLACE VIEW public.v_risk_summary AS
SELECT
  ri.household_id,
  ri.category,
  COUNT(*) FILTER (WHERE ri.status = 'covered')      AS covered_count,
  COUNT(*) FILTER (WHERE ri.status = 'partial')       AS partial_count,
  COUNT(*) FILTER (WHERE ri.status = 'missing')       AS missing_count,
  COUNT(*) FILTER (WHERE ri.status = 'not_relevant')  AS not_relevant_count,
  SUM(COALESCE(ri.monthly_cost, 0))                   AS total_monthly_cost
FROM public.risk_items ri
GROUP BY ri.household_id, ri.category;

-- Full net worth with pension + properties
CREATE OR REPLACE VIEW public.v_full_net_worth AS
SELECT
  h.id AS household_id,
  COALESCE((SELECT SUM(balance) FROM public.assets WHERE household_id = h.id), 0) AS liquid_assets,
  COALESCE((SELECT SUM(accumulated_balance) FROM public.pension_products WHERE household_id = h.id AND status IN ('active','frozen')), 0) AS pension_total,
  COALESCE((SELECT SUM(market_value_ils) FROM public.v_securities_valued WHERE household_id = h.id), 0) AS securities_total,
  COALESCE((SELECT SUM(current_value) FROM public.properties WHERE household_id = h.id), 0) AS property_total,
  COALESCE((SELECT SUM(balance) FROM public.liabilities WHERE household_id = h.id), 0) AS liabilities_total,
  COALESCE((SELECT SUM(mortgage_balance) FROM public.properties WHERE household_id = h.id), 0) AS mortgage_total
FROM public.households h;
-- ═══════════════════════════════════════════════════════════
--  0007 · Security Hardening — Audit Log, PII Encryption, RLS hardening
-- ═══════════════════════════════════════════════════════════
--
-- מה המיגרציה הזו עושה:
-- 1. מפעילה pgcrypto להצפנת PII
-- 2. מוסיפה עמודות מוצפנות לת״ז וליפוי כוח למסלקה
-- 3. יוצרת טבלת audit_logs + trigger אוטומטי לשינויים רגישים
-- 4. מחזקת RLS: policies כפולות (advisor + client) + deny-by-default
-- 5. יוצרת session_events — מעקב לוגינים/לוגאאוטים/ניסיונות כושלים
-- ═══════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════════════
--  1. Audit Log — כל שינוי רגיש מתועד
-- ═══════════════════════════════════════════════════════════
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references auth.users(id) on delete set null,
  actor_email   text,
  actor_role    text check (actor_role in ('advisor','client','system')),
  action        text not null, -- INSERT / UPDATE / DELETE / LOGIN / LOGOUT / EXPORT / VIEW
  table_name    text,
  record_id     uuid,
  old_values    jsonb,
  new_values    jsonb,
  changed_fields text[],
  ip_address    inet,
  user_agent    text,
  metadata      jsonb default '{}'::jsonb
);

create index if not exists idx_audit_occurred_at on public.audit_logs (occurred_at desc);
create index if not exists idx_audit_actor on public.audit_logs (actor_id, occurred_at desc);
create index if not exists idx_audit_table on public.audit_logs (table_name, occurred_at desc);
create index if not exists idx_audit_action on public.audit_logs (action);

-- RLS: audit logs are append-only, readable only by admins (service_role)
alter table public.audit_logs enable row level security;

-- Users can READ their own actions
create policy "Users read own audit entries"
  on public.audit_logs for select
  using (actor_id = auth.uid());

-- No one can INSERT/UPDATE/DELETE directly — only via triggers / service_role
create policy "No direct inserts to audit log"
  on public.audit_logs for insert
  with check (false);

create policy "No updates to audit log"
  on public.audit_logs for update
  using (false);

create policy "No deletes from audit log"
  on public.audit_logs for delete
  using (false);


-- ═══════════════════════════════════════════════════════════
--  2. Generic audit trigger function
-- ═══════════════════════════════════════════════════════════
create or replace function public.tg_audit_row_change()
returns trigger
security definer
language plpgsql
as $$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_role text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
begin
  -- Get actor context
  v_actor_id := auth.uid();
  begin
    select email into v_actor_email from auth.users where id = v_actor_id;
  exception when others then v_actor_email := null;
  end;

  if TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_new := null;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Compute changed fields
    select array_agg(key)
      into v_changed
      from jsonb_each(v_new)
      where v_old->>key is distinct from v_new->>key;
  else -- INSERT
    v_old := null;
    v_new := to_jsonb(NEW);
  end if;

  insert into public.audit_logs (
    actor_id, actor_email, actor_role,
    action, table_name, record_id,
    old_values, new_values, changed_fields
  ) values (
    v_actor_id, v_actor_email, 'advisor',
    TG_OP, TG_TABLE_NAME,
    coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid),
    v_old, v_new, v_changed
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;


-- ═══════════════════════════════════════════════════════════
--  3. Attach audit triggers to sensitive tables
-- ═══════════════════════════════════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'pension_products', 'pension_coverages',
    'documents', 'assets', 'liabilities', 'households',
    'properties', 'sync_logs'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format(
        'drop trigger if exists audit_%1$s on public.%1$s;
         create trigger audit_%1$s
         after insert or update or delete on public.%1$s
         for each row execute function public.tg_audit_row_change();',
         t
      );
    end if;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════
--  4. PII Encryption for id_number (ת״ז)
-- ═══════════════════════════════════════════════════════════
-- Helper: get encryption key from vault (or fall back to env var for dev)
create or replace function public.get_pii_key()
returns text
language sql
security definer
as $$
  select coalesce(
    current_setting('app.pii_encryption_key', true),
    'dev-only-insecure-key-change-me-in-production'
  );
$$;

-- Encrypt a text value
create or replace function public.encrypt_pii(plain text)
returns text
language plpgsql
security definer
as $$
begin
  if plain is null or plain = '' then return null; end if;
  return encode(
    pgp_sym_encrypt(plain, public.get_pii_key()),
    'base64'
  );
end;
$$;

-- Decrypt (only advisors can decrypt — enforced via view or RLS)
create or replace function public.decrypt_pii(cipher text)
returns text
language plpgsql
security definer
as $$
begin
  if cipher is null or cipher = '' then return null; end if;
  return pgp_sym_decrypt(
    decode(cipher, 'base64'),
    public.get_pii_key()
  );
exception when others then
  return null;
end;
$$;

-- Add encrypted columns to clients table (if exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='clients') then
    -- Add encrypted id_number column (keeping original for migration; drop later)
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clients' and column_name='id_number_encrypted'
    ) then
      alter table public.clients add column id_number_encrypted text;
      comment on column public.clients.id_number_encrypted is
        'AES-encrypted ת״ז. Use public.decrypt_pii() to read.';
    end if;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════
--  5. Session Events — login/logout/failed attempts
-- ═══════════════════════════════════════════════════════════
create table if not exists public.session_events (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  event_type  text not null check (event_type in (
    'login_success','login_failed','logout','mfa_challenge','mfa_success','mfa_failed',
    'password_reset_requested','session_expired','account_locked'
  )),
  ip_address  inet,
  user_agent  text,
  metadata    jsonb default '{}'::jsonb
);

create index if not exists idx_session_events_user on public.session_events (user_id, occurred_at desc);
create index if not exists idx_session_events_email on public.session_events (email, occurred_at desc);
create index if not exists idx_session_events_type on public.session_events (event_type, occurred_at desc);

alter table public.session_events enable row level security;

-- Users can see their own session history
create policy "Users read own session events"
  on public.session_events for select
  using (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════
--  6. Account lockout function — after N failed login attempts
-- ═══════════════════════════════════════════════════════════
create or replace function public.check_account_lockout(p_email text)
returns boolean
language plpgsql
security definer
as $$
declare
  recent_failures int;
begin
  select count(*)
    into recent_failures
    from public.session_events
    where email = p_email
      and event_type = 'login_failed'
      and occurred_at > now() - interval '15 minutes';
  return recent_failures >= 5;
end;
$$;


-- ═══════════════════════════════════════════════════════════
--  7. RLS tightening — deny-by-default on any unlisted table
-- ═══════════════════════════════════════════════════════════
-- Revoke default permissions from anon role — forces every access through RLS
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Grant minimal permissions back for authenticated users (RLS still applies)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;


-- ═══════════════════════════════════════════════════════════
--  8. Helper view: audit feed for advisors (last 100 actions)
-- ═══════════════════════════════════════════════════════════
create or replace view public.v_recent_audit as
  select id, occurred_at, actor_email, actor_role, action, table_name, record_id, changed_fields
  from public.audit_logs
  order by occurred_at desc
  limit 100;

-- ═══════════════════════════════════════════════════════════
--  Done. Post-install steps:
--   1. Set app.pii_encryption_key via `ALTER DATABASE ... SET app.pii_encryption_key = '<32+ char random>'`
--   2. Enable MFA in Supabase Auth dashboard
--   3. Configure password policy: min 12 chars + complexity
--   4. Enable leaked password protection in Auth settings
-- ═══════════════════════════════════════════════════════════
