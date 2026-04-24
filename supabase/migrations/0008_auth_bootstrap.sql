-- =============================================================================
-- 0008 — Auth bootstrap: create public.advisors row on auth.users signup
-- =============================================================================
-- When a user signs up via Supabase Auth, automatically create a matching
-- row in public.advisors using the full_name from user_metadata.
-- Also creates a "demo" household for them so they can start immediately.

CREATE OR REPLACE FUNCTION public.handle_new_advisor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_hh_id uuid;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create advisor row (idempotent)
  INSERT INTO public.advisors (id, full_name, email, role)
  VALUES (NEW.id, v_name, NEW.email, 'advisor')
  ON CONFLICT (id) DO NOTHING;

  -- Create a first household for demo/testing
  INSERT INTO public.households (advisor_id, family_name, members_count, stage)
  VALUES (NEW.id, 'משפחת דמו', 2, 'onboarding')
  RETURNING id INTO v_hh_id;

  -- Seed an empty profile for it
  INSERT INTO public.profiles (household_id, head_name)
  VALUES (v_hh_id, v_name)
  ON CONFLICT (household_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Fire on new signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_advisor();
