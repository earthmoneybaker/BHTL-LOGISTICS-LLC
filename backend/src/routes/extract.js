const express = require('express');
const multer = require('multer');
const db = require('../db');

const router = express.Router();

const { authenticate } = require('./../middleware/auth');
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function str(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  return String(v).trim();
}
function num(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

const EXPENSE_CATEGORIES = [
  'fuel','repairs_maintenance','truck_payments_leases','insurance','tolls',
  'permits_registration','factoring_fees','dispatch_loadboard_software',
  'meals_travel','lumper_unloading','office_phone_internet','bank_fees','other'
];

async function callGemini(base64, mimeType, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error('Gemini API error:', JSON.stringify(data));
    throw new Error(data.error?.message || 'Gemini API request failed');
  }
  const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOut) throw new Error('No response returned from Gemini');
  return JSON.parse(textOut);
}

function requireFileAndKey(req, res) {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return false; }
  if (!process.env.GEMINI_API_KEY) { res.status(500).json({ error: 'Gemini API key not configured' }); return false; }
  return true;
}

// ============ LOAD DOCUMENT (rate con / BOL / POD) ============
router.post('/load-document', upload.single('file'), async (req, res) => {
  if (!requireFileAndKey(req, res)) return;
  try {
    const base64 = req.file.buffer.toString('base64');
    const prompt = `You are extracting structured data from a trucking document (rate confirmation, bill of lading, or proof of delivery). Return ONLY a JSON object, no other text:
{
  "load_number": string or null, "po_number": string or null, "bol_number": string or null,
  "customer_name": string or null, "origin_address": string or null, "origin_city": string or null,
  "origin_state": string or null, "origin_zip": string or null, "destination_address": string or null,
  "destination_city": string or null, "destination_state": string or null, "destination_zip": string or null,
  "pickup_date": string or null (YYYY-MM-DD), "delivery_date": string or null (YYYY-MM-DD),
  "rate": number or null, "weight": number or null, "commodity": string or null, "notes": string or null
}
Use null for anything you cannot find with confidence.`;
    const extracted = await callGemini(base64, req.file.mimetype, prompt);
    res.json({ extracted });
  } catch (err) {
    console.error('Extraction error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/create-load', async (req, res) => {
  try {
    const b = req.body;
    let customer_id = null;
    const customerName = str(b.customer_name);
    let customerCreated = false;
    if (customerName) {
      const existing = await db.query('SELECT id FROM customers WHERE LOWER(name) = LOWER($1) LIMIT 1', [customerName]);
      if (existing.rows.length) customer_id = existing.rows[0].id;
      else {
        const created = await db.query('INSERT INTO customers (name) VALUES ($1) RETURNING id', [customerName]);
        customer_id = created.rows[0].id;
        customerCreated = true;
      }
    }
    const result = await db.query(
      `INSERT INTO loads (load_number, customer_id, origin_address, origin_city, origin_state, origin_zip,
        destination_address, destination_city, destination_state, destination_zip,
        pickup_date, delivery_date, rate, weight, commodity, po_number, bol_number, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'booked')
       RETURNING id`,
      [str(b.load_number), customer_id, str(b.origin_address), str(b.origin_city), str(b.origin_state), str(b.origin_zip),
       str(b.destination_address), str(b.destination_city), str(b.destination_state), str(b.destination_zip),
       str(b.pickup_date), str(b.delivery_date), num(b.rate), num(b.weight), str(b.commodity),
       str(b.po_number), str(b.bol_number), str(b.notes)]
    );
    res.json({ id: result.rows[0].id, customerCreated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ FUEL RECEIPT ============
router.post('/fuel-receipt', upload.single('file'), async (req, res) => {
  if (!requireFileAndKey(req, res)) return;
  try {
    const base64 = req.file.buffer.toString('base64');
    const prompt = `Extract data from this fuel receipt. Return ONLY a JSON object:
{
  "purchase_date": string or null (YYYY-MM-DD), "state": string or null (2-letter US state code),
  "gallons": number or null, "cost_per_gallon": number or null, "total_cost": number or null,
  "vendor": string or null
}
Use null for anything unclear. Do not guess the state if not shown on the receipt.`;
    const extracted = await callGemini(base64, req.file.mimetype, prompt);
    res.json({ extracted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ MAINTENANCE / REPAIR INVOICE ============
router.post('/maintenance-invoice', upload.single('file'), async (req, res) => {
  if (!requireFileAndKey(req, res)) return;
  try {
    const base64 = req.file.buffer.toString('base64');
    const prompt = `Extract data from this truck/trailer repair or maintenance invoice. Return ONLY a JSON object:
{
  "service_date": string or null (YYYY-MM-DD), "service_type": string or null (short description like "Oil Change", "Brake Repair", "Tire Replacement"),
  "description": string or null (fuller details of work performed), "vendor": string or null, "cost": number or null,
  "mileage_at_service": number or null
}
Use null for anything unclear.`;
    const extracted = await callGemini(base64, req.file.mimetype, prompt);
    res.json({ extracted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ GENERAL EXPENSE RECEIPT / BILL ============
router.post('/expense-receipt', upload.single('file'), async (req, res) => {
  if (!requireFileAndKey(req, res)) return;
  try {
    const base64 = req.file.buffer.toString('base64');
    const prompt = `Extract data from this business expense receipt or bill for a trucking company. Return ONLY a JSON object:
{
  "category": string or null (must be exactly one of: ${EXPENSE_CATEGORIES.join(', ')}),
  "amount": number or null, "expense_date": string or null (YYYY-MM-DD),
  "vendor": string or null, "description": string or null
}
Use null for anything unclear. If unsure of category, use "other".`;
    const extracted = await callGemini(base64, req.file.mimetype, prompt);
    res.json({ extracted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PAYROLL / DRIVER SETTLEMENT STATEMENT ============
router.post('/payroll-document', upload.single('file'), async (req, res) => {
  if (!requireFileAndKey(req, res)) return;
  try {
    const base64 = req.file.buffer.toString('base64');
    const prompt = `Extract data from this driver settlement or payroll statement. Return ONLY a JSON object:
{
  "person_name": string or null (driver's full name), "period_start": string or null (YYYY-MM-DD),
  "period_end": string or null (YYYY-MM-DD), "gross_pay": number or null, "deductions": number or null,
  "net_pay": number or null
}
Use null for anything unclear.`;
    const extracted = await callGemini(base64, req.file.mimetype, prompt);
    res.json({ extracted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ BANK STATEMENT (batch of transactions) ============
router.post('/bank-statement', upload.single('file'), async (req, res) => {
  if (!requireFileAndKey(req, res)) return;
  try {
    const base64 = req.file.buffer.toString('base64');
    const prompt = `You are reading a business bank statement for a trucking company (BHTL Logistics LLC). Extract every transaction line into a JSON array. Return ONLY a JSON object with a "transactions" array:
{
  "transactions": [
    {
      "date": string (YYYY-MM-DD),
      "description": string (as shown on the statement),
      "amount": number (always positive),
      "direction": "debit" or "credit",
      "classification": "expense" or "revenue" or "review",
      "category": string or null (required if classification is "expense", must be exactly one of: ${EXPENSE_CATEGORIES.join(', ')})
    }
  ]
}
Rules:
- "credit" (money in) that looks like a freight/customer payment → classification "revenue".
- "debit" (money out) that clearly matches a business expense category → classification "expense" with the best-fit category.
- Anything ambiguous, or that looks like an internal transfer, owner draw, loan proceeds/payment, factoring activity, or a personal/mixed transaction → classification "review" (do not guess).
- Include every transaction on the statement, do not skip any.`;
    const result = await callGemini(base64, req.file.mimetype, prompt);
    res.json(result);
  } catch (err) {
    console.error('Bank statement extraction error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ BATCH SAVE (from reviewed bank statement transactions) ============
router.post('/create-batch', async (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });

  let expensesCreated = 0;
  let revenueCreated = 0;
  const errors = [];

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    try {
      if (t.classification === 'expense') {
        if (!EXPENSE_CATEGORIES.includes(t.category)) throw new Error(`Invalid category: ${t.category}`);
        await db.query(
          `INSERT INTO expenses (category, amount, expense_date, description, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [t.category, num(t.amount), str(t.date), str(t.description), req.user?.id || null]
        );
        expensesCreated++;
      } else if (t.classification === 'revenue') {
        await db.query(
          `INSERT INTO other_revenue (description, amount, revenue_date, created_by)
           VALUES ($1,$2,$3,$4)`,
          [str(t.description) || 'Bank deposit', num(t.amount), str(t.date), req.user?.id || null]
        );
        revenueCreated++;
      }
      // 'review' rows are intentionally skipped — not auto-saved
    } catch (err) {
      errors.push({ row: i + 1, message: err.message });
    }
  }

  res.json({ expensesCreated, revenueCreated, failed: errors.length, errors });
});

module.exports = router;
