# IBRA Accounts — Setup

A single installable web app (PWA) covering Journal entry, Account Addition,
BSIE Reports, Ledger Reports, and Financial Year Closing — backed by your
Google Sheet via an Apps Script Web App.

## 1. Google Sheet — three tabs, exact header rows

**Journal**
```
date | jrnlNo | drAccount | crAccount | details | amount | finYear
```

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
   protect Financial Year Closing with.
4. **Deploy > New deployment > Web app**
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

## What's inside
| Menu item | What it does |
|---|---|
| About / Dos & Don'ts | Landing page (default view) |
| Journal | Add a Journal entry; Debit/Credit fields filter as you type |
| Account Addition | Add a new Account by picking a BSIE mapping (Type + acno prefix auto-derived) |
| BSIE Reports | Balance Sheet + Income & Expenditure for any FY, print (A4) or email |
| Ledger Reports | Per-account transaction history + running balance for any FY, print or email |
| Financial Year Closing | Passcode-protected. Preview then approve — posts opening-balance entries into the next FY |

## Key design notes
- **Per-year scoping**: reports filter the continuous Journal by `finYear`.
- **Sign convention**: Asset/Expenditure accounts are debit-normal; Liability/Income accounts are credit-normal.
- **Financial Year Closing** carries forward every non-zero Asset/Liability
  account balance against the account mapped to BSIE code `2-01`, dated 1 July
  of the new FY. Payment/Receipt (nominal) accounts are *not* carried forward
  — they naturally start at zero. It refuses to run if the next FY already has
  entries, to prevent duplicate opening balances.
- **No in-app delete/purge/account-edit** — by design, you handle those
  directly in the Google Sheet.
- **No login system.** "Anyone with the link" can enter Journal/Account data.
  Financial Year Closing is gated by the `ADMIN_PASSCODE` script property —
  anyone with the passcode can close a year, there's no per-person identity.
- **Journal numbers may duplicate** if two people submit at nearly the same
  moment — the app doesn't block this; fix duplicates directly in the Sheet
  if it happens.
- **Email** sends from the Sheet owner's Google account (since the script runs
  "Execute as: Me"), to whatever address is entered on that report at send time.
- **PWA**: installable via `manifest.json` + `sw.js`; the service worker only
  caches the app shell (HTML/CSS/JS) for offline *loading* — it does not queue
  offline Journal submissions. You still need connectivity to actually save
  data or load reports.

## Easy tweaks
- **jrnlNo reset per year** instead of one global sequence: filter by
  `finYear` before computing `maxJrnlNo` in `Code.gs`.
- **Different finYear format**: change `finYearFromDate_()`.
- **Change admin passcode**: edit the `ADMIN_PASSCODE` Script Property — no redeploy needed.
