const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/drivers
router.get('/', async (req, res) => {
  try {
    const { search, active } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR cdl_number ILIKE $${params.length})`);
    }
    if (active !== undefined) {
      params.push(active === 'true');
      conditions.push(`d.is_active = $${params.length}`);
    }
    const result = await db.query(
      `SELECT d.*,
        t.unit_number as assigned_truck_unit
       FROM drivers d
       LEFT JOIN trucks t ON t.assigned_driver_id = d.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY last_name, first_name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/:id
router.get('/:id', async (req, res) => {
  try {
    const [driver, dqItems, loads] = await Promise.all([
      db.query('SELECT * FROM drivers WHERE id=$1', [req.params.id]),
      db.query('SELECT * FROM driver_dq_items WHERE driver_id=$1 ORDER BY item_name', [req.params.id]),
      db.query(
        `SELECT l.id, l.load_number, l.status, l.rate, l.miles, l.pickup_date, l.delivery_date,
                c.name as customer_name
         FROM loads l
         LEFT JOIN customers c ON c.id=l.customer_id
         WHERE l.driver_id=$1 ORDER BY l.pickup_date DESC LIMIT 50`,
        [req.params.id]
      ),
    ]);
    if (!driver.rows[0]) return res.status(404).json({ error: 'Driver not found' });
    res.json({ driver: driver.rows[0], dq_items: dqItems.rows, loads: loads.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers
router.post('/', async (req, res) => {
  const {
    first_name, last_name, email, phone, address_line1, city, state, zip,
    cdl_number, cdl_class, cdl_endorsements, cdl_expiration,
    medical_card_expiration, hire_date, pay_type, pay_rate,
    clearinghouse_status, notes
  } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
  try {
    const result = await db.query(
      `INSERT INTO drivers (first_name, last_name, email, phone, address_line1, city, state, zip,
        cdl_number, cdl_class, cdl_endorsements, cdl_expiration, medical_card_expiration,
        hire_date, pay_type, pay_rate, clearinghouse_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [first_name, last_name, email, phone, address_line1, city, state, zip,
       cdl_number, cdl_class, cdl_endorsements, cdl_expiration || null,
       medical_card_expiration || null, hire_date || null,
       pay_type, pay_rate, clearinghouse_status, notes]
    );
    // Seed standard DQ file items
    const dqItems = [
      'Employment Application',
      'MVR (Motor Vehicle Record)',
      'Road Test Certificate / Skills Test',
      'Medical Examiner Certificate',
      'CDL Copy',
      'Annual Review of Driving Record',
      'Certificate of Violations',
      'Previous Employer Inquiry',
      'Drug Test Pre-Employment',
      'Drug/Alcohol Clearinghouse Query',
      'Safety Performance History',
      'Training Certificate (Entry-Level Driver)',
    ];
    for (const item of dqItems) {
      await db.query(
        'INSERT INTO driver_dq_items (driver_id, item_name) VALUES ($1,$2)',
        [result.rows[0].id, item]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:id
router.put('/:id', async (req, res) => {
  const {
    first_name, last_name, email, phone, address_line1, city, state, zip,
    cdl_number, cdl_class, cdl_endorsements, cdl_expiration,
    medical_card_expiration, hire_date, termination_date, pay_type, pay_rate,
    clearinghouse_status, notes, is_active
  } = req.body;
  try {
    const result = await db.query(
      `UPDATE drivers SET first_name=$1, last_name=$2, email=$3, phone=$4, address_line1=$5,
       city=$6, state=$7, zip=$8, cdl_number=$9, cdl_class=$10, cdl_endorsements=$11,
       cdl_expiration=$12, medical_card_expiration=$13, hire_date=$14, termination_date=$15,
       pay_type=$16, pay_rate=$17, clearinghouse_status=$18, notes=$19, is_active=$20,
       updated_at=NOW() WHERE id=$21 RETURNING *`,
      [first_name, last_name, email, phone, address_line1, city, state, zip,
       cdl_number, cdl_class, cdl_endorsements, cdl_expiration || null,
       medical_card_expiration || null, hire_date || null, termination_date || null,
       pay_type, pay_rate, clearinghouse_status, notes, is_active !== false, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drivers/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE drivers SET is_active=FALSE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:id/dq/:itemId — update DQ item
router.put('/:id/dq/:itemId', async (req, res) => {
  const { is_complete, completed_date, expiration_date, notes } = req.body;
  try {
    const result = await db.query(
      `UPDATE driver_dq_items SET is_complete=$1, completed_date=$2, expiration_date=$3, notes=$4, updated_at=NOW()
       WHERE id=$5 AND driver_id=$6 RETURNING *`,
      [is_complete, completed_date || null, expiration_date || null, notes, req.params.itemId, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'DQ item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/:id/payroll — driver payroll history
router.get('/:id/payroll', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pr.*, u.full_name as created_by_name
       FROM payroll_records pr
       LEFT JOIN users u ON u.id=pr.created_by
       WHERE pr.driver_id=$1 ORDER BY pr.period_start DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
