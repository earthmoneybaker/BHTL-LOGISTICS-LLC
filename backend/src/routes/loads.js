const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// Creates or syncs the invoice tied to a load whenever that load's status is 'paid'.
// - If no invoice exists yet (and the load has a customer + rate), creates one.
// - If an invoice already exists, syncs its dates to the load's real delivery/pickup
//   date (so editing a backfilled load's date later fixes its revenue month too)
//   and makes sure it's marked paid.
// No-ops entirely if the load's status isn't 'paid'.
async function ensureInvoiceForLoad(load) {
  if (!load || load.status !== 'paid') return { invoiceCreated: false, hasInvoice: false };

  const revenueDate = load.delivery_date || load.pickup_date || null;
  const existing = await db.query('SELECT id, status FROM invoices WHERE load_id=$1 LIMIT 1', [load.id]);

  if (existing.rows.length) {
    if (revenueDate) {
      await db.query(
        `UPDATE invoices SET date_issued=$1, due_date=$1,
         paid_date=$1, status='paid',
         paid_amount=COALESCE(paid_amount, amount), updated_at=NOW()
         WHERE load_id=$2`,
        [revenueDate, load.id]
      );
    } else if (existing.rows[0].status !== 'paid') {
      await db.query(
        `UPDATE invoices SET status='paid', paid_date=COALESCE(paid_date, CURRENT_DATE),
         paid_amount=COALESCE(paid_amount, amount), updated_at=NOW() WHERE load_id=$1`,
        [load.id]
      );
    }
    return { invoiceCreated: false, hasInvoice: true };
  }

  if (load.customer_id && load.rate) {
    const countRes = await db.query('SELECT COUNT(*) FROM invoices');
    const num = parseInt(countRes.rows[0].count) + 1;
    const invoice_number = `INV-${new Date().getFullYear()}-${String(num).padStart(4, '0')}`;
    const dateToUse = revenueDate || new Date().toISOString().split('T')[0];
    await db.query(
      `INSERT INTO invoices (invoice_number, customer_id, load_id, amount, date_issued, due_date, status, paid_date, paid_amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'paid',$7,$8,$9)`,
      [invoice_number, load.customer_id, load.id, load.rate, dateToUse, dateToUse, dateToUse, load.rate, 'Auto-recorded — paid via factoring']
    );
    return { invoiceCreated: true, hasInvoice: true };
  }

  return { invoiceCreated: false, hasInvoice: false };
}

