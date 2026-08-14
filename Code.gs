/**
 * Data Entry — Journal & Accounts (Web App API)
 * ------------------------------------------------
 * Deploy this as a Web App (Deploy > New deployment > Web app):
 *   Execute as:  Me
 *   Who has access: Anyone
 * Copy the resulting /exec URL into WEB_APP_URL at the top of
 * JournalForm.html and AccountsForm.html (hosted on GitHub Pages).
 *
 * Sheet 1 "Journal"   columns: date, jrnlNo, drAccount, crAccount, details, amount, finYear
 * Sheet 2 "Accounts"  columns: acno, bsie, type, acname, fullacname
 * Sheet 3 "BSIEcodes" columns: Type, mapping, Label
 *   Type is one of: Assets, Liabilities, Expenditure, Income
 */

const JOURNAL_SHEET = 'Journal';
const ACCOUNTS_SHEET = 'Accounts';
const BSIE_SHEET = 'BSIEcodes';

// acno first digit <-> account type
const TYPE_PREFIX = { 'ASSET': '1', 'LIABILITY': '2', 'PAYMENT': '3', 'RECEIPT': '4' };

// BSIEcodes "Type" column <-> internal type key
const BSIE_TYPE_TO_KEY = { 'ASSETS': 'ASSET', 'LIABILITIES': 'LIABILITY', 'EXPENDITURE': 'PAYMENT', 'INCOME': 'RECEIPT' };

// Special BSIE mapping codes used as computed surplus/deficit plug lines
const LIABILITY_SURPLUS_CODE = '2-05'; // Excess of Income over Expenditure Carried over
const ASSET_DEFICIT_CODE = '1-07';     // Excess of Expenditure over Income Carried over
const EXPENDITURE_SURPLUS_CODE = '3-10'; // Excess of Income over Expenditure (I&E statement)
const INCOME_DEFICIT_CODE = '4-06';      // Excess of Expenditure over Income (I&E statement)

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
    else if (action === 'finYears') data = { finYears: getFinYearList_() };
    else if (action === 'ledger') data = getLedgerData(e.parameter.finYear, e.parameter.acno || 'ALL');
    else if (action === 'bsie') data = getBsieData(e.parameter.finYear);
    else if (action === 'closeYearPreview') data = previewCloseFinancialYear(e.parameter.finYear);
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
    else if (body.action === 'closeYear') data = closeFinancialYear(body.finYear, body.passcode);
    else if (body.action === 'email') data = sendReportEmail(body.toEmail, body.subject, body.htmlBody);
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

function getBsieSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BSIE_SHEET);
  if (!sheet) throw new Error('Sheet "' + BSIE_SHEET + '" not found');
  return sheet;
}

/** Reads BSIEcodes sheet -> [{type:'Assets', typeKey:'ASSET', mapping:'1-01', label:'Fixed Deposits'}, ...] */
function getBsieCodes_() {
  const values = getBsieSheet_().getDataRange().getValues();
  const col = headerMap_(values);
  const list = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const mapping = String(row[col['mapping']] || '').trim();
    if (!mapping) continue;
    const typeRaw = String(row[col['type']] || '').trim();
    const typeKey = BSIE_TYPE_TO_KEY[typeRaw.toUpperCase()];
    if (!typeKey) throw new Error('Unknown BSIE Type "' + typeRaw + '" in ' + BSIE_SHEET + ' (expected Assets/Liabilities/Expenditure/Income)');
    list.push({
      type: typeRaw,
      typeKey: typeKey,
      mapping: mapping,
      label: String(row[col['label']] || mapping).trim()
    });
  }
  return list;
}

