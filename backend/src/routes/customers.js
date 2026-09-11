const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const buildFilter = (conditions, params) => {
  if (conditions.length === 0) return '';
  return 'WHERE ' + conditions.join(' AND ');
};

// GET /api/customers
router.get('/', async (req, res) => {
  try {
    const { search, active } = req.query;
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR contact_email ILIKE $${params.length})`);
    }
    if (active !== undefined) {
      params.push(active === 'true');
      conditions.push(`is_active = $${params.length}`);
    }

    const result = await db.query(
      `SELECT c.*,
        COUNT(l.id) as total_loads,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('unpaid','overdue')), 0) as outstanding_balance
       FROM customers c
       LEFT JOIN loads l ON l.customer_id = c.id
       LEFT JOIN invoices i ON i.customer_id = c.id
       ${buildFilter(conditions, params)}
       GROUP BY c.id
       ORDER BY c.name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const [customer, loads, invoices] = await Promise.all([
      db.query('SELECT * FROM customers WHERE id=$1', [req.params.id]),
      db.query(
        `SELECT l.*, t.unit_number as truck_unit, d.first_name, d.last_name
         FROM loads l
         LEFT JOIN trucks t ON t.id=l.truck_id
         LEFT JOIN drivers d ON d.id=l.driver_id
         WHERE l.customer_id=$1 ORDER BY l.created_at DESC LIMIT 50`,
        [req.params.id]
      ),
      db.query(
        'SELECT * FROM invoices WHERE customer_id=$1 ORDER BY date_issued DESC LIMIT 50',
        [req.params.id]
      ),
    ]);
    if (!customer.rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json({ customer: customer.rows[0], loads: loads.rows, invoices: invoices.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  const { name, contact_name, contact_email, contact_phone, address_line1, address_line2, city, state, zip, payment_terms, credit_limit, credit_notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Customer name required' });
  try {
    const result = await db.query(
      `INSERT INTO customers (name, contact_name, contact_email, contact_phone, address_line1, address_line2, city, state, zip, payment_terms, credit_limit, credit_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, contact_name, contact_email, contact_phone, address_line1, address_line2, city, state, zip, payment_terms || 'Net 30', credit_limit, credit_notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
  const { name, contact_name, contact_email, contact_phone, address_line1, address_line2, city, state, zip, payment_terms, credit_limit, credit_notes, is_active } = req.body;
  try {
    const result = await db.query(
      `UPDATE customers SET name=$1, contact_name=$2, contact_email=$3, contact_phone=$4,
       address_line1=$5, address_line2=$6, city=$7, state=$8, zip=$9, payment_terms=$10,
       credit_limit=$11, credit_notes=$12, is_active=$13, updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [name, contact_name, contact_email, contact_phone, address_line1, address_line2, city, state, zip, payment_terms, credit_limit, credit_notes, is_active !== false, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE customers SET is_active=FALSE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
