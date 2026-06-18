# Broker Investment Reports — Feature Documentation

Upload a broker (investment-house) account statement PDF on `/investments`, have
it parsed automatically, persist the analyzed snapshot, merge holdings into the
portfolio, and view/compare multiple portfolios across brokers.

Built and verified against a real IBI statement (`IBI__000103271_012416.pdf`,
password `3115`).

---

## 1. End-to-end flow

```
Upload PDF (/investments → "דוח בית השקעות")
   │
   ▼
POST /api/investments/parse-report   (multipart: files + optional password)
   │  1. decrypt + extract text layer (pdf.js bundled in pdf-parse)
   │  2. tier-1: deterministic parse → reconcile vs printed total
   │  3. tier-2 (fallback): Claude structured extraction
   ▼
Preview (holdings, all columns, per-holding return, analysis block)
   │
   ▼ "הוסף לתיק ושמור דוח"
   ├─ merge holdings → local portfolio-store (positions)
   └─ POST /api/investments/reports  → upsert into investment_reports (replace-on-newer)
        │
        ▼
   SavedBrokerPortfolios panel  (select one portfolio / "הכל ביחד")
```

No Anthropic key is needed for the deterministic path (it runs server-side and
reconciles). The Claude fallback only runs when the deterministic parse can't
confidently read the layout; it needs `ANTHROPIC_API_KEY` or `PLANAPI`
(production uses `PLANAPI` on Render).

---

## 2. Password-protected PDFs

- `extractBrokerPdf(buffer, password?)` opens via pdf.js. pdf.js
  `PasswordException` codes: `1` = needs password, `2` = wrong password.
- Mapped to typed errors `PdfPasswordRequiredError` / `PdfPasswordWrongError`,
  surfaced by the API as codes `PASSWORD_REQUIRED` / `PASSWORD_WRONG` (HTTP 422).
- UI shows an inline password field and retries with the password.
- Decryption is pure-JS (pdf.js bundled inside `pdf-parse`) — no system `qpdf`,
  works on Render's Node runtime.

---

## 3. Deterministic parser (`lib/doc-parser/broker-pdf-parser.ts`)

The IBI text layer is adversarial:
- every glyph is drawn twice — a **shadow copy** offset by ~`(-28, +12)`,
- two data streams sit ~1pt apart vertically (holdings vs. a parallel stream),
- Hebrew is emitted glyph-by-glyph in **reversed visual order**,
- the "אחוז" (%) header renders as separate glyphs (no joinable token),
- digits in prose are space-separated.

`tryDeterministicParse()` pipeline:
1. **Strip shadows** — drop any item that has an identical-string twin at
   `(x - 28, y + 12)`.
2. **Locate header + total** — detect column x-centers from the
   "פירוט יתרות" header tokens; grand total = largest number on the `סה"כ` row.
   `%` column is derived positionally (left of value), not from a header token.
3. **Anchor on security numbers** — each holding = one canonical security-number
   item (right edge, `x ≥ headerX(securityNumber) − 12`).
4. **Read each row by baseline** — for every column, pick the numeric cell with
   the nearest `y` to the anchor (rejects the parallel stream ~1pt away). The
   name shares the anchor baseline exactly (`|Δy| < 0.6`).
5. **No-secnum balance rows** — a second pass captures balance lines like
   "יתרה כספית" (no security number) by matching a canonical cash label;
   qty/price/cost are zeroed (they belong to the adjacent stream).
6. **Reconciliation guard** — `Σ(value)` must equal the printed grand total
   within 2%. If not (unknown layout / different shadow offset / streams don't
   separate), returns `null` → caller falls back to Claude. This prevents
   emitting confidently-wrong numbers.

Helpers:
- `guessSymbol(name)` — extracts a ticker (e.g. `NVIDIA(NVDA)` → `NVDA`).
- `guessKind(name)` — classifies stock/etf/crypto/bond/fund/cash; tests the name
  **and its reverse** (Hebrew arrives reversed).
- `canonicalCashName(name)` — clean labels for the standard cash/balance rows
  (`דולר ארה"ב`, `מגן מס`, `יתרה כספית`) since their Hebrew glyph order is
  scrambled.
- `detectBroker` / `detectAccountNumber` / `detectReportDate` — read from the
  text (no hardcoded broker). `detectReportDate` collapses whitespace, validates
  ranges, and picks the latest **non-future** `DD/MM/YYYY` (the "as of" date;
  statements also print future "valid until" dates).

### Verified output on the sample file (8 holdings, Σ = total exactly)

| kind   | name              | qty | value (₪)  | %     | return |
|--------|-------------------|-----|------------|-------|--------|
| etf    | איישרס.ח NSDQ100  | 4   | 19,480     | 7.15  | +15.1% |
| etf    | איישרס.ח SP 500   | 82  | 187,239    | 68.74 | +29.9% |
| etf    | INVESCO (QQQ)     | 15  | 31,131     | 11.43 | +12.9% |
| crypto | EZBC US           | 270 | 32,196     | 11.82 | −27.6% |
| crypto | GRAYSCALE(ETHE)   | 50  | 2,292      | 0.84  | −34.6% |
| cash   | מגן מס            | —   | 0          | 0.00  | —      |
| cash   | דולר ארה"ב        | —   | 30         | 0.01  | —      |
| cash   | יתרה כספית        | —   | 12.17      | 0.00  | —      |

