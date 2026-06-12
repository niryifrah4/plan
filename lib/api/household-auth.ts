/**
 * household-auth — בדיקת שייכות משתמש ל-household בצד השרת.
 *
 * רקע (defense in depth): routes שכותבים נתוני לקוח מקבלים householdId
 * מהדפדפן. כיום ההגנה היחידה מפני כתיבה ל-household של מישהו אחר היא
 * RLS על הטבלאות. מספיק policy אחד רופף בעתיד — או route שמשתמש
 * ב-service-role client שעוקף RLS — כדי לפתוח כתיבה חוצת-לקוחות.
 *
 * assertHouseholdAccess מוסיף מחסום שני בקוד עצמו: המשתמש מורשה אם הוא
 * חבר ה-household (client_users) או היועץ שלו (households.advisor_id).
 *
 * כלל פרויקט: כל route עם service-role client חייב לקרוא לזה לפני כתיבה
 * שמקבלת householdId מהלקוח.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertHouseholdAccess(
  sb: SupabaseClient,
  userId: string,
  householdId: string
): Promise<boolean> {
  if (!userId || !householdId) return false;

  // 1. חבר ה-household (לקוח).
  const { data: member } = await sb
    .from("client_users")
    .select("household_id")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (member?.household_id) return true;

  // 2. היועץ הבעלים של ה-household.
  const { data: owned } = await sb
    .from("households")
    .select("id")
    .eq("id", householdId)
    .eq("advisor_id", userId)
    .maybeSingle();
  return !!owned?.id;
}
