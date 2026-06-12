-- =============================================================================
-- 0023 — Client State versioning (optimistic concurrency)
-- =============================================================================
-- בעיה: client_state נדרס בכל שמירה (last-write-wins). שני טאבים פתוחים, או
-- יועץ ולקוח במקביל, מוחקים בשקט את שינויי האחד את השני.
--
-- פתרון: עמודת version + RPC אטומי. הלקוח שולח את הגרסה שהוא חושב שקיימת
-- (expected_version). אם בשרת כבר יש גרסה חדשה יותר — ה-RPC לא דורס, אלא
-- מחזיר conflict=true עם הגרסה והערך העדכניים, והלקוח מתמזג/מתריע.
--
-- תאימות לאחור: expected_version = NULL → התנהגות upsert ישנה (דריסה), כדי
-- שפריסה הדרגתית של הלקוח לא תישבר.

ALTER TABLE public.client_state
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.upsert_client_state(
  p_household uuid,
  p_key       text,
  p_value     jsonb,
  p_expected  bigint DEFAULT NULL
)
RETURNS TABLE(out_version bigint, out_value jsonb, out_conflict boolean)
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS עדיין חל: רק מי שמורשה ל-household יכול לכתוב
AS $$
DECLARE
  cur_version bigint;
  cur_value   jsonb;
BEGIN
  SELECT version, state_value INTO cur_version, cur_value
    FROM public.client_state
    WHERE household_id = p_household AND state_key = p_key;

  IF NOT FOUND THEN
    INSERT INTO public.client_state (household_id, state_key, state_value, version)
      VALUES (p_household, p_key, p_value, 1);
    RETURN QUERY SELECT 1::bigint, p_value, false;
    RETURN;
  END IF;

  -- קונפליקט: הלקוח עבד על גרסה ישנה.
  IF p_expected IS NOT NULL AND cur_version <> p_expected THEN
    RETURN QUERY SELECT cur_version, cur_value, true;
    RETURN;
  END IF;

  UPDATE public.client_state
    SET state_value = p_value, version = cur_version + 1
    WHERE household_id = p_household AND state_key = p_key;

  RETURN QUERY SELECT cur_version + 1, p_value, false;
END;
$$;