function getBsieCodeInfo_(mapping) {
  const codes = getBsieCodes_();
  const found = codes.find(c => c.mapping === mapping);
  if (!found) throw new Error('Unknown BSIE mapping code: ' + mapping);
  return found;
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
  return { bsieCodes: getBsieCodes_() };
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

  if (!entry.bsie) throw new Error('BSIE mapping is required');
  const bsieInfo = getBsieCodeInfo_(entry.bsie); // throws if unknown code
  const type = bsieInfo.typeKey;

  if (!/^[1-4]\d{3}$/.test(entry.acno)) {
    throw new Error('Account number must be 4 digits, first digit 1-4 (1=Asset,2=Liability,3=Payment,4=Receipt)');
  }
  if (entry.acno.charAt(0) !== TYPE_PREFIX[type]) {
    throw new Error('Account number ' + entry.acno + ' should start with ' + TYPE_PREFIX[type] +
      ' for BSIE type ' + bsieInfo.type + ' (' + type + ')');
  }
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col['acno']]) === entry.acno) {
      throw new Error('Account number ' + entry.acno + ' already exists');
    }
  }
  if (!entry.acname) throw new Error('Account name is required');

  const fullacname = entry.acno + '-' + entry.acname;
  const header = values[0].map(h => String(h).trim().toLowerCase());
  const row = header.map(h => {
    switch (h) {
      case 'acno': return entry.acno;
      case 'bsie': return entry.bsie;
      case 'type': return type;
      case 'acname': return entry.acname;
      case 'fullacname': return fullacname;
      default: return '';
    }
  });

  sheet.appendRow(row);
  return { fullacname: fullacname };
}

// ---------------------------------------------------------------------
// Ledger & BSIE
// ---------------------------------------------------------------------

// Types whose normal balance is Debit - Credit vs Credit - Debit
const DEBIT_NORMAL_TYPES = { 'ASSET': true, 'PAYMENT': true };

function getFinYearList_() {
  const values = getJournalSheet_().getDataRange().getValues();
  const col = headerMap_(values);
  const set = {};
  for (let i = 1; i < values.length; i++) {
    const fy = values[i][col['finyear']];
    if (fy) set[String(fy)] = true;
  }
  return Object.keys(set).sort(compareFinYear_);
}

function getAllAccounts_() {
  const values = getAccountsSheet_().getDataRange().getValues();
  const col = headerMap_(values);
  const list = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[col['acno']]) continue;
    list.push({
      acno: String(row[col['acno']]),
      bsie: String(row[col['bsie']] || ''),
      type: String(row[col['type']] || '').toUpperCase(),
      acname: String(row[col['acname']] || ''),
      fullacname: String(row[col['fullacname']] || '')
    });
  }
  return list;
}

function getJournalRowsForFY_(finYear) {
  const values = getJournalSheet_().getDataRange().getValues();
  const col = headerMap_(values);
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[col['finyear']]) !== finYear) continue;
    rows.push({
      date: row[col['date']],
      jrnlNo: row[col['jrnlno']],
      drAccount: String(row[col['draccount']]),
      crAccount: String(row[col['craccount']]),
      details: String(row[col['details']] || ''),
      amount: Number(row[col['amount']]) || 0
    });
  }
  rows.sort((a, b) => {
    const d = new Date(a.date) - new Date(b.date);
    return d !== 0 ? d : (Number(a.jrnlNo) - Number(b.jrnlNo));
  });
  return rows;
}

/**
 * Per-account Total Debits / Total Credits / Balance for a given finYear,
 * mirroring the Accounts sheet formulas but scoped to one year.
 */
function computeAccountBalances_(finYear) {
  const accounts = getAllAccounts_();
  const rows = getJournalRowsForFY_(finYear);

  const byFullName = {};
  accounts.forEach(a => {
    byFullName[a.fullacname] = { account: a, totalDebits: 0, totalCredits: 0 };
  });

  rows.forEach(r => {
    if (byFullName[r.drAccount]) byFullName[r.drAccount].totalDebits += r.amount;
    if (byFullName[r.crAccount]) byFullName[r.crAccount].totalCredits += r.amount;
  });

  Object.keys(byFullName).forEach(k => {
    const rec = byFullName[k];
    const debitNormal = !!DEBIT_NORMAL_TYPES[rec.account.type];
    rec.balance = debitNormal
      ? (rec.totalDebits - rec.totalCredits)
      : (rec.totalCredits - rec.totalDebits);
  });

  return byFullName; // fullacname -> {account, totalDebits, totalCredits, balance}
}

/**
 * Ledger for a finYear. acno = 'ALL' for every account, or a specific fullacname.
 */
