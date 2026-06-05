# Security Review - 2026-06-04

## What Was Checked
- Auth and role boundaries in middleware and route handlers.
- CRM invite and impersonation flows.
- Google Calendar OAuth and token handling.
- Shared-session browser cleanup on logout/reset.
- Supabase RLS posture for the main tenant tables and views.

## Findings Addressed
1. Invite links could be built from forwarded host headers in `app/api/crm/invites/route.ts`.
   - Fixed by using the trusted base URL only.
2. Google Calendar OAuth callback had no state validation.
   - Added one-time OAuth state cookies in `app/api/gcal/auth/route.ts` and validation in `app/api/gcal/callback/route.ts`.
3. Google Calendar session cookies were not cleared on logout or factory reset.
   - Added a shared cleanup helper and wired it into logout and reset flows.
4. Google Calendar endpoints relied only on browser cookies.
   - Added route-level auth checks to `status`, `disconnect`, and `events`.

## Result
- The highest-risk issues in the reviewed paths were reduced.
- The app still relies on the existing Supabase RLS design for tenant isolation, which already appears hardened in the migration set.

## Verification
- Ran `npm run typecheck` successfully after the changes.

