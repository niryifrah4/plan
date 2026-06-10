-- Security hardening:
-- These helper functions are used by RLS policies but do not need elevated privileges.
-- Switching them from SECURITY DEFINER to SECURITY INVOKER removes the "signed-in users
-- can execute SECURITY DEFINER function" warnings while preserving policy behavior.

alter function public.is_advisor_of(uuid) security invoker;
alter function public.is_advisor_of(uuid) set search_path = public;

alter function public.is_client_of(uuid) security invoker;
alter function public.is_client_of(uuid) set search_path = public;

alter function public.owns_household(uuid) security invoker;
alter function public.owns_household(uuid) set search_path = public;
