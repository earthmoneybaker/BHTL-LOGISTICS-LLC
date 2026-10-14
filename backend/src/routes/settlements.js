const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// Helper: calculate driver pay for a period from delivered/paid loads
async function calculateDriverSettlement(driver_id, period_start, period_end) {
  const driverQ = await db.query('SELECT pay_type, pay_rate, first_name, last_name FROM drivers WHERE id=$1', [driver_id]);
  const driver = driverQ.rows[0];
  if (!driver) return { gross_pay: 0, loads: [], pay_type: null, pay_rate: null };

  const loadsQ = await db.query(
    `SELECT l.id, l.load_number, l.rate, l.miles, l.status,
            l.pickup_date, l.delivery_date,
            l.origin_city, l.origin_state,
            l.destination_city, l.destination_state
     FROM loads l
     WHERE l.driver_id=$1
       AND l.status IN ('delivered','invoiced','paid')
       AND l.delivery_date >= $2 AND l.delivery_date <= $3
     ORDER BY l.delivery_date ASC`,
    [driver_id, period_start, period_end]
  );
  const loads = loadsQ.rows;
  let gross_pay = 0;
  const load_items = [];

  for (const load of loads) {
    let driver_pay = 0;
    const rate_amt = parseFloat(load.rate) || 0;
    const miles = parseFloat(load.miles) || 0;

    if (driver.pay_type === 'per_mile') {
      driver_pay = miles * (parseFloat(driver.pay_rate) || 0);
    } else if (driver.pay_type === 'percentage') {
      driver_pay = rate_amt * ((parseFloat(driver.pay_rate) || 0) / 100);
    } else if (driver.pay_type === 'salary') {
      // Salary drivers: gross is the flat pay_rate per period, not per load
      driver_pay = 0; // handled at total level
    }
    gross_pay += driver_pay;
    load_items.push({
      load_id: load.id,
      load_number: load.load_number,
      pickup_date: load.pickup_date,
      delivery_date: load.delivery_date,
      origin: `${load.origin_city || ''}, ${load.origin_state || ''}`.trim(),
      destination: `${load.destination_city || ''}, ${load.destination_state || ''}`.trim(),
      miles,
      load_rate: rate_amt,
      driver_pay: Math.round(driver_pay * 100) / 100,
    });
  }

  // Salary: use flat rate
  if (driver.pay_type === 'salary') {
    gross_pay = parseFloat(driver.pay_rate) || 0;
  }

  return {
    gross_pay: Math.round(gross_pay * 100) / 100,
    loads: load_items,
    pay_type: driver.pay_type,
    pay_rate: driver.pay_rate,
    driver_name: `${driver.first_name} ${driver.last_name}`,
  };
}

// Generate next settlement number
async function nextSettlementNumber() {
  const res = await db.query('SELECT COUNT(*) FROM driver_settlements');
  const num = parseInt(res.rows[0].count) + 1;
  return `STL-${new Date().getFullYear()}-${String(num).padStart(4, '0')}`;
}

// ── GET /api/settlements ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { driver_id, status, period_start, period_end } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (driver_id) { params.push(driver_id); conditions.push(`s.driver_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`s.status = $${params.length}`); }
    if (period_start) { params.push(period_start); conditions.push(`s.period_start >= $${params.length}`); }
    if (period_end) { params.push(period_end); conditions.push(`s.period_end <= $${params.length}`); }

    const result = await db.query(
      `SELECT s.*,
              d.first_name, d.last_name, d.pay_type as driver_pay_type
       FROM driver_settlements s
       LEFT JOIN drivers d ON d.id = s.driver_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/settlements/:id  (with load items) ──────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [settleQ, itemsQ] = await Promise.all([
      db.query(
        `SELECT s.*, d.first_name, d.last_name, d.pay_type as driver_pay_type,
                d.phone as driver_phone, d.email as driver_email
         FROM driver_settlements s
         LEFT JOIN drivers d ON d.id = s.driver_id
         WHERE s.id = $1`, [req.params.id]),
      db.query(
        'SELECT * FROM settlement_load_items WHERE settlement_id=$1 ORDER BY delivery_date ASC',
        [req.params.id]),
    ]);
    if (!settleQ.rows[0]) return res.status(404).json({ error: 'Settlement not found' });
    res.json({ settlement: settleQ.rows[0], load_items: itemsQ.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settlements/calculate  (preview before saving) ─────────
router.post('/calculate', async (req, res) => {
  const { driver_id, period_start, period_end } = req.body;
  if (!driver_id || !period_start || !period_end) {
    return res.status(400).json({ error: 'driver_id, period_start, period_end required' });
  }
  try {
    const calc = await calculateDriverSettlement(driver_id, period_start, period_end);
    res.json(calc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settlements  (create) ──────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const {
    driver_id, period_start, period_end,
    gross_pay, fuel_advance, insurance_deduction,
    other_deduction, other_deduction_note,
    notes, status, load_items,
  } = req.body;

  if (!driver_id || !period_start || !period_end) {
    return res.status(400).json({ error: 'driver_id, period_start, period_end required' });
  }

  try {
    const settlement_number = await nextSettlementNumber();
    const driverQ = await db.query('SELECT pay_type, pay_rate FROM drivers WHERE id=$1', [driver_id]);
    const driver = driverQ.rows[0] || {};

    const result = await db.query(
      `INSERT INTO driver_settlements
        (settlement_number, driver_id, period_start, period_end,
         pay_type, pay_rate, gross_pay,
         fuel_advance, insurance_deduction, other_deduction, other_deduction_note,
         notes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [settlement_number, driver_id, period_start, period_end,
       driver.pay_type, driver.pay_rate, gross_pay || 0,
       fuel_advance || 0, insurance_deduction || 0, other_deduction || 0,
       other_deduction_note, notes, status || 'draft', req.user.id]
    );

    const settlement_id = result.rows[0].id;

    // Save load line items
    if (Array.isArray(load_items) && load_items.length > 0) {
      for (const item of load_items) {
        await db.query(
          `INSERT INTO settlement_load_items
            (settlement_id, load_id, load_number, pickup_date, delivery_date,
             origin, destination, miles, load_rate, driver_pay)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [settlement_id, item.load_id, item.load_number,
           item.pickup_date || null, item.delivery_date || null,
           item.origin, item.destination,
           item.miles || 0, item.load_rate || 0, item.driver_pay || 0]
        );
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/settlements/:id ─────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const {
    gross_pay, fuel_advance, insurance_deduction,
    other_deduction, other_deduction_note, notes, status,
  } = req.body;
  try {
    const result = await db.query(
      `UPDATE driver_settlements SET
         gross_pay=$1, fuel_advance=$2, insurance_deduction=$3,
         other_deduction=$4, other_deduction_note=$5, notes=$6, status=$7,
         updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [gross_pay, fuel_advance || 0, insurance_deduction || 0,
       other_deduction || 0, other_deduction_note, notes, status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/settlements/:id/status ────────────────────────────────
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['draft', 'approved', 'paid'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const result = await db.query(
      'UPDATE driver_settlements SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/settlements/:id ──────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM driver_settlements WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settlements/bulk-delete ────────────────────────────────
router.post('/bulk-delete', requireAdmin, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'ids array required' });
  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `DELETE FROM driver_settlements WHERE id IN (${placeholders}) RETURNING id`,
      ids
    );
    res.json({ deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
