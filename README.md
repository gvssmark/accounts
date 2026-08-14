# Journal & Accounts Data Entry — GitHub-hosted forms + Apps Script Web App

Architecture: the two HTML pages live on **GitHub Pages** (or anywhere static).
They call a **Google Apps Script Web App URL** as their backend API, which reads
and writes your Google Sheet directly.

⚠️ **Important**: this is *not* the same as Google Sheets' "Publish to web" link.
Publishing gives a read-only CSV/HTML snapshot and can't accept submissions. You
need the Apps Script **Web App /exec URL** from the deployment step below.

## 1. Prepare the Google Sheet
Two tabs, exact header row:

**Journal**
```
date | jrnlNo | drAccount | crAccount | details | amount | finYear
```

**Accounts**
```
acno | bsie | type | acname | fullacname
```

## 2. Add and deploy the script
1. In the Sheet: **Extensions > Apps Script**.
2. Replace the default code in `Code.gs` with the contents of `Code.gs` from this package.
3. **Deploy > New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, authorize when prompted.
5. Copy the **Web app URL** (ends in `/exec`) — this is your `WEB_APP_URL`.

Whenever you edit `Code.gs` later: **Deploy > Manage deployments > ✎ Edit > New version > Deploy**
(the same `/exec` URL keeps working — no need to update the forms).

## 3. Configure and host the pages
1. Open `JournalForm.html`, `AccountsForm.html`, `Ledger.html`, `Bsie.html`.
2. In each, replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the `/exec` URL from step 2.
3. Push all four files to a GitHub repo, enable **GitHub Pages** (Settings > Pages > deploy from branch).
4. Share the resulting URLs (e.g. `https://yourname.github.io/repo/JournalForm.html`)
   with whoever needs to enter data or view reports.

## Pages
| File | Purpose |
|---|---|
| `JournalForm.html` | Add a Journal entry |
| `AccountsForm.html` | Add a new Account |
| `Ledger.html` | Per-account transaction history + running balance for a chosen FY |
| `Bsie.html` | Balance Sheet + Income & Expenditure for a chosen FY |

## How Ledger/BSIE are computed
- Both are scoped to a **selected Financial Year**, filtering the continuous
  Journal sheet by its `finYear` column — this reproduces exactly what your old
  per-year files showed, since the opening-balance ("B/F FROM LAST BS") entry is
  itself a Journal row dated at the start of each FY.
- **Sign convention** (matches your existing data): Asset & Payment(expenditure)
  accounts are debit-normal (`Debits − Credits`); Liability & Receipt(income)
  accounts are credit-normal (`Credits − Debits`).
- **BSIE grouping**: accounts sharing the same `bsie` code (e.g. your three bank
  accounts under `1-04`) are listed individually with a subtotal under that code
  — there's no separate "group label" field in the Accounts sheet, so the code
  itself is shown as the heading. Say the word if you'd rather add a small
  reference table mapping BSIE codes to descriptive labels.
- **Balance check**: `Bsie.html` shows a green "Assets = Liabilities" badge, or a
  red mismatch amount — a useful sanity check that catches mis-typed account
  types or bsie codes.
- The `excess`/`Excess of Income over Expenditure` line is a computed plug
  (Income − Expenditure for the year), not a journal-posted figure — same as
  your original BSIE sheet.

## Notes / current assumptions
- **finYear** format is `"2025-26"` (Jul–Jun), auto-detected from the latest finYear
  already in the Journal sheet (or today's date if the sheet is empty).
- **jrnlNo** is one global increasing sequence across the whole sheet (last row's
  jrnlNo + 1) — not reset each financial year.
- **acno**: first digit fixed by Account Type — `1=Asset, 2=Liability, 3=Payment,
  4=Receipt`. The form suggests the next free number in that series; editable.
- **No login / no audit trail.** "Who has access: Anyone" means *anyone with the
  page link* can submit entries — there's no per-person identity, and the Sheet
  itself isn't shared, only the API. This is easier to share widely, but also
  means you can't restrict who submits or see who entered what. If that becomes
  a requirement, it's a bigger change (Google account-gated access + logging).
- The POST request uses `Content-Type: text/plain` on purpose — this avoids a
  CORS preflight that Apps Script Web Apps don't handle, but the body is still
  parsed as JSON server-side. Don't change this to `application/json`.

## Easy tweaks
- **jrnlNo reset per year**: in `Code.gs`, filter by `finYear` before computing
  `maxJrnlNo` in both `getJournalFormData()` and `submitJournalEntry()`.
- **Different finYear format**: change `finYearFromDate_()`.
- **Restrict access**: change deployment's "Who has access" to
  "Anyone with a Google account" — forms would then need Google sign-in handling,
  which isn't implemented here yet.
