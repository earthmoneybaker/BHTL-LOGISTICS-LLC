const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function num(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function str(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  return String(v).trim();
}

// ---------- Simple built-in CSV parser (no external package needed) ----------
function parseCsv(buffer) {
  const text = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];
  const splitLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result.map(v => v.trim());
  };
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] !== undefined ? values[i] : ''; });
    return obj;
  });
}

// ---------- Read CSV or Excel into an array of row-objects ----------
function parseFile(buffer, filename) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }
  return parseCsv(buffer);
}

// ---------- Field definitions per import type, with common alternate names ----------
const FIELD_DEFS = {
  invoices: [
    { field: 'invoice_number', label: 'Invoice Number', required: true, synonyms: ['invoice number','invoice no','invoice_no','invoice','inv number','inv no'] },
    { field: 'customer_name', label: 'Customer', required: false, synonyms: ['customer','customer name','client','client name','bill to','company'] },
    { field: 'load_number', label: 'Load Number', required: false, synonyms: ['load','load number','load no'] },
    { field: 'amount', label: 'Amount', required: true, synonyms: ['amount','total','revenue','amount paid','value','invoice amount'] },
    { field: 'date_issued', label: 'Date Issued', required: true, synonyms: ['date issued','issued date','invoice date','date'] },
    { field: 'due_date', label: 'Due Date', required: true, synonyms: ['due date','due','payment due'] },
    { field: 'status', label: 'Status', required: false, synonyms: ['status','payment status'] },
    { field: 'factoring_company', label: 'Factoring Company', required: false, synonyms: ['factoring','factoring company'] },
    { field: 'notes', label: 'Notes', required: false, synonyms: ['notes','memo','description','comments'] },
  ],
  expenses: [
    { field: 'category', label: 'Category', required: true, synonyms: ['category','type','expense type','expense category'] },
    { field: 'amount', label: 'Amount', required: true, synonyms: ['amount','cost','total','price'] },
    { field: 'expense_date', label: 'Date', required: true, synonyms: ['date','expense date','transaction date'] },
    { field: 'description', label: 'Description', required: false, synonyms: ['description','memo','details'] },
    { field: 'truck_unit', label: 'Truck Unit', required: false, synonyms: ['truck','unit','truck number','truck unit','vehicle'] },
    { field: 'driver_name', label: 'Driver', required: false, synonyms: ['driver','driver name'] },
    { field: 'load_number', label: 'Load Number', required: false, synonyms: ['load','load number','load no'] },
    { field: 'vendor', label: 'Vendor', required: false, synonyms: ['vendor','payee','merchant','paid to'] },
    { field: 'receipt_ref', label: 'Receipt Ref', required: false, synonyms: ['receipt','receipt number','reference','ref'] },
  ],
  payroll: [
    { field: 'person_name', label: 'Person Name', required: true, synonyms: ['name','driver','driver name','employee','person'] },
    { field: 'period_start', label: 'Period Start', required: true, synonyms: ['period start','start date','pay period start'] },
    { field: 'period_end', label: 'Period End', required: true, synonyms: ['period end','end date','pay period end'] },
    { field: 'pay_type', label: 'Pay Type', required: false, synonyms: ['pay type','type'] },
    { field: 'pay_rate', label: 'Pay Rate', required: false, synonyms: ['rate','pay rate'] },
    { field: 'gross_pay', label: 'Gross Pay', required: true, synonyms: ['gross','gross pay','gross amount'] },
    { field: 'deductions', label: 'Deductions', required: false, synonyms: ['deductions','deduction'] },
    { field: 'net_pay', label: 'Net Pay', required: false, synonyms: ['net','net pay','net amount'] },
    { field: 'notes', label: 'Notes', required: false, synonyms: ['notes','memo','comments'] },
    { field: 'status', label: 'Status', required: false, synonyms: ['status'] },
  ],
};

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------- Guess which uploaded column matches which expected field ----------
function guessMapping(headers, fieldDefs) {
  const mapping = {};
  const usedHeaders = new Set();
  for (const def of fieldDefs) {
    const candidates = [def.field, def.label, ...def.synonyms].map(normalize);
    let match = headers.find(h => !usedHeaders.has(h) && candidates.includes(normalize(h)));
    if (!match) {
      match = headers.find(h => !usedHeaders.has(h) && candidates.some(c => normalize(h).includes(c) || c.includes(normalize(h))));
    }
    if (match) {
      mapping[def.field] = match;
      usedHeaders.add(match);
    } else {
      mapping[def.field] = null;
    }
  }
  return mapping;
}

function applyMapping(rawRow, mapping) {
  const out = {};
  for (const field of Object.keys(mapping)) {
    const header = mapping[field];
    out[field] = header ? rawRow[header] : '';
  }
  return out;
}

