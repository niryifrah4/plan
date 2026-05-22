-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — Views must respect RLS (security_invoker = on)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Flagged by Supabase security advisor 2026-05-21:
-- Nine views inherited SECURITY DEFINER from Postgres' default view behaviour
-- (views run as their owner unless explicitly told otherwise). That meant a
-- `select * from v_securities_valued` via the authenticated/anon role would
-- return ALL households' securities — bypassing every RLS policy on the
-- underlying tables. Same data leak for net worth, pension, cashflow, audit.
--
-- Postgres 15+ supports `security_invoker = on` per-view so queries run as
-- the calling user. With this flag, the views inherit the RLS of the base
-- tables (`securities`, `pension_products`, `cashflow_months`, etc.) — which
-- IS already in place and correctly scoped via `owns_household()`.
--
-- This was applied to prod via MCP on 2026-05-21 and verified — the
-- "Security Definer View" advisor lint dropped from 9 ERRORs to 0.
-- ═══════════════════════════════════════════════════════════════════════════

alter view public.v_securities_valued    set (security_invoker = on);
alter view public.v_recent_audit         set (security_invoker = on);
alter view public.v_full_net_worth       set (security_invoker = on);
alter view public.v_net_worth            set (security_invoker = on);
alter view public.v_pension_summary      set (security_invoker = on);
alter view public.v_budget_vs_actual     set (security_invoker = on);
alter view public.v_actuals_by_category  set (security_invoker = on);
alter view public.v_cashflow_summary     set (security_invoker = on);
alter view public.v_risk_summary         set (security_invoker = on);
