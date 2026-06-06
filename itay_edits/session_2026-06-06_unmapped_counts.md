# Session Summary - 2026-06-06 - Unmapped Transaction Counts

## Context

The session started from a UI inconsistency in the document mapping flow:

- The dashboard/banner showed pending transactions for AI classification.
- The document mapping screen showed "everything mapped".
- The document history card still showed old unmapped counts, such as `58`, even when there was nothing left to map.

The user asked whether something might still be unclassified and requested checking Supabase logs/CLI.

## Supabase Checks

Checked the Supabase project using the available credentials in `.env.supabase`.

Findings:

- Project ref: `xpkjpfxyjeurcokunsnm`
- `supabase functions list --project-ref xpkjpfxyjeurcokunsnm` returned no Edge Functions.
- `analytics/endpoints/logs.all` returned an empty result for the attempted log query.
- Direct `client_state` inspection showed no row with `state_key = parsed_transactions`.

Conclusion:

The stale pending count was not coming from Supabase logs or Edge Functions. It was caused by frontend/local transaction state and inconsistent counting logic.

## Root Cause

There were multiple independent definitions of "unmapped" or "needs mapping":

- `UnmappedNudge` counted local parsed transactions with `other`, `transfers`, or low `confidence`.
- `UnmappedQueueTab` filtered out excluded merchants and showed an empty/everything-mapped state.
- The document history card used stale `DocHistoryEntry.unmappedCount` saved at upload time.
- `DiscoverTab` had its own separate unmapped count logic.
- `DocumentsTab` manual category overrides changed `category` and `categoryLabel`, but did not set `confidence: 1.0`.

This produced the absurd state where one screen said there was nothing to map, while other widgets still showed pending items.

## Code Changes

### Shared Mapping Logic

Added a shared helper in `lib/documents-categories.ts`:

- `getMappingExcludeKey(description)`
- `needsMappingAttention(tx, excludedSet?)`

This centralizes the definition:

- Needs attention if category is `other` or `transfers`.
- Needs attention if confidence is below `CONFIDENCE_THRESHOLD`.
- Does not need attention if the merchant is excluded.

### DocumentsTab

Updated `app/(client)/balance/DocumentsTab.tsx`:

- Manual category overrides now set `confidence: 1.0`.
- Saved document history now counts unmapped rows using `needsMappingAttention()`.

### Existing Saved Transactions

Updated `lib/budget-import.ts`:

- Added a normalization pass for already-saved transactions.
- If an old row still has low confidence, but the current classifier now confidently reproduces the stored category, its confidence is upgraded.
- The normalization runs on load and before saving transactions.

This helps migrate rows that the user already classified before the bug was fixed.

### Dashboard Nudge

Updated `lib/hooks/useUnmappedCount.ts`:

- Uses `needsMappingAttention()`.
- Builds and applies the excluded merchants set.
- Listens to:
  - `verdant:docs:updated`
  - `verdant:parsed_transactions:updated`
  - `verdant:excluded_merchants:updated`
  - `storage`

This keeps the purple AI classification banner aligned with the actual queue.

### Document History Mapping Card

Updated `app/(client)/balance/_documents-tab/IdleView.tsx`:

- Recomputes current per-document mapping status from saved parsed transactions.
- Uses current transaction state instead of stale `DocHistoryEntry.unmappedCount`.
- Applies excluded merchant filtering through `needsMappingAttention()`.

This fixes cases where the history card still showed old unmapped counts while the queue was already empty.

### DiscoverTab

Updated `app/(client)/budget/DiscoverTab.tsx`:

- Replaced its local unmapped calculation with `needsMappingAttention()`.
- Applies excluded merchants.
- Refreshes when excluded merchants change.

## Verification

Ran:

```bash
npm run typecheck -- --pretty false
```

Result:

- TypeScript check passed.

## Git

Committed and pushed the fix to `main`.

Commit:

```text
2757ad8 Fix stale unmapped transaction counts
```

Files changed in that commit:

- `app/(client)/balance/DocumentsTab.tsx`
- `app/(client)/balance/_documents-tab/IdleView.tsx`
- `app/(client)/budget/DiscoverTab.tsx`
- `lib/budget-import.ts`
- `lib/documents-categories.ts`
- `lib/hooks/useUnmappedCount.ts`

Push target:

```text
origin/main
```

Note:

After that, `main` was advanced by another commit:

```text
024803e Improve sidebar navigation loading feedback
```

## Current Worktree Note

At the time this documentation file was created, Git showed existing changes in `itay_edits`, including `session_changes.md` and several other untracked session notes.

Those files were not reverted or modified as part of this documentation update. This new file was created separately to avoid overwriting or undoing user changes.