// ---------- ANALYZE: read file, return headers + suggested mapping + preview ----------
router.post('/:type/analyze', upload.single('file'), async (req, res) => {
  const type = req.params.type;
  if (!FIELD_DEFS[type]) return res.status(400).json({ error: 'Unknown import type' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let rows;
  try {
    rows = parseFile(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: 'Could not read file: ' + err.message });
  }
  if (!rows.length) return res.status(400).json({ error: 'File appears to be empty' });

  const headers = Object.keys(rows[0]);
  const suggestedMapping = guessMapping(headers, FIELD_DEFS[type]);

  res.json({
    headers,
    fieldDefs: FIELD_DEFS[type],
    suggestedMapping,
    sampleRows: rows.slice(0, 5),
    totalRows: rows.length,
  });
});

// ---------- Lookups ----------
async function lookupCustomerId(name) {
  if (!name) return null;
  const r = await db.query('SELECT id FROM customers WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);
  return r.rows.length ? r.rows[0].id : null;
}
async function lookupDriverId(name) {
  if (!name) return null;
  const r = await db.query(
    `SELECT id FROM drivers WHERE LOWER(first_name || ' ' || last_name) = LOWER($1) LIMIT 1`,
    [name]
  );
  return r.rows.length ? r.rows[0].id : null;
}
async function lookupTruckId(unitNumber) {
  if (!unitNumber) return null;
  const r = await db.query('SELECT id FROM trucks WHERE LOWER(unit_number) = LOWER($1) LIMIT 1', [unitNumber]);
  return r.rows.length ? r.rows[0].id : null;
}
async function lookupLoadId(loadNumber) {
  if (!loadNumber) return null;
  const r = await db.query('SELECT id FROM loads WHERE LOWER(load_number) = LOWER($1) LIMIT 1', [loadNumber]);
  return r.rows.length ? r.rows[0].id : null;
}

function getRows(req, type) {
  const rawRows = parseFile(req.file.buffer, req.file.originalname);
  if (!req.body.mapping) return rawRows;
  const mapping = JSON.parse(req.body.mapping);
  return rawRows.map(r => applyMapping(r, mapping));
}

// ============ INVOICES ============
router.post('/invoices', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let records;
  try {
    records = getRows(req, 'invoices');
  } catch (err) {
    return res.status(400).json({ error: 'Could not read file: ' + err.message });
  }

  let imported = 0;
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;
    try {
      const invoice_number = str(row.invoice_number);
      const amount = num(row.amount);
      const date_issued = str(row.date_issued);
      const due_date = str(row.due_date);
      if (!invoice_number) throw new Error('Missing invoice_number');
      if (amount === null) throw new Error('Missing or invalid amount');
      if (!date_issued) throw new Error('Missing date_issued');
      if (!due_date) throw new Error('Missing due_date');

      const customer_name = str(row.customer_name);
      const customer_id = await lookupCustomerId(customer_name);
      if (customer_name && !customer_id) {
        throw new Error(`Customer not found: "${row.customer_name}"`);
      }
      const load_id = await lookupLoadId(str(row.load_number));

      await db.query(
        `INSERT INTO invoices (invoice_number, customer_id, load_id, amount, date_issued, due_date, status, factoring_company, notes)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'unpaid'),$8,$9)`,
        [invoice_number, customer_id, load_id, amount, date_issued, due_date,
         str(row.status), str(row.factoring_company), str(row.notes)]
      );
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, message: err.message });
    }
  }

  res.json({ imported, failed: errors.length, errors });
});

// ============ EXPENSES ============
router.post('/expenses', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let records;
  try {
    records = getRows(req, 'expenses');
  } catch (err) {
    return res.status(400).json({ error: 'Could not read file: ' + err.message });
  }

  let imported = 0;
  const errors = [];
  const validCategories = ['fuel','repairs_maintenance','truck_payments_leases','insurance','tolls','permits_registration','factoring_fees','dispatch_loadboard_software','meals_travel','lumper_unloading','office_phone_internet','bank_fees','other'];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;
    try {
      const category = str(row.category);
      const amount = num(row.amount);
      const expense_date = str(row.expense_date);
      if (!category || !validCategories.includes(category.toLowerCase())) {
        throw new Error(`Invalid category: "${row.category}". Must be one of: ${validCategories.join(', ')}`);
      }
      if (amount === null) throw new Error('Missing or invalid amount');
      if (!expense_date) throw new Error('Missing expense_date');

      const truck_id = await lookupTruckId(str(row.truck_unit));
      const driver_id = await lookupDriverId(str(row.driver_name));
      const load_id = await lookupLoadId(str(row.load_number));

      await db.query(
        `INSERT INTO expenses (category, amount, expense_date, description, truck_id, driver_id, load_id, vendor, receipt_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [category.toLowerCase(), amount, expense_date, str(row.description), truck_id, driver_id, load_id,
         str(row.vendor), str(row.receipt_ref)]
      );
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, message: err.message });
    }
  }

  res.json({ imported, failed: errors.length, errors });
});

// ============ PAYROLL ============
router.post('/payroll', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let records;
  try {
    records = getRows(req, 'payroll');
  } catch (err) {
    return res.status(400).json({ error: 'Could not read file: ' + err.message });
  }

  let imported = 0;
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;
    try {
      const person_name = str(row.person_name);
      const period_start = str(row.period_start);
      const period_end = str(row.period_end);
      const gross_pay = num(row.gross_pay);
      if (!person_name) throw new Error('Missing person_name');
      if (!period_start) throw new Error('Missing period_start');
      if (!period_end) throw new Error('Missing period_end');
      if (gross_pay === null) throw new Error('Missing or invalid gross_pay');

      const driver_id = await lookupDriverId(person_name);
      if (!driver_id) throw new Error(`Driver not found: "${person_name}"`);

      const deductions = num(row.deductions) || 0;
      const netFromFile = num(row.net_pay);
      const net_pay = netFromFile !== null ? netFromFile : (gross_pay - deductions);

      await db.query(
        `INSERT INTO payroll_records (person_id, person_type, driver_id, period_start, period_end, pay_type, pay_rate, gross_pay, deductions, net_pay, notes, status)
         VALUES ($1,'driver',$1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'paid'))`,
        [driver_id, period_start, period_end, str(row.pay_type), num(row.pay_rate), gross_pay, deductions, net_pay, str(row.notes), str(row.status)]
      );
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, message: err.message });
    }
  }

  res.json({ imported, failed: errors.length, errors });
});

module.exports = router;
