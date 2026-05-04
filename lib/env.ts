/**
 * ═══════════════════════════════════════════════════════════
 *  Env validation — זיהוי מוקדם של קונפיגורציה חסרה
 * ═══════════════════════════════════════════════════════════
 *
 * Soft validation — מדפיס אזהרה במקום לקרוס, כדי שמצב דמו
 * (ללא Supabase) עדיין יעבוד בפיתוח.
 */

type EnvCheck = {
  ok: boolean;
  missing: string[];
  warnings: string[];
};

const CLIENT_REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

const SERVER_REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function check(keys: readonly string[]): EnvCheck {
  const missing: string[] = [];
  const warnings: string[] = [];
  for (const k of keys) {
    const v = process.env[k];
    if (!v) missing.push(k);
    else if (v.includes("YOUR-PROJECT") || v.startsWith("replace-")) warnings.push(k);
  }
  return { ok: missing.length === 0 && warnings.length === 0, missing, warnings };
}

export function validateClientEnv(): EnvCheck {
  return check(CLIENT_REQUIRED);
}

export function validateServerEnv(): EnvCheck {
  return check(SERVER_REQUIRED);
}

/** הדפסת אזהרה בבוט השרת — לא זורק, לא מפיל. */
export function logEnvStatus(): void {
  if (typeof window !== "undefined") return; // server only
  const c = validateServerEnv();
  if (c.ok) {
    // eslint-disable-next-line no-console
    console.log("[env] ✓ כל המשתנים הנדרשים קיימים");
    return;
  }
  if (c.missing.length) {
    // eslint-disable-next-line no-console
    console.warn(`[env] ⚠ משתנים חסרים: ${c.missing.join(", ")} — מצב דמו פעיל.`);
  }
  if (c.warnings.length) {
    // eslint-disable-next-line no-console
    console.warn(`[env] ⚠ משתנים עם ערכי placeholder: ${c.warnings.join(", ")}`);
  }
}

export function isProductionReady(): boolean {
  return validateServerEnv().ok;
}
