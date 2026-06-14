# Session 2026-06-13 - AI Mapping Flow and Hidden Merchants

## Context

Worked on the `/files` document mapping flow, mainly the unmapped/low-confidence queue and hidden merchant handling.

## Changes

### AI mapping UX

- Clarified that low-confidence AI classifications are not fully approved mappings.
- Changed low-confidence rows so the AI-selected category is prefilled in the category select instead of shown as separate `הצעת AI:` text.
- Added an explicit `אשר` button:
  - selecting a category only changes the pending selection;
  - clicking `אשר` applies the mapping, sets confidence to `1.0`, records learning/corrections, and removes the group from the queue.

### AI options modal

- Changed the robot action into a clearer `אפשרויות AI` button.
- Added an RTL modal for AI category options.
- Modal now shows AI recommendations and lets the user choose one.
- Choosing a recommendation fills the row select, but does not apply it until the user clicks `אשר`.
- Added a free-text box in the modal:
  - user can describe what the merchant/transaction is;
  - clicking `בדוק שוב עם AI` sends that context to Perplexity;
  - the modal updates the recommendation list from the new result.

### Bulk Perplexity classification flow

- Changed `סווג מחדש עם AI` to work as a bulk classification step.
- After it runs, the bulk button is hidden and replaced with guidance:
  - `הסיווג רץ. לחץ על אפשרויות AI בשורה כדי לראות ולאשר המלצות.`
- Recommendations are stored in the screen state by merchant key.
- Opening `אפשרויות AI` uses the recommendations already returned by the bulk run instead of calling Perplexity for each row.
- Perplexity is called again only when the user types extra context in the modal and clicks `בדוק שוב עם AI`.
- Extended the AI categorizer response contract to support up to 3 `alternatives` per transaction, ordered best-first.

### Hidden merchants

- Fixed hidden transaction detection in `DocumentsTab` so the hidden count/list includes both:
  - system/default hidden merchants from the hidden catalog;
  - merchants the user manually chose to hide;
  - legacy excluded merchant keys.
- Added a shared hidden check that compares both `hiddenMerchantKey(...)` and `getExcludedMerchantKey(...)`.
- Updated preview copy from `הוסתרו אוטומטית` to `הוסתרו`, because the count now includes both automatic and user-selected hidden merchants.

## Files touched

- `app/(client)/balance/UnmappedQueueTab.tsx`
- `app/(client)/balance/_documents-tab/InteractiveCategoryModal.tsx`
- `app/(client)/balance/DocumentsTab.tsx`
- `app/(client)/balance/_documents-tab/PreviewView.tsx`
- `lib/doc-parser/ai-categorizer.ts`

## Verification

- Ran `npm run lint` after each implementation pass.
- Final lint result: passed.