function getLedgerData(finYear, acnoOrAll) {
  if (!finYear) throw new Error('finYear is required');
  const accounts = getAllAccounts_();
  const rows = getJournalRowsForFY_(finYear);

  const targets = (acnoOrAll === 'ALL')
    ? accounts.slice().sort((a, b) => a.acno.localeCompare(b.acno))
    : accounts.filter(a => a.fullacname === acnoOrAll);

  const result = targets.map(acc => {
    const debitNormal = !!DEBIT_NORMAL_TYPES[acc.type];
    let running = 0;
    const entries = [];
    rows.forEach(r => {
      let debit = 0, credit = 0, particulars = '';
      if (r.drAccount === acc.fullacname) { debit = r.amount; particulars = r.crAccount; }
      else if (r.crAccount === acc.fullacname) { credit = r.amount; particulars = r.drAccount; }
      else return;
      running += debitNormal ? (debit - credit) : (credit - debit);
      entries.push({
        date: fmtDate_(new Date(r.date)),
        jrnlNo: r.jrnlNo,
        particulars: particulars,
        details: r.details,
        debit: debit,
        credit: credit,
        balance: running
      });
    });
    return {
      acno: acc.acno,
      fullacname: acc.fullacname,
      type: acc.type,
      entries: entries,
      closingBalance: running
    };
  }).filter(a => acnoOrAll !== 'ALL' || a.entries.length > 0);

  return { finYear: finYear, accounts: result };
}

/**
 * Balance Sheet + Income & Expenditure for a finYear, grouped by BSIE code
 * using the BSIEcodes sheet as the structural source of truth (labels,
 * ordering, and inclusion of zero-balance lines).
 */
function getBsieData(finYear) {
  if (!finYear) throw new Error('finYear is required');
  const balances = computeAccountBalances_(finYear);
  const codes = getBsieCodes_();

  function sectionFor(typeKey) {
    return codes.filter(c => c.typeKey === typeKey).map(c => {
      const lines = [];
      let subtotal = 0;
      Object.keys(balances).forEach(fullacname => {
        const rec = balances[fullacname];
        if (rec.account.type === typeKey && rec.account.bsie === c.mapping) {
          lines.push({ acno: rec.account.acno, acname: rec.account.acname, balance: rec.balance });
          subtotal += rec.balance;
        }
      });
      return { mapping: c.mapping, label: c.label, lines: lines, subtotal: subtotal };
    });
  }

  const liabilities = sectionFor('LIABILITY');
  const assets = sectionFor('ASSET');
  const expenditure = sectionFor('PAYMENT');
  const income = sectionFor('RECEIPT');

  const sum = arr => arr.reduce((s, g) => s + g.subtotal, 0);
  const excess = sum(income) - sum(expenditure); // positive = surplus, negative = deficit

  function setPlug(list, mapping, amount) {
    const g = list.find(x => x.mapping === mapping);
    if (!g) return; // code not present in BSIEcodes sheet — silently skip
    if (Math.abs(amount) > 0.005) {
      g.subtotal = amount;
      g.lines = [{ acno: '', acname: '(computed)', balance: amount }];
    } else {
      g.subtotal = 0;
      g.lines = [];
    }
  }

  if (excess >= 0) {
    setPlug(liabilities, LIABILITY_SURPLUS_CODE, excess);
    setPlug(assets, ASSET_DEFICIT_CODE, 0);
    setPlug(expenditure, EXPENDITURE_SURPLUS_CODE, excess);
    setPlug(income, INCOME_DEFICIT_CODE, 0);
  } else {
    setPlug(liabilities, LIABILITY_SURPLUS_CODE, 0);
    setPlug(assets, ASSET_DEFICIT_CODE, -excess);
    setPlug(expenditure, EXPENDITURE_SURPLUS_CODE, 0);
    setPlug(income, INCOME_DEFICIT_CODE, -excess);
  }

  const totalLiabilities = sum(liabilities);
  const totalAssets = sum(assets);
  const totalExpenditure = sum(expenditure);
  const totalIncome = sum(income);

  return {
    finYear: finYear,
    liabilities: liabilities,
    assets: assets,
    income: income,
    expenditure: expenditure,
    excess: excess,
    totalLiabilities: totalLiabilities,
    totalAssets: totalAssets,
    balanced: Math.abs(totalLiabilities - totalAssets) < 0.01,
    totalIncome: totalIncome,
    totalExpenditure: totalExpenditure
  };
}

// ---------------------------------------------------------------------
// Financial Year Closing
// ---------------------------------------------------------------------

function checkPasscode_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
  if (!expected) throw new Error('Admin passcode is not configured. In Apps Script: Project Settings > Script Properties, add ADMIN_PASSCODE.');
  if (!candidate || candidate !== expected) throw new Error('Incorrect passcode');
}

function nextFinYear_(finYear) {
  const startYear = parseInt(finYear.split('-')[0], 10);
  const newStart = startYear + 1;
  return newStart + '-' + String(newStart + 1).slice(-2);
}

