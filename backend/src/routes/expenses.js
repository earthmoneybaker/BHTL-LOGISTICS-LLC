const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/expenses
router.get('/', async (req, res) => {
  try {
    const { category, truck_id, driver_id, load_id, date_from, date_to } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`e.category = $${params.length}`);
    }
    if (truck_id) {
      params.push(truck_id);
      conditions.push(`e.truck_id = $${params.length}`);
    }
    if (driver_id) {
      params.push(driver_id);
      conditions.push(`e.driver_id = $${params.length}`);
    }
    if (load_id) {
      params.push(load_id);
      conditions.push(`e.load_id = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`e.expense_date >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`e.expense_date <= $${params.length}`);
    }

    const result = await db.query(
      `SELECT e.*,
        t.unit_number as truck_unit,
        d.first_name as driver_first, d.last_name as driver_last,
        l.load_number
       FROM expenses e
       LEFT JOIN trucks t ON t.id=e.truck_id
       LEFT JOIN drivers d ON d.id=e.driver_id
       LEFT JOIN loads l ON l.id=e.load_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.expense_date DESC`,
      params
    );

    // Cost per mile per truck if truck_id specified
    let costPerMile = null;
    if (truck_id) {
      const milesQ = await db.query(
        `SELECT COALESCE(SUM(miles),0) as total_miles FROM loads WHERE truck_id=$1 AND miles IS NOT NULL`,
        [truck_id]
      );
      const expQ = await db.query(
        `SELECT COALESCE(SUM(amount),0) as total_expenses FROM expenses WHERE truck_id=$1`,
        [truck_id]
      );
      const totalMiles = parseFloat(milesQ.rows[0].total_miles);
      const totalExp = parseFloat(expQ.rows[0].total_expenses);
      costPerMile = totalMiles > 0 ? (totalExp / totalMiles).toFixed(4) : null;
    }

    res.json({ expenses: result.rows, cost_per_mile: costPerMile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/expenses/summary — category breakdown
router.get('/summary', async (req, res) => {
  try {
    const { date_from, date_to, truck_id } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (date_from) { params.push(date_from); conditions.push(`expense_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`expense_date <= $${params.length}`); }
    if (truck_id) { params.push(truck_id); conditions.push(`truck_id = $${params.length}`); }

    const result = await db.query(
      `SELECT category, SUM(amount) as total FROM expenses
       WHERE ${conditions.join(' AND ')} GROUP BY category ORDER BY total DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  const { category, amount, expense_date, description, truck_id, driver_id, load_id, vendor, receipt_ref } = req.body;
  if (!category || !amount || !expense_date) return res.status(400).json({ error: 'category, amount, expense_date required' });
  try {
    const result = await db.query(
      `INSERT INTO expenses (category, amount, expense_date, description, truck_id, driver_id, load_id, vendor, receipt_ref, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [category, amount, expense_date, description, truck_id || null, driver_id || null, load_id || null, vendor, receipt_ref, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  const { category, amount, expense_date, description, truck_id, driver_id, load_id, vendor, receipt_ref } = req.body;
  try {
    const result = await db.query(
      `UPDATE expenses SET category=$1, amount=$2, expense_date=$3, description=$4, truck_id=$5,
       driver_id=$6, load_id=$7, vendor=$8, receipt_ref=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
      [category, amount, expense_date, description, truck_id || null, driver_id || null, load_id || null, vendor, receipt_ref, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM expenses WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
