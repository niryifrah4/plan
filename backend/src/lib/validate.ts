import type { Response } from "express";
import type { ZodType } from "zod";

/**
 * validate — uniform body validation for Express routes.
 * Ported from lib/api/validate.ts. Express's express.json() middleware already
 * parses + size-limits the body (see server.ts limit), so this focuses on the
 * zod schema check and a consistent 400 response.
 *
 * Usage:
 *   const parsed = validate(req.body, MySchema, res);
 *   if (!parsed.ok) return;          // 400 already sent
 *   const data = parsed.data;        // typed + validated
 */
export type ParseResult<T> = { ok: true; data: T } | { ok: false };

export function validate<T>(body: unknown, schema: ZodType<T>, res: Response): ParseResult<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ ok: false, error: "validation_failed", issues: result.error.issues });
    return { ok: false };
  }
  return { ok: true, data: result.data };
}
