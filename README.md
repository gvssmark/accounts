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

## 3. Configure and host the forms
1. Open `JournalForm.html` and `AccountsForm.html`.
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the `/exec` URL from step 2.
3. Push both files to a GitHub repo, enable **GitHub Pages** (Settings > Pages > deploy from branch).
4. Share the resulting URLs (e.g. `https://yourname.github.io/repo/JournalForm.html`)
   with whoever needs to enter data.

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
