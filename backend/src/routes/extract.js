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

// ============ PASTE RATE CONFIRMATION (pure text parsing — no API usage) ============

/**
 * Normalises a raw date string found in text into YYYY-MM-DD.
 * Handles: MM/DD/YYYY, MM-DD-YYYY, Month DD YYYY, DD Month YYYY, YYYY-MM-DD.
 * Returns null when uncertain.
 */
function parseDate(raw) {
  if (!raw) return null;
  raw = raw.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY or MM-DD-YYYY
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  // Month name variants
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  m = raw.match(/^(\w{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) {
    const mo = months[m[1].toLowerCase().slice(0,3)];
    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  m = raw.match(/^(\d{1,2})\s+(\w{3,9})\.?\s+(\d{4})$/i);
  if (m) {
    const mo = months[m[2].toLowerCase().slice(0,3)];
    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

/**
 * Extract the most likely dollar amount that is a "carrier rate".
 * Strategy: look for lines that contain rate-related keywords AND a dollar value.
 * Returns { value, ambiguous } where ambiguous=true means multiple candidates found.
 */
function extractRate(text) {
  const lines = text.split('\n');
  const rateKeywords = /carrier\s*rate|agreed\s*rate|total\s*rate|load\s*rate|freight\s*rate|pay(?:ment)?(?:\s*amount)?|all[-\s]in\s*rate|flat\s*rate|linehaul/i;
  const dollarPattern = /\$\s*([\d,]+(?:\.\d{1,2})?)|(?<!\d)([\d,]{3,}(?:\.\d{1,2})?)(?=\s*(?:USD|dollars?)?(?:\s|$))/i;
  const candidates = [];
  for (const line of lines) {
    if (rateKeywords.test(line)) {
      const m = line.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g,''));
        if (val >= 100 && val <= 50000) candidates.push(val);
      }
    }
  }
  if (candidates.length === 1) return { value: candidates[0], ambiguous: false };
  if (candidates.length > 1) return { value: candidates[0], ambiguous: true };
  // Fallback: scan for any dollar value between $200–$20,000 not near a phone/zip
  const allDollars = [];
  for (const line of lines) {
    if (/phone|fax|zip|mc#|dot#|ein|tax\s*id|ext/i.test(line)) continue;
    const m = line.match(/\$\s*([\d,]+(?:\.\d{2})?)/g);
    if (m) {
      for (const hit of m) {
        const val = parseFloat(hit.replace(/[$,]/g,''));
        if (val >= 200 && val <= 20000) allDollars.push(val);
      }
    }
  }
  if (allDollars.length === 1) return { value: allDollars[0], ambiguous: false };
  if (allDollars.length > 1) return { value: Math.max(...allDollars), ambiguous: true };
  return { value: null, ambiguous: false };
}

/**
 * Given a block of text that represents a stop (pickup or delivery),
 * extract address parts, date, time, facility name, reference.
 */
function parseStopBlock(block) {
  const result = {};
  // Facility name: first non-empty line that is not all-caps abbreviation or date/address
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

  // Date
  const datePatterns = [
    /(?:date|appt?|appointment|pu\s*date|delivery\s*date|pick\s*up\s*date|sched(?:uled)?)[\s:\-]*(.+)/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
    /(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
  ];
  for (const dp of datePatterns) {
    const m = block.match(dp);
    if (m) {
      const d = parseDate(m[1].trim().split(/[\n\r]/)[0].trim());
      if (d) { result.date = d; break; }
    }
  }

  // Time
  const timeMatch = block.match(/(?:time|appt?|window|hrs?)[\s:\-]*(\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i)
    || block.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
  if (timeMatch) result.time = timeMatch[1].trim();

  // ZIP (5-digit or 5+4)
  const zipMatch = block.match(/\b(\d{5}(?:-\d{4})?)\b/);
  if (zipMatch) result.zip = zipMatch[1];

  // State (2-letter after city or before zip)
  const stateMatch = block.match(/,\s*([A-Z]{2})\s+\d{5}/) || block.match(/\b([A-Z]{2})\s+\d{5}/);
  if (stateMatch) result.state = stateMatch[1];

  // City (before state+zip pattern)
  const cityMatch = block.match(/([A-Za-z][A-Za-z\s.'-]+),\s*[A-Z]{2}\s+\d{5}/)
    || block.match(/([A-Za-z][A-Za-z\s.'-]+),\s*[A-Z]{2}/);
  if (cityMatch) result.city = cityMatch[1].trim();

  // Street address (number + street name)
  const addrMatch = block.match(/(\d+\s+[A-Za-z0-9\s.,#'-]{5,60}(?:Ave|Blvd|Dr|Rd|St|Ln|Way|Pkwy|Hwy|Highway|Court|Ct|Circle|Cir|Place|Pl|Suite|Ste)?\.?)/i);
  if (addrMatch) result.address = addrMatch[1].trim();

  // Reference number
  const refMatch = block.match(/(?:ref(?:erence)?(?:\s*#|\s*num(?:ber)?)?|pu\s*#|po\s*#|conf(?:irmation)?(?:\s*#)?)[\s:\-]*([A-Z0-9\-]{3,})/i);
  if (refMatch) result.ref = refMatch[1].trim();

  // Facility / company name: first line that looks like a name (not all digits, not a date)
  for (const line of lines) {
    if (line.length < 3 || /^\d/.test(line) || /^\d{1,2}[\/\-]/.test(line)) continue;
    if (/^(pickup|delivery|origin|destination|ship\s*from|ship\s*to|consignee|shipper|date|time|address|phone|fax|ref|po\s*#|pu\s*#)/i.test(line)) continue;
    result.facility = line;
    break;
  }

  return result;
}

/**
 * Main text extraction function — pure regex/heuristic, no external API.
 */
function extractRateCon(text) {
  const flags = []; // fields with uncertainty
  const result = {};

  // ---- Load / Reference Numbers ----
  const loadNumMatch = text.match(/(?:load\s*(?:number|num|#|id|ref(?:erence)?)|shipment\s*(?:number|#|id)|order\s*(?:number|#|id))[\s:\-]*([A-Z0-9\-]{3,20})/i);
  if (loadNumMatch) result.load_number = loadNumMatch[1].trim();

  const poMatch = text.match(/(?:po\s*(?:number|num|#)|purchase\s*order(?:\s*#)?)[\s:\-]*([A-Z0-9\-]{3,20})/i);
  if (poMatch) result.po_number = poMatch[1].trim();

  const bolMatch = text.match(/(?:bol(?:\s*(?:number|num|#))?|bill\s*of\s*lading(?:\s*#)?)[\s:\-]*([A-Z0-9\-]{3,20})/i);
  if (bolMatch) result.bol_number = bolMatch[1].trim();

  // ---- Broker / Customer ----
  const brokerMatch = text.match(/(?:broker|company|carrier\s*pay(?:able)?\s*to|billed?\s*to|logistics|transport(?:ation)?)[\s:\-]+([A-Za-z][A-Za-z0-9\s,.'&-]{2,60})/i);
  if (brokerMatch) {
    const cname = brokerMatch[1].split('\n')[0].trim();
    if (cname.length >= 3) result.customer_name = cname;
  }

  // ---- Commodity / Equipment ----
  const commodMatch = text.match(/(?:commodity|freight|product|cargo|goods|shipment\s*desc(?:ription)?)[\s:\-]*([^\n]{2,80})/i);
  if (commodMatch) result.commodity = commodMatch[1].split(/[\|,]/)[0].trim();

  const weightMatch = text.match(/(?:weight|wt\.?)[\s:\-]*(\d[\d,]*)\s*(?:lbs?|pounds?|kg)?/i);
  if (weightMatch) result.weight = parseFloat(weightMatch[1].replace(/,/g,''));

  const equipMatch = text.match(/(?:equipment|trailer\s*type|mode|trailer)[\s:\-]*([^\n]{2,40})/i);
  if (equipMatch) result.equipment_type = equipMatch[1].trim();

  // ---- Rate ----
  const { value: rateVal, ambiguous: rateAmbig } = extractRate(text);
  if (rateVal !== null) {
    result.rate = rateVal;
    if (rateAmbig) flags.push({ field: 'rate', message: 'Multiple dollar amounts found — verify the carrier rate is correct.' });
  } else {
    flags.push({ field: 'rate', message: 'Could not identify the carrier rate — please enter it manually.' });
  }

  // ---- Detect pickup & delivery blocks ----
  // Split text around pickup and delivery section headers
  const puHeaderRe = /(?:^|\n)[\s]*(?:PICK\s*UP|PICKUP|ORIGIN|SHIP\s*FROM|PU|LOAD(?:ING)?\s*POINT|FROM)[\s:\-]*/im;
  const delHeaderRe = /(?:^|\n)[\s]*(?:DELIVER(?:Y)?|DROP\s*OFF|DESTINATION|CONSIGNEE|SHIP\s*TO|DO|DELIVER\s*TO|UNLOADING\s*POINT|TO)[\s:\-]*/im;

  const puMatch = text.match(puHeaderRe);
  const delMatch = text.match(delHeaderRe);

  let puBlock = '';
  let delBlock = '';

  if (puMatch && delMatch) {
    const puIdx = puMatch.index + puMatch[0].length;
    const delIdx = delMatch.index + delMatch[0].length;
    if (puIdx < delIdx) {
      puBlock = text.slice(puIdx, delMatch.index);
      delBlock = text.slice(delIdx, delIdx + 600);
    } else {
      delBlock = text.slice(delIdx, puMatch.index);
      puBlock = text.slice(puIdx, puIdx + 600);
    }
  } else if (puMatch) {
    puBlock = text.slice(puMatch.index + puMatch[0].length, puMatch.index + puMatch[0].length + 600);
  } else if (delMatch) {
    delBlock = text.slice(delMatch.index + delMatch[0].length, delMatch.index + delMatch[0].length + 600);
  }

  if (puBlock) {
    const pu = parseStopBlock(puBlock);
    if (pu.facility) result.pickup_facility = pu.facility;
    if (pu.address) result.origin_address = pu.address;
    if (pu.city) result.origin_city = pu.city;
    if (pu.state) result.origin_state = pu.state;
    if (pu.zip) result.origin_zip = pu.zip;
    if (pu.date) result.pickup_date = pu.date;
    else flags.push({ field: 'pickup_date', message: 'Pickup date not clearly identified — please enter it manually.' });
    if (pu.time) result.pickup_time = pu.time;
    if (pu.ref) result.pickup_ref = pu.ref;
  }

  if (delBlock) {
    const del = parseStopBlock(delBlock);
    if (del.facility) result.delivery_facility = del.facility;
    if (del.address) result.destination_address = del.address;
    if (del.city) result.destination_city = del.city;
    if (del.state) result.destination_state = del.state;
    if (del.zip) result.destination_zip = del.zip;
    if (del.date) result.delivery_date = del.date;
    else flags.push({ field: 'delivery_date', message: 'Delivery date not clearly identified — please enter it manually.' });
    if (del.time) result.delivery_time = del.time;
    if (del.ref) result.delivery_ref = del.ref;
  }

  // ---- Special instructions / notes ----
  const notesMatch = text.match(/(?:special\s*instructions?|notes?|comments?|remarks?)[\s:\-]*([^\n]{5,400})/i);
  if (notesMatch) result.notes = notesMatch[1].trim();

  // ---- Broker contact info for notes ----
  const emailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (emailMatch) result.broker_email = emailMatch[1];

  return { extracted: result, flags };
}

// POST /api/extract/paste-rate-con
router.post('/paste-rate-con', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return res.status(400).json({ error: 'Text is too short or empty. Paste the full Rate Confirmation text.' });
    }
    if (text.length > 500000) {
      return res.status(400).json({ error: 'Pasted text is too large. Please paste only the Rate Confirmation section.' });
    }

    const { extracted, flags } = extractRateCon(text);

    // Duplicate check — look for existing load with same load_number
    let duplicate = null;
    if (extracted.load_number) {
      const dup = await db.query(
        `SELECT l.id, l.load_number, l.pickup_date, l.status, c.name as customer_name
         FROM loads l LEFT JOIN customers c ON c.id=l.customer_id
         WHERE LOWER(l.load_number) = LOWER($1) LIMIT 1`,
        [extracted.load_number]
      );
      if (dup.rows.length) duplicate = dup.rows[0];
    }

    res.json({ extracted, flags, duplicate });
  } catch (err) {
    console.error('Paste rate con error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