/**
 * Computes the opening-balance journal entries that Financial Year Closing
 * would post, without writing anything. Real (Asset/Liability) accounts are
 * carried forward against the account mapped to BSIE code 2-01; Payment/
 * Receipt (nominal) accounts are not carried forward — they naturally start
 * the new FY at zero since the Journal is filtered per finYear.
 */
function buildCloseYearPlan_(oldFinYear) {
  if (!oldFinYear) throw new Error('finYear is required');
  const newFinYear = nextFinYear_(oldFinYear);
  const balances = computeAccountBalances_(oldFinYear);
  const accounts = getAllAccounts_();

  const bfCandidates = accounts.filter(a => a.type === 'LIABILITY' && a.bsie === '2-01');
  if (bfCandidates.length === 0) throw new Error('No account is mapped to BSIE code 2-01 (B/f Previous Balance Sheet) — add one in Accounts before closing.');
  if (bfCandidates.length > 1) throw new Error('More than one account is mapped to BSIE code 2-01 — there should be exactly one.');
  const bfAccount = bfCandidates[0];

  const entries = [];
  accounts.forEach(acc => {
    if (acc.fullacname === bfAccount.fullacname) return;
    if (acc.type !== 'ASSET' && acc.type !== 'LIABILITY') return; // nominal accounts reset, not carried
    const rec = balances[acc.fullacname];
    const balance = rec ? rec.balance : 0;
    if (Math.abs(balance) < 0.005) return;

    if (acc.type === 'ASSET') {
      entries.push({ drAccount: acc.fullacname, crAccount: bfAccount.fullacname, amount: Math.round(balance * 100) / 100 });
    } else {
      entries.push({ drAccount: bfAccount.fullacname, crAccount: acc.fullacname, amount: Math.round(balance * 100) / 100 });
    }
  });

  return { oldFinYear: oldFinYear, newFinYear: newFinYear, bfAccount: bfAccount.fullacname, entries: entries };
}

function previewCloseFinancialYear(oldFinYear) {
  const plan = buildCloseYearPlan_(oldFinYear);
  const existing = getJournalRowsForFY_(plan.newFinYear);
  return {
    oldFinYear: plan.oldFinYear,
    newFinYear: plan.newFinYear,
    bfAccount: plan.bfAccount,
    entries: plan.entries,
    newFinYearAlreadyHasEntries: existing.length > 0
  };
}

function closeFinancialYear(oldFinYear, passcode) {
  checkPasscode_(passcode);
  const plan = buildCloseYearPlan_(oldFinYear);

  const existing = getJournalRowsForFY_(plan.newFinYear);
  if (existing.length > 0) {
    throw new Error('FY ' + plan.newFinYear + ' already has ' + existing.length +
      ' journal entries — closing again would duplicate opening balances. Remove them first if you need to redo this.');
  }
  if (plan.entries.length === 0) throw new Error('Nothing to carry forward — no non-zero Asset/Liability balances found for ' + oldFinYear);

  const sheet = getJournalSheet_();
  const values = sheet.getDataRange().getValues();
  const col = headerMap_(values);
  const header = values[0].map(h => String(h).trim().toLowerCase());

  let maxJrnlNo = 0;
  for (let i = 1; i < values.length; i++) {
    const n = Number(values[i][col['jrnlno']]);
    if (!isNaN(n) && n > maxJrnlNo) maxJrnlNo = n;
  }

  const openDate = finYearBounds_(plan.newFinYear).start;
  const rows = plan.entries.map((e, idx) => {
    const jrnlNo = maxJrnlNo + 1 + idx;
    return header.map(h => {
      switch (h) {
        case 'date': return openDate;
        case 'jrnlno': return jrnlNo;
        case 'draccount': return e.drAccount;
        case 'craccount': return e.crAccount;
        case 'details': return 'Opening Balance b/f from ' + plan.oldFinYear;
        case 'amount': return e.amount;
        case 'finyear': return plan.newFinYear;
        default: return '';
      }
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
  return { newFinYear: plan.newFinYear, entriesCreated: rows.length };
}

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------

function sendReportEmail(toEmail, subject, htmlBody) {
  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) throw new Error('Please enter a valid email address');
  if (!subject) subject = 'Report';
  MailApp.sendEmail({
    to: toEmail,
    subject: subject,
    htmlBody: htmlBody,
    body: 'This report requires an HTML-capable email client to view.'
  });
  return { sent: true, to: toEmail };
}
