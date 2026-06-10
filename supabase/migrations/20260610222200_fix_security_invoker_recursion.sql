-- Revert helper functions back to SECURITY DEFINER.
-- Setting them to SECURITY INVOKER caused an infinite recursion because
-- they query tables with RLS policies that in turn call these functions.

alter function public.is_advisor_of(uuid) security definer;
alter function public.is_client_of(uuid) security definer;
alter function public.owns_household(uuid) security definer;
