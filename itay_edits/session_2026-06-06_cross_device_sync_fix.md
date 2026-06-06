# Session Log - Cross-Device Sync Fix

Date: 2026-06-06

## Problem

The same household could show different values in different browsers or devices.
The visible symptom was most obvious in the dashboard cashflow card, where one
browser showed `₪12,000` while another showed `₪27,000`.

This was especially problematic because the app is used as a live planning
tool. If one device changes data and another device opens later, the second
device must see the updated truth immediately.

## What I Verified

### 1. The dashboard cashflow card is not a direct Supabase read

The dashboard card is computed from browser state:

- `app/(client)/dashboard/page.tsx`
- `lib/budget-store.ts`
- `lib/assumptions.ts`

The dashboard uses:

- `loadAssumptions()`
- `buildBudgetLines(0)`
- `deriveMonthlyIncomeFromBudget()`

So the visible number depends on cached local state first, then remote
rehydration.

### 2. Supabase data for `itayk93@gmail.com`

I queried Supabase directly with the CLI and confirmed:

- `client_users` resolves `itayk93@gmail.com` to household
  `70b6fd63-b3e9-444b-a739-a5f3cf1b6ca4`
- `client_state` contains:
  - `budget_2026_06`
  - `debt_data`
  - `onboarding_snapshot`
  - `realestate_properties`
  - `risk_items`
- `budget_2026_06` currently has:
  - income total `0`
  - expense total `0`
- `onboarding_snapshot` contains income rows summing to `27,000`
  - `15,000`
  - `12,000`

That confirmed the mismatch was not "wrong data in Supabase". It was stale
or partially hydrated browser cache.

## Root Cause

The app already had a localStorage-first architecture, but the refresh model
was incomplete:

- many pages listened to local events only
- remote hydration happened mainly once at bootstrap
- some stores never re-pulled after another browser/device changed data
- some data, like special events, was local-only and not mirrored to Supabase

That allowed one browser to stay on stale values while another browser had the
fresh data.

## Fix Implemented

### 1. Added a real remote refresh loop

I extended `lib/sync/bootstrap.ts` to support:

- a forced remote refresh path
- Supabase Realtime watchers on the active household
- fallback polling
- refresh on `focus`, `visibilitychange`, and `online`

This means open tabs now rehydrate from the server even after the first load.

### 2. Wired the refresh loop into both app shells

I attached the watcher to the two global wrappers that own the app shell:

- `app/(client)/ClientLayoutInner.tsx`
- `app/m/MobileBootstrap.tsx`

That covers all client pages on desktop and the mobile shell in one place.

### 3. Added remote sync for special events

`lib/special-events-store.ts` was local-only. I added:

- Supabase blob push on save
- Supabase blob hydrate on boot/refresh

This keeps special cashflow events in sync across devices too.

### 4. Expanded refresh events

I centralized store refresh events in `lib/client-scope.ts` so remote rehydrate
can notify all relevant pages and components consistently.

## Outcome

After this change:

- a change in one browser should be visible in other open browsers
- a phone opening the same household should rehydrate from the same source of truth
- the dashboard no longer depends on a stale browser cache after another device
  has updated the household

## Verification

- `npm run typecheck` passed after the change.
- Supabase CLI queries confirmed the authoritative data for the household.

## Files Touched

- `app/(client)/ClientLayoutInner.tsx`
- `app/m/MobileBootstrap.tsx`
- `lib/client-scope.ts`
- `lib/special-events-store.ts`
- `lib/sync/bootstrap.ts`

