-- 0013 — lock SECURITY DEFINER functions to a known search_path
--
-- Why: a SECURITY DEFINER function runs with the OWNER's privileges.
-- If search_path is unset, an attacker who can create a same-named
-- object in a writable schema (e.g. public) can hijack the function's
-- lookups. Postgres best practice is to pin search_path explicitly.
--
-- This migration is idempotent — re-running is a no-op.

-- handle_new_auth_user (defined in 0011)
alter function public.handle_new_auth_user()
  set search_path = pg_catalog, public;

-- Touch trigger for client_state.updated_at (defined in 0009)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_client_state_touch'
  ) then
    execute 'alter function public.tg_client_state_touch() set search_path = pg_catalog, public';
  end if;
end$$;

-- Any other SECURITY DEFINER fn in public — scan and lock down.
-- This guards against future drift; idempotent because alter is a no-op
-- when search_path is already correct.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, p.proname as func_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public',
      r.schema_name, r.func_name, r.args
    );
  end loop;
end$$;
