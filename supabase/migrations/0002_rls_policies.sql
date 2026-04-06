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
