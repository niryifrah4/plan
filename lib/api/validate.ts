/**
 * validate — ולידציית גוף בקשה אחידה ל-API routes.
 *
 * רקע: אף route לא בדק קלט בצורה שיטתית. שדות נבדקו ידנית ונקודתית,
 * ולפעמים בכלל לא — קלט שגוי זלג פנימה ושבר את השרת בהמשך עם שגיאה לא
 * קשורה. כאן מרכזים: גודל מוגבל + סכימת zod + תשובת 400 מפורטת.
 *
 * שימוש:
 *   const parsed = await parseBody(req, MySchema);
 *   if (!parsed.ok) return parsed.res;   // 400 כבר מוכן
 *   const data = parsed.data;            // typed + validated
 */

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

const DEFAULT_MAX_BYTES = 1_000_000; // 1MB — בלובים גדולים נחתכים כאן

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; res: NextResponse };

export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
  opts?: { maxBytes?: number }
): Promise<ParseResult<T>> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;

  // הגנת גודל מוקדמת לפי Content-Length (כשקיים) — חוסך קריאת body ענק.
  const declaredLen = Number(req.headers.get("content-length") || 0);
  if (declaredLen && declaredLen > maxBytes) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "payload_too_large", maxBytes },
        { status: 413 }
      ),
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "unreadable_body" }, { status: 400 }),
    };
  }

  // הגנת גודל אמיתית (Content-Length יכול לשקר / להיעדר).
  if (raw.length > maxBytes) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "payload_too_large", maxBytes },
        { status: 413 }
      ),
    };
  }

  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : undefined;
  } catch {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "validation_failed", issues: result.error.issues },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}
