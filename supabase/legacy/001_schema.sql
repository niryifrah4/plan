-- ═══════════════════════════════════════════════════════════════════
-- Verdant Plan — Full Schema
-- Run this in your Supabase SQL Editor to set up all tables.
-- ═══════════════════════════════════════════════════════════════════

-- Advisors (planners)
create table if not exists advisors (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  created_at timestamptz default now()
);

-- Leads (prospects)
create table if not exists leads (
  id bigint generated always as identity primary key,
  advisor_id uuid references advisors(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  source text default 'אתר',
  status text default 'new' check (status in ('new','in_progress','not_relevant','converted')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Lead follow-ups / notes
create table if not exists lead_follow_ups (
  id bigint generated always as identity primary key,
  lead_id bigint references leads(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

-- Clients (converted leads / families)
create table if not exists clients (
  id bigint generated always as identity primary key,
  advisor_id uuid references advisors(id) on delete cascade,
  family_name text not null,
  members_count int default 1,
  step int default 0,
  total_steps int default 3,
  risk_profile text default '—',
  joined_at timestamptz default now(),
  converted_from_lead bigint references leads(id),
  gcal_connected boolean default false,
  updated_at timestamptz default now()
);

-- Onboarding questionnaire (per client)
create table if not exists onboarding (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete cascade unique,
  fields jsonb default '{}',
  children jsonb default '[]',
  assets jsonb default '[]',
  liabilities jsonb default '[]',
  insurance jsonb default '[]',
  goals jsonb default '[]',
  completed boolean default false,
  updated_at timestamptz default now()
);

-- Assets (per client)
create table if not exists assets (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete cascade,
  asset_group text not null, -- liquid, realestate, pension, investments
  label text not null,
  balance numeric default 0,
  updated_at timestamptz default now()
);

-- Liabilities (per client)
create table if not exists liabilities (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete cascade,
  type text not null,
  lender text,
  balance numeric default 0,
  rate numeric default 0,
  monthly_payment numeric default 0,
  amortization_schedule jsonb, -- scanned payment schedule
  updated_at timestamptz default now()
);

-- Cashflow records (per client, per month)
create table if not exists cashflow (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete cascade,
  month text not null, -- "2026-04"
  income numeric default 0,
  expense numeric default 0,
  cashflow_gap numeric generated always as (income - expense) stored,
  updated_at timestamptz default now(),
  unique(client_id, month)
);

-- Tasks / recommendations
create table if not exists tasks (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete cascade,
  text text not null,
  severity text default 'medium' check (severity in ('low','medium','high')),
  status text default 'open' check (status in ('open','done','dismissed')),
  created_at timestamptz default now()
);

-- Goals
create table if not exists goals (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete cascade,
  name text not null,
  target_amount numeric default 0,
  target_date date,
  fv_projected numeric default 0,
  updated_at timestamptz default now()
);

-- Advisor calendar (meetings)
create table if not exists meetings (
  id bigint generated always as identity primary key,
  advisor_id uuid references advisors(id) on delete cascade,
  client_id bigint references clients(id),
  client_name text,
  meeting_type text,
  date date not null,
  time time not null,
  duration int default 60,
  gcal_event_id text, -- Google Calendar sync
  created_at timestamptz default now()
);

-- Advisor-level tasks (daily to-do)
create table if not exists advisor_tasks (
  id bigint generated always as identity primary key,
  advisor_id uuid references advisors(id) on delete cascade,
  text text not null,
  client_name text,
  due_date date not null,
  urgent boolean default false,
  done boolean default false,
  updated_at timestamptz default now()
);

-- App settings (per advisor)
create table if not exists advisor_settings (
  advisor_id uuid primary key references advisors(id) on delete cascade,
  gcal_connected boolean default false,
  gcal_refresh_token text,
  preferences jsonb default '{}',
  updated_at timestamptz default now()
);

-- Row-Level Security
alter table leads enable row level security;
alter table lead_follow_ups enable row level security;
alter table clients enable row level security;
alter table onboarding enable row level security;
alter table assets enable row level security;
alter table liabilities enable row level security;
alter table cashflow enable row level security;
alter table tasks enable row level security;
alter table goals enable row level security;
alter table meetings enable row level security;
alter table advisor_tasks enable row level security;
alter table advisor_settings enable row level security;

-- RLS Policies: advisor can only see own data
create policy "advisors_own_leads" on leads for all using (advisor_id = auth.uid());
create policy "advisors_own_clients" on clients for all using (advisor_id = auth.uid());
create policy "advisors_own_meetings" on meetings for all using (advisor_id = auth.uid());
create policy "advisors_own_tasks" on advisor_tasks for all using (advisor_id = auth.uid());
create policy "advisors_own_settings" on advisor_settings for all using (advisor_id = auth.uid());

-- Indexes
create index if not exists idx_leads_advisor on leads(advisor_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_clients_advisor on clients(advisor_id);
create index if not exists idx_meetings_date on meetings(date);
create index if not exists idx_cashflow_client on cashflow(client_id);