`Σ value = 272,380.05 = printed סה"כ`. Total return **+15.12%**, gain **₪35,778**.

---

## 4. Claude fallback

`analyzeBrokerReport(text, filename)` — `messages.parse` (model
`claude-sonnet-4-6`) with a JSON schema for broker/account/date/total/holdings/
transactions. Used only when the deterministic pass returns `null`. Degrades
gracefully (warning, empty holdings) when no API key is present.

---

## 5. Database (Supabase)

Table `public.investment_reports` — one **current** snapshot per portfolio.

Migrations:
- `20260617120000_investment_reports.sql` — table + RLS (advisor-owner or
  client-member of the household), JSONB `holdings`/`transactions`, denormalized
  scalar columns.
- `20260617130000_investment_reports_portfolio_key.sql` — `broker` /
  `account_number` normalized to non-null `''`; **unique index on
  `(household_id, broker, account_number)`** → portfolio identity.

Columns: `id, household_id, broker, account_number, report_date, currency,
total_value_ils, holdings (jsonb), transactions (jsonb), summary (jsonb),
created_by, created_at`.

Relevant timestamp = `report_date` (statement "as of" date).

---

## 6. Multi-portfolio + replace-on-newer

API `app/api/investments/reports/route.ts`:
- **POST** — portfolio key = `(household, broker, account_number)`.
  - Fetch existing row by key.
  - Guard: if incoming `report_date` < existing → **reject** (older upload can't
    clobber newer); returns `{ ok: true, skipped: true }`.
  - Else **update** existing row (replace snapshot) or **insert** if new.
  - Returns `{ ok, id, replaced }`.
- **GET** — returns all of a household's portfolios (full holdings/transactions),
  ordered by `report_date` desc.

Verified against the live DB:
```
dup same key        → unique violation (23505)
newer update        → replaces (report_date 2026-05-31, value 200)
older upload guard  → REJECT
```

---

## 7. UI

### `components/investments/BrokerReportUpload.tsx`
Upload card (drag/drop), inline password prompt, parse via API, preview with
**all columns** (סוג · נייר · כמות · שער נוכחי · עלות רכישה · שווי נוכחי ·
% מהתיק · תשואה), a returns-analysis block (total cost / current value /
gain-loss / total return / best & worst performer), and a save button. Shows
which method parsed it (deterministic vs AI). Dispatches `REPORT_SAVED_EVENT`
on save. Dates shown Israeli format (`dd/mm/yyyy`); signed amounts use
`fmtILS(x, { signed: true })` so the `+`/`−` sits correctly inside the LTR
isolate.

### `components/investments/SavedBrokerPortfolios.tsx`
"התיקים שלי" panel. Loads saved portfolios via GET. Selector chips: **"הכל
ביחד"** + one per portfolio (broker · account · Israeli date). Shows aggregated
analysis (total value/cost/gain/return), allocation by asset kind (%), and a
holdings table (adds a broker column in "all" mode). Auto-refreshes on
`REPORT_SAVED_EVENT`.

Both are wired into `app/(client)/investments/page.tsx` (Portfolio tab).

---

## 8. Files touched

```
supabase/migrations/20260617120000_investment_reports.sql            (new)
supabase/migrations/20260617130000_investment_reports_portfolio_key.sql (new)
lib/doc-parser/broker-pdf-parser.ts                                  (new)
app/api/investments/parse-report/route.ts                            (new)
app/api/investments/reports/route.ts                                 (new)
components/investments/BrokerReportUpload.tsx                        (new)
components/investments/SavedBrokerPortfolios.tsx                     (new)
app/(client)/investments/page.tsx                                    (edited: wire both components)
```

---

## 9. Known gaps / future analysis

- Hebrew names for cash rows are canonicalized (the raw glyph order is
  scrambled); ETF/crypto (latin) names are exact.
- Transactions section is parsed only by the Claude fallback (deterministic path
  returns holdings only).
- "שער נוכחי" is shown as printed (agorot for ILS-listed securities).
- Possible future analyses: concentration risk (e.g. SP 500 =
  68.74% of the portfolio), and delta between snapshots across uploads.

---

## 10. Multi-currency and Real-time FX (Bank of Israel)

- `BrokerReportUpload.tsx` fetches live FX rates (USD, EUR, GBP) to ILS via `fetchFXRates()` which pulls from the Bank of Israel API (`lib/market-providers.ts`).
- When uploading a report in a foreign currency (e.g., USD for Blink), a new column "שווי בשקל" is conditionally displayed, computing the real-time converted value.
- On save, `fxRateToIls` is populated accurately based on the Bank of Israel rate at the time of upload, which guarantees that the dashboard's total value, returns, and pie charts render the true ILS equivalents natively.
- `SavedBrokerPortfolios.tsx` also dynamically calculates the "שווי בשקל" for historically saved foreign-currency portfolios when viewing their snapshots.

---

## 11. Hydration & Push Queue Fixes

- `pushBlobInBackground` handles local storage syncing and queueing for offline support (`lib/sync/push-queue.ts`).
- To support synchronous saves straight to the DB without background delay (for `savePositionsAsync`), direct `pushBlob` calls now invoke `dequeuePush(householdId, key)` upon success.
- This prevents a critical hydration race-condition where `pullBlob` would fetch stale, empty data from the pending local queue on page refresh instead of the true data just saved to Supabase.
```
