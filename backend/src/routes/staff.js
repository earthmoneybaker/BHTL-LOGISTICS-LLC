const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// ── GET /api/staff ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    const conditions = ['1=1'];
    if (active === 'true') conditions.push('s.is_active = TRUE');
    if (active === 'false') conditions.push('s.is_active = FALSE');

    const result = await db.query(
      `SELECT s.*,
              COALESCE(
                (SELECT SUM(sp.amount) FROM staff_payments sp WHERE sp.staff_id=s.id AND sp.status='paid'),
                0
              ) as total_paid,
              COALESCE(
                (SELECT SUM(sp.amount) FROM staff_payments sp WHERE sp.staff_id=s.id AND sp.status='pending'),
                0
              ) as total_pending
       FROM staff_members s
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.is_active DESC, s.last_name ASC, s.first_name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/staff/summary — total staff payroll cost for P&L ──────────
router.get('/summary', async (req, res) => {
  try {
    const { period_start, period_end } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (period_start) { params.push(period_start); conditions.push(`period_start >= $${params.length}`); }
    if (period_end)   { params.push(period_end);   conditions.push(`period_end <= $${params.length}`); }

    const result = await db.query(
      `SELECT
         COUNT(DISTINCT sp.staff_id) as staff_count,
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.status='paid'), 0) as total_paid,
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.status='pending'), 0) as total_pending,
         COALESCE(SUM(sp.amount), 0) as total_all
       FROM staff_payments sp
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/staff ────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const {
    first_name, last_name, role, email, phone,
    hire_date, pay_type, pay_rate, pay_period, is_active, notes,
  } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name required' });
  try {
    const result = await db.query(
      `INSERT INTO staff_members
        (first_name, last_name, role, email, phone, hire_date, pay_type, pay_rate, pay_period, is_active, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [first_name, last_name, role || 'Staff', email || null, phone || null,
       hire_date || null, pay_type || 'salary', pay_rate || null,
       pay_period || 'monthly', is_active !== false, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/staff/:id ─────────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const {
    first_name, last_name, role, email, phone,
    hire_date, pay_type, pay_rate, pay_period, is_active, notes,
  } = req.body;
  try {
    const result = await db.query(
      `UPDATE staff_members SET
        first_name=$1, last_name=$2, role=$3, email=$4, phone=$5,
        hire_date=$6, pay_type=$7, pay_rate=$8, pay_period=$9,
        is_active=$10, notes=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [first_name, last_name, role || 'Staff', email || null, phone || null,
       hire_date || null, pay_type || 'salary', pay_rate || null,
       pay_period || 'monthly', is_active !== false, notes || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/staff/:id ──────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM staff_members WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/staff/:id/payments ────────────────────────────────────────
router.get('/:id/payments', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM staff_payments WHERE staff_id=$1 ORDER BY period_start DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/staff/:id/payments ───────────────────────────────────────
router.post('/:id/payments', requireAdmin, async (req, res) => {
  const { period_start, period_end, amount, payment_date, payment_method, notes, status } = req.body;
  if (!period_start || !period_end || !amount) {
    return res.status(400).json({ error: 'period_start, period_end, amount required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO staff_payments
        (staff_id, period_start, period_end, amount, payment_date, payment_method, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, period_start, period_end, amount,
       payment_date || null, payment_method || null, notes || null, status || 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/staff/payments/:payId/status ────────────────────────────
router.patch('/payments/:payId/status', requireAdmin, async (req, res) => {
  const { status, payment_date } = req.body;
  try {
    const result = await db.query(
      `UPDATE staff_payments SET status=$1, payment_date=COALESCE($2, payment_date) WHERE id=$3 RETURNING *`,
      [status, payment_date || null, req.params.payId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
