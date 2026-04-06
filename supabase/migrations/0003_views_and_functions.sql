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
