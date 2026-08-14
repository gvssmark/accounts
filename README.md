# Journal & Accounts Data Entry — Setup

## 1. Prepare the Google Sheet
Create (or open) your Google Sheet with two tabs, exact header row as below:

**Journal**
```
date | jrnlNo | drAccount | crAccount | details | amount | finYear
```

**Accounts**
```
acno | bsie | type | acname | fullacname
```

Headers are matched case-insensitively, but the column *names* must match exactly
(e.g. `drAccount`, not `Debit Account`).

## 2. Add the script
1. In the Sheet: **Extensions > Apps Script**.
2. Delete any default code in `Code.gs`, paste in the contents of `Code.gs` from this package.
3. Click **+ > HTML** file, name it exactly `JournalForm`, paste in `JournalForm.html`.
4. Click **+ > HTML** file, name it exactly `AccountsForm`, paste in `AccountsForm.html`.
5. Save (Ctrl/Cmd+S), then close the Apps Script tab.

## 3. Use it
Reload the Google Sheet. A new **Data Entry** menu appears in the menu bar with:
- **New Journal Entry** — opens the Journal form
- **New Account** — opens the Accounts form

First run will ask you to authorize the script (it only reads/writes this spreadsheet).

## Notes / current assumptions
- **finYear** format is `"2025-26"` (Jul–Jun), auto-detected from the latest finYear
  already in the Journal sheet (or today's date if the sheet is empty).
- **jrnlNo** is one global increasing sequence across the whole sheet (last row's
  jrnlNo + 1) — not reset each financial year.
- **acno**: first digit is fixed by Account Type — `1=Asset, 2=Liability, 3=Payment,
  4=Receipt` — matching your existing chart of accounts. The form suggests the next
  free number in that series; you can type over it.
- Anyone with edit access to the Sheet can use these menu items — there's no
  per-user login/audit trail. If you need that later, it's a bigger change (would
  require moving off plain Apps Script to a proper backend with auth).

## Easy tweaks
- **jrnlNo reset per year**: in `Code.gs`, filter by `finYear` before computing
  `maxJrnlNo` in both `getJournalFormData()` and `submitJournalEntry()`.
- **Different finYear format**: change `finYearFromDate_()`.
