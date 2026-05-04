import { NextResponse } from "next/server";
import { createClient } from "./server";

/**
 * Route-level auth guard — belt + suspenders with the middleware.
 * Use at the top of every /api/* route that needs an authenticated user.
 *
 * Returns either { user } or { response } — caller returns the response if present.
 *
 * Example:
 *   const auth = await requireUser();
 *   if ("response" in auth) return auth.response;
 *   const { user } = auth;
 */
export async function requireUser() {
  const sb = createClient();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  return { user, sb };
}
