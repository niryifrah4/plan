import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth middleware — מגן על routes מאומתים.
 *
 * שינויים חשובים (דוח אבטחה baseline):
 * 1. /api/* כבר לא ציבורי אוטומטית — רק רשימה מפורשת של endpoints.
 * 2. אם Supabase ENV חסר בפרודקשן → fail-closed (500), לא fail-open.
 */

// Public app routes (no auth required to view the page).
// /auth/callback must be public — it runs getUser() itself after exchanging
// the code, and running middleware on it races the cookie-write from the
// browser signInWithPassword and bounces the user back to /login.
const PUBLIC_ROUTES = ["/login", "/auth/callback", "/privacy", "/terms"];

// Public API endpoints — the ONLY /api/* paths that skip middleware auth.
// All other /api/* must call auth.getUser() internally (route-level).
// We keep this list tight: auth callbacks and OAuth callbacks only.
const PUBLIC_API_ROUTES = [
  "/api/auth/",       // login / magic-link callbacks (Supabase handles internally)
  "/api/gcal/callback", // Google OAuth callback (validates state internally)
  "/api/health",      // Render healthcheck — must be reachable unauthenticated
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets first (cheap check)
  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Allow public app routes + whitelisted public API routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) || isPublicApi(pathname)) {
    return NextResponse.next();
  }

  // Supabase ENV guard — fail-CLOSED in production, fail-open only in dev.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const envMissing = !url || !key || url.includes("YOUR-PROJECT");
  if (envMissing) {
    if (process.env.NODE_ENV === "production") {
      // Never serve an unauthenticated app in prod — return a clear error.
      return new NextResponse("Server misconfigured: Supabase env missing", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    // Dev only: allow through so `npm run dev` works without full env.
    return NextResponse.next();
  }

  // Expose the request pathname to RSC layouts via a custom header.
  // (Next.js doesn't do this by default, but layouts need it for
  // path-aware guards like "onboarding-stage clients stay on /onboarding".)
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-pathname", pathname);

  let response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API routes expect JSON, not an HTML redirect.
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({ error: "unauthenticated" }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2026-04-29 per Nir: clients (rows in client_users) shouldn't see
  // advisor-only surfaces. Block /crm + /api/crm at the edge.
  // 2026-05-03 fix (Victor): identify advisors via the `advisors` table —
  // NOT via "owns a household". The (client) layout uses the advisors table
  // to send advisors to /crm; if middleware uses a different rule (households)
  // and the advisor has zero clients, /crm bounces to /dashboard, /dashboard
  // bounces back to /crm → infinite redirect loop.
  if (pathname.startsWith("/crm") || pathname.startsWith("/api/crm")) {
    const { data: advisor } = await supabase
      .from("advisors")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!advisor) {
      if (pathname.startsWith("/api/")) {
        return new NextResponse(
          JSON.stringify({ error: "forbidden" }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
