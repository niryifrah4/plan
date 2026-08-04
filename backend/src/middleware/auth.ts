import type { Request, Response, NextFunction } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserClient } from "../supabase.js";

/**
 * Augment Express's Request with the authenticated user + their RLS-scoped
 * Supabase client. Set by requireUser() so downstream handlers can read them.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sb?: SupabaseClient<any>;
      accessToken?: string;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/**
 * Express equivalent of the old lib/supabase/require-user.ts guard.
 * Validates the Bearer token with Supabase and attaches { user, sb } to req.
 * Replaces both the proxy.ts middleware auth gate AND the per-route
 * requireUser() calls — every protected route mounts this.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const sb = createUserClient(token);
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();

  if (error || !user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  req.user = user;
  req.sb = sb;
  req.accessToken = token;
  next();
}

/**
 * Advisor-only guard — mirrors the /crm + /api/crm block in proxy.ts.
 * Must run AFTER requireUser. Identifies advisors via the `advisors` table
 * (NOT household ownership — see the 2026-05-03 fix note in the old proxy.ts).
 */
export async function requireAdvisor(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.sb) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const { data: advisor } = await req.sb
    .from("advisors")
    .select("id")
    .eq("id", req.user.id)
    .maybeSingle();
  if (!advisor) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