// Resolves a customer for a load: uses customer_id if given, otherwise looks up
// or creates a customer by name (so loads can be created with a brand-new customer
// without requiring a separate "add customer" step first).
async function resolveCustomerId(customer_id, customer_name) {
  if (customer_id) return customer_id;
  const name = (customer_name || '').trim();
  if (!name) return null;
  const existing = await db.query('SELECT id FROM customers WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);
  if (existing.rows.length) return existing.rows[0].id;
  const created = await db.query('INSERT INTO customers (name) VALUES ($1) RETURNING id', [name]);
  return created.rows[0].id;
}

// GET /api/loads
router.get('/', async (req, res) => {
  try {
    const { status, customer_id, truck_id, driver_id, date_from, date_to, search } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (status) { params.push(status); conditions.push(`l.status = $${params.length}`); }
    if (customer_id) { params.push(customer_id); conditions.push(`l.customer_id = $${params.length}`); }
    if (truck_id) { params.push(truck_id); conditions.push(`l.truck_id = $${params.length}`); }
    if (driver_id) { params.push(driver_id); conditions.push(`l.driver_id = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`l.pickup_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`l.pickup_date <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(l.load_number ILIKE $${params.length} OR l.origin_city ILIKE $${params.length} OR l.destination_city ILIKE $${params.length})`);
    }

    const result = await db.query(
      `SELECT l.*,
        c.name as customer_name,
        d.first_name as driver_first, d.last_name as driver_last,
        t.unit_number as truck_unit,
        tr.unit_number as trailer_unit,
        i.invoice_number, i.status as invoice_status
       FROM loads l
       LEFT JOIN customers c ON c.id=l.customer_id
       LEFT JOIN drivers d ON d.id=l.driver_id
       LEFT JOIN trucks t ON t.id=l.truck_id
       LEFT JOIN trailers tr ON tr.id=l.trailer_id
       LEFT JOIN invoices i ON i.load_id=l.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/loads/:id
router.get('/:id', async (req, res) => {
  try {
    const [load, docs, expenses] = await Promise.all([
      db.query(
        `SELECT l.*,
          c.name as customer_name, c.contact_email, c.payment_terms,
          d.first_name as driver_first, d.last_name as driver_last, d.phone as driver_phone,
          t.unit_number as truck_unit,
          tr.unit_number as trailer_unit
         FROM loads l
         LEFT JOIN customers c ON c.id=l.customer_id
         LEFT JOIN drivers d ON d.id=l.driver_id
         LEFT JOIN trucks t ON t.id=l.truck_id
         LEFT JOIN trailers tr ON tr.id=l.trailer_id
         WHERE l.id=$1`,
        [req.params.id]
      ),
      db.query(
        `SELECT id, doc_type, file_name, file_mime, expiration_date, created_at
         FROM documents WHERE entity_type='load' AND entity_id=$1 ORDER BY created_at DESC`,
        [req.params.id]
      ),
      db.query(
        'SELECT * FROM expenses WHERE load_id=$1 ORDER BY expense_date DESC',
        [req.params.id]
      ),
    ]);
    if (!load.rows[0]) return res.status(404).json({ error: 'Load not found' });
    res.json({ load: load.rows[0], documents: docs.rows, expenses: expenses.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loads
router.post('/', async (req, res) => {
  const {
    load_number, customer_id, customer_name, origin_address, origin_city, origin_state, origin_zip,
    destination_address, destination_city, destination_state, destination_zip,
    pickup_date, pickup_time, delivery_date, delivery_time, rate, weight, commodity,
    miles, truck_id, trailer_id, driver_id, po_number, bol_number, notes, status
  } = req.body;

  try {
    const resolvedCustomerId = await resolveCustomerId(customer_id, customer_name);
    let ln = load_number;
    if (!ln) {
      const count = await db.query('SELECT COUNT(*) FROM loads');
      const num = parseInt(count.rows[0].count) + 1;
      ln = `BHTL-${String(num).padStart(5, '0')}`;
    }

    const finalStatus = status || 'booked';

    const result = await db.query(
      `INSERT INTO loads (
        load_number, customer_id, origin_address, origin_city, origin_state, origin_zip,
        destination_address, destination_city, destination_state, destination_zip,
        pickup_date, pickup_time, delivery_date, delivery_time, rate, weight, commodity,
        miles, truck_id, trailer_id, driver_id, po_number, bol_number, notes, created_by, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING *`,
      [ln, resolvedCustomerId, origin_address, origin_city, origin_state, origin_zip,
       destination_address, destination_city, destination_state, destination_zip,
       pickup_date || null, pickup_time, delivery_date || null, delivery_time,
       rate, weight, commodity, miles, truck_id || null, trailer_id || null,
       driver_id || null, po_number, bol_number, notes, req.user.id, finalStatus]
    );

    const load = result.rows[0];
    const invoiceInfo = await ensureInvoiceForLoad(load);
    res.status(201).json({ ...load, ...invoiceInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/loads/:id
router.put('/:id', async (req, res) => {
  const {
    customer_id, customer_name, origin_address, origin_city, origin_state, origin_zip,
    destination_address, destination_city, destination_state, destination_zip,
    pickup_date, pickup_time, delivery_date, delivery_time, rate, weight, commodity,
    miles, truck_id, trailer_id, driver_id, status, po_number, bol_number, notes, load_number
  } = req.body;
  try {
    const resolvedCustomerId = await resolveCustomerId(customer_id, customer_name);
    const result = await db.query(
      `UPDATE loads SET customer_id=$1, origin_address=$2, origin_city=$3, origin_state=$4, origin_zip=$5,
       destination_address=$6, destination_city=$7, destination_state=$8, destination_zip=$9,
       pickup_date=$10, pickup_time=$11, delivery_date=$12, delivery_time=$13, rate=$14, weight=$15,
       commodity=$16, miles=$17, truck_id=$18, trailer_id=$19, driver_id=$20, status=$21,
       po_number=$22, bol_number=$23, notes=$24, load_number=COALESCE(NULLIF($25, ''), load_number), updated_at=NOW()
       WHERE id=$26 RETURNING *`,
      [resolvedCustomerId, origin_address, origin_city, origin_state, origin_zip,
       destination_address, destination_city, destination_state, destination_zip,
       pickup_date || null, pickup_time, delivery_date || null, delivery_time,
       rate, weight, commodity, miles, truck_id || null, trailer_id || null,
       driver_id || null, status, po_number, bol_number, notes, load_number || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Load not found' });

    const load = result.rows[0];
    const invoiceInfo = await ensureInvoiceForLoad(load);
    res.json({ ...load, ...invoiceInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/loads/:id/status — quick status change
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['booked','dispatched','in_transit','delivered','invoiced','paid','cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const result = await db.query(
      'UPDATE loads SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    const load = result.rows[0];
    const invoiceInfo = await ensureInvoiceForLoad(load);
    res.json({ ...load, ...invoiceInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/loads/:id — permanently removes the load
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM loads WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Load not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loads/backfill-paid-invoices — one-time (or repeatable) sweep:
// finds every load already marked 'paid' and makes sure it has a correctly-dated
// invoice, fixing any that were created with today's date before this feature existed.
router.post('/backfill-paid-invoices', requireAdmin, async (req, res) => {
  try {
    const paidLoads = await db.query("SELECT * FROM loads WHERE status='paid'");
    let created = 0, synced = 0, skipped = 0;

    for (const load of paidLoads.rows) {
      const info = await ensureInvoiceForLoad(load);
      if (info.invoiceCreated) created++;
      else if (info.hasInvoice) synced++;
      else skipped++;
    }

    res.json({ totalPaidLoads: paidLoads.rows.length, created, synced, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
