# IBRA Accounts — Setup

A single installable web app (PWA) covering Journal entry, Batch Transactions,
Account Addition, BSIE Reports, Ledger Reports, Accounts Report, and Financial
Year Closing — backed by your Google Sheet via an Apps Script Web App.

## ⚠️ If you have an existing "old schema" Journal sheet

If your Journal sheet currently has columns `date, jrnlNo, drAccount,
crAccount, details, amount, finYear`, you're on the **old schema** and must
migrate before deploying this version of `Code.gs` — it expects the new
line-item schema below. See **Section 4 (Migration)**.

## 1. Google Sheet — three tabs, exact header rows

**Journal** *(line-item schema — one row per Dr or Cr line, not per pair)*
```
date | jrnlNo | account | drCr | details | amount | finYear
```
- `drCr` is exactly `Dr` or `Cr`.
- `jrnlNo` is the **voucher number** — multiple rows share the same jrnlNo to
  form one voucher. A simple transaction is 2 rows (1 Dr + 1 Cr) sharing a
  jrnlNo; a batch/compound transaction is however many rows are needed, as
  long as the Dr rows and Cr rows for that jrnlNo sum to the same total.

**Accounts**
```
acno | bsie | type | acname | fullacname
```

**BSIEcodes**
```
Type | mapping | Label
```
`Type` must be exactly one of: `Assets`, `Liabilities`, `Expenditure`, `Income`.
Must include `2-05` (Liabilities, surplus carry-over) and `1-07` (Assets,
deficit carry-over) for Financial Year Closing and the BSIE report to balance.

## 2. Deploy the Apps Script backend
1. In the Sheet: **Extensions > Apps Script**.
2. Replace the code in `Code.gs` with the contents of `Code.gs` from this package.
3. **Set the admin passcode**: Project Settings (gear icon) > **Script Properties**
   > Add property: key `ADMIN_PASSCODE`, value = whatever passcode you want to
   protect Financial Year Closing with. (Skip if already set from before — it
   survives redeployments.)
4. **Deploy > New deployment > Web app** (first time only)
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Deploy, authorize when prompted, copy the **Web app URL** (ends `/exec`).

Whenever you edit `Code.gs` later: **Deploy > Manage deployments > ✎ Edit >
New version > Deploy** (same `/exec` URL keeps working).

## 3. Configure and host the app
1. Open `index.html`, replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with your `/exec` URL.
2. Push `index.html`, `manifest.json`, `icon.svg`, `sw.js` to a GitHub repo (same folder).
3. Enable **GitHub Pages** (Settings > Pages > deploy from branch).
4. Share the resulting URL (e.g. `https://yourname.github.io/repo/`).
5. On a phone: open the link > browser menu > **Add to Home Screen / Install app**.

## 4. Migration (old schema → new schema)

Only needed once, if your Journal sheet still has `drAccount`/`crAccount` columns.

1. In the Apps Script editor, with the **old** `Code.gs` still in place (or
   paste in just the `migrateJournalToLineItems` function from the new one),
   select `migrateJournalToLineItems` in the function dropdown and click **Run**.
2. This creates a new sheet called `Journal_NEW` — your existing `Journal`
   sheet is **not** touched. Check `Journal_NEW`: it should have roughly
   double the row count of the old `Journal` (each old paired row becomes two
   line rows).
3. Rename the old `Journal` sheet to `Journal_OLD_backup`.
4. Rename `Journal_NEW` to `Journal`.
5. **Now** replace `Code.gs` with the new version and redeploy (Section 2).

## What's inside
| Menu item | What it does |
|---|---|
| About / Dos & Don'ts | Landing page (default view) |
| Journal | Simple 1-debit/1-credit entry; account fields filter as you type |
| Batch Transactions | Multi-line voucher — add several Dr and/or Cr lines, post once totals balance |
| Account Addition | Add a new Account by picking a BSIE mapping (Type + acno prefix auto-derived) |
| BSIE Reports | Balance Sheet + Income & Expenditure for any FY — Save PDF or Share via WhatsApp |
| Ledger Reports | Per-account transaction history + running balance for any FY, plus a Batch Transactions Summary page when viewing All Accounts — Save PDF or Share via WhatsApp |
| Accounts Report | AC / BSIE / Name / Dr count / Total Debits / Cr count / Total Credits / Balance, per account |
| Financial Year Closing | Passcode-protected. Preview then approve — posts one opening-balance voucher into the next FY |

## Key design notes
- **Line-item Journal**: every row is one account + one amount + Dr or Cr.
  A "voucher" is every row sharing a `jrnlNo`. This is what makes batch/compound
  entries possible — only the voucher's Dr total and Cr total need to match,
  not each individual line against a specific counterpart.
- **Ledger "Particulars"**: for a 2-line voucher (the simple case), shows the
  contra account's name, same as always. For a voucher with 3+ lines (a real
  batch entry — including the one Financial Year Closing posts), shows
  "Batch / Sundries" instead, per standard ledger convention.
- **Per-year scoping**: reports filter the continuous Journal by `finYear`.
- **Sign convention**: Asset/Expenditure accounts are debit-normal; Liability/Income accounts are credit-normal.
- **jrnlNo resets to 1 each financial year** (scoped per FY, not a global sequence).
- **Financial Year Closing** posts **one voucher** (one shared jrnlNo): every
  non-zero Asset balance as a Dr line, every non-zero Liability balance
  (other than the B/f account, BSIE code `2-01`) as a Cr line, and the B/f
  account itself takes whichever side balances the voucher. Payment/Receipt
  (nominal) accounts are *not* carried forward — they naturally start at zero.
  Refuses to run if the next FY already has entries.
- **No in-app delete/purge/account-edit** — by design, you handle those
  directly in the Google Sheet.
- **No login system.** "Anyone with the link" can enter Journal/Batch/Account
  data. Financial Year Closing is gated by the `ADMIN_PASSCODE` script
  property — anyone with the passcode can close a year, there's no
  per-person identity.
- **Journal numbers may duplicate** if two people submit at nearly the same
  moment — the app doesn't block this; fix duplicates directly in the Sheet
  if it happens.
- **Dates display as dd/mm/yyyy** in reports (Ledger, PDFs). The underlying
  data and date-picker inputs still use ISO format internally — only the
  printed/displayed text is dd/mm/yyyy.
- **Numbers display in Indian grouping** (e.g. `12,34,567.00`, lakhs/crores),
  forced via `'en-IN'` locale regardless of the viewer's browser/device locale.
- **Batch Transactions Summary**: when viewing the Ledger with "All Accounts"
  selected, a flat list of every line belonging to a genuine batch voucher
  (3+ lines) appears after the per-account sections — in the PDF this is a
  genuinely separate page (`doc.addPage()`), not just a visual break. It does
  not appear when viewing a single account's ledger.
- **PDF reports** are drawn as real vector tables via `jsPDF` + `jspdf-autotable`
  (not a screenshot of the page) — this avoids clipping/overflow issues and
  produces selectable text. "Share via WhatsApp" only appears when the
  browser supports attaching a file via the Web Share API; otherwise only
  "Save PDF" shows.
- **PWA**: installable via `manifest.json` + `sw.js`; the service worker only
  caches the app shell (HTML/CSS/JS) for offline *loading* — it does not queue
  offline Journal/Batch submissions. You still need connectivity to actually
  save data or load reports.

## Easy tweaks
- **Different finYear format**: change `finYearFromDate_()`.
- **Change admin passcode**: edit the `ADMIN_PASSCODE` Script Property — no redeploy needed.
- **Ledger "Batch / Sundries" wording**: change the string in `getLedgerData()`.
