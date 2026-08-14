/**
 * Data Entry — Journal & Accounts (Web App API)
 * ------------------------------------------------
 * Deploy this as a Web App (Deploy > New deployment > Web app):
 *   Execute as:  Me
 *   Who has access: Anyone
 * Copy the resulting /exec URL into WEB_APP_URL at the top of
 * JournalForm.html and AccountsForm.html (hosted on GitHub Pages).
 *
 * Sheet 1 "Journal"  columns: date, jrnlNo, drAccount, crAccount, details, amount, finYear
 * Sheet 2 "Accounts" columns: acno, bsie, type, acname, fullacname
 */

const JOURNAL_SHEET = 'Journal';
const ACCOUNTS_SHEET = 'Accounts';

// acno first digit <-> account type
const TYPE_PREFIX = { 'ASSET': '1', 'LIABILITY': '2', 'PAYMENT': '3', 'RECEIPT': '4' };

// ---------------------------------------------------------------------
// Web App entry points
// ---------------------------------------------------------------------

function doGet(e) {
  try {
    const action = e.parameter.action;
    let data;
    if (action === 'journalForm') data = getJournalFormData();
    else if (action === 'accountsForm') data = getAccountsFormData();
    else if (action === 'nextAcno') data = { acno: getNextAcno(e.parameter.type) };
    else throw new Error('Unknown action: ' + action);
    return jsonOutput_({ ok: true, data: data });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    // Sent as text/plain from the browser to avoid CORS preflight; parse manually.
    const body = JSON.parse(e.postData.contents);
    let data;
    if (body.action === 'journal') data = submitJournalEntry(body.entry);
    else if (body.action === 'account') data = submitAccountEntry(body.entry);
    else throw new Error('Unknown action: ' + body.action);
    return jsonOutput_({ ok: true, data: data });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

function getJournalSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JOURNAL_SHEET);
  if (!sheet) throw new Error('Sheet "' + JOURNAL_SHEET + '" not found');
  return sheet;
}

function getAccountsSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNTS_SHEET);
  if (!sheet) throw new Error('Sheet "' + ACCOUNTS_SHEET + '" not found');
  return sheet;
}

function headerMap_(values) {
  const header = values[0].map(h => String(h).trim().toLowerCase());
  const map = {};
  header.forEach((h, i) => map[h] = i);
  return map;
}

function finYearFromDate_(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1-12
  return (m >= 7) ? (y + '-' + String(y + 1).slice(-2)) : ((y - 1) + '-' + String(y).slice(-2));
}

function finYearBounds_(finYear) {
  const startYear = parseInt(finYear.split('-')[0], 10);
  const start = new Date(startYear, 6, 1);       // 1 Jul
  const end = new Date(startYear + 1, 5, 30);    // 30 Jun
  return { start, end };
}

function compareFinYear_(a, b) {
  return parseInt(a.split('-')[0], 10) - parseInt(b.split('-')[0], 10);
}

function fmtDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------

function getJournalFormData() {
  const values = getJournalSheet_().getDataRange().getValues();
  const col = headerMap_(values);

  let maxFinYear = null;
  let maxJrnlNo = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[col['finyear']]) {
      const fy = String(row[col['finyear']]);
      if (!maxFinYear || compareFinYear_(fy, maxFinYear) > 0) maxFinYear = fy;
    }
    const n = Number(row[col['jrnlno']]);
    if (!isNaN(n) && n > maxJrnlNo) maxJrnlNo = n;
  }

  if (!maxFinYear) maxFinYear = finYearFromDate_(new Date());
  const bounds = finYearBounds_(maxFinYear);

  return {
    finYear: maxFinYear,
    finYearStart: fmtDate_(bounds.start),
    finYearEnd: fmtDate_(bounds.end),
    nextJrnlNo: maxJrnlNo + 1,
    accounts: getAccountsList_()
  };
}

function getAccountsList_() {
  const values = getAccountsSheet_().getDataRange().getValues();
  const col = headerMap_(values);
  const list = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][col['fullacname']]) list.push(String(values[i][col['fullacname']]));
  }
  return list.sort();
}

function submitJournalEntry(entry) {
  const sheet = getJournalSheet_();
  const values = sheet.getDataRange().getValues();
  const col = headerMap_(values);

  const date = new Date(entry.date + 'T00:00:00');
  const bounds = finYearBounds_(entry.finYear);
  if (date < bounds.start || date > bounds.end) {
    throw new Error('Date ' + entry.date + ' is outside FY ' + entry.finYear +
      ' (' + fmtDate_(bounds.start) + ' to ' + fmtDate_(bounds.end) + ')');
  }
  if (!entry.drAccount || !entry.crAccount) throw new Error('Debit and Credit accounts are required');
  if (entry.drAccount === entry.crAccount) throw new Error('Debit and Credit accounts cannot be the same');
  const amount = Number(entry.amount);
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be a positive number');

  let maxJrnlNo = 0;
  for (let i = 1; i < values.length; i++) {
    const n = Number(values[i][col['jrnlno']]);
    if (!isNaN(n) && n > maxJrnlNo) maxJrnlNo = n;
  }
  const jrnlNo = maxJrnlNo + 1;

  const header = values[0].map(h => String(h).trim().toLowerCase());
  const row = header.map(h => {
    switch (h) {
      case 'date': return date;
      case 'jrnlno': return jrnlNo;
      case 'draccount': return entry.drAccount;
      case 'craccount': return entry.crAccount;
      case 'details': return entry.details || '';
      case 'amount': return amount;
      case 'finyear': return entry.finYear;
      default: return '';
    }
  });

  sheet.appendRow(row);
  return { jrnlNo: jrnlNo };
}

// ---------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------

function getAccountsFormData() {
  return { types: Object.keys(TYPE_PREFIX) };
}

function getNextAcno(type) {
  const prefix = TYPE_PREFIX[type];
  if (!prefix) throw new Error('Unknown account type: ' + type);

  const values = getAccountsSheet_().getDataRange().getValues();
  const col = headerMap_(values);
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    const acno = String(values[i][col['acno']]);
    if (acno.charAt(0) === prefix && acno.length === 4) {
      const n = parseInt(acno.slice(1), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return prefix + String(max + 1).padStart(3, '0');
}

function submitAccountEntry(entry) {
  const sheet = getAccountsSheet_();
  const values = sheet.getDataRange().getValues();
  const col = headerMap_(values);

  if (!/^[1-4]\d{3}$/.test(entry.acno)) {
    throw new Error('Account number must be 4 digits, first digit 1-4 (1=Asset,2=Liability,3=Payment,4=Receipt)');
  }
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col['acno']]) === entry.acno) {
      throw new Error('Account number ' + entry.acno + ' already exists');
    }
  }
  if (!entry.acname) throw new Error('Account name is required');
  if (!entry.type) throw new Error('Account type is required');

  const fullacname = entry.acno + '-' + entry.acname;
  const header = values[0].map(h => String(h).trim().toLowerCase());
  const row = header.map(h => {
    switch (h) {
      case 'acno': return entry.acno;
      case 'bsie': return entry.bsie || '';
      case 'type': return entry.type;
      case 'acname': return entry.acname;
      case 'fullacname': return fullacname;
      default: return '';
    }
  });

  sheet.appendRow(row);
  return { fullacname: fullacname };
}
