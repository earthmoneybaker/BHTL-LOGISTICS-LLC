const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// ── GET /api/deductions ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM deduction_templates ORDER BY sort_order, name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deductions ──────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { name, description, deduction_type, amount, percentage, applies_to, sort_order } = req.body;
  if (!name || !deduction_type) return res.status(400).json({ error: 'name and deduction_type required' });
  try {
    const result = await db.query(
      `INSERT INTO deduction_templates (name, description, deduction_type, amount, percentage, applies_to, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, description, deduction_type, amount || null, percentage || null, applies_to || 'truck', sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/deductions/:id ────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, description, deduction_type, amount, percentage, applies_to, is_active, sort_order } = req.body;
  try {
    const result = await db.query(
      `UPDATE deduction_templates SET
         name=$1, description=$2, deduction_type=$3, amount=$4, percentage=$5,
         applies_to=$6, is_active=$7, sort_order=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, description, deduction_type, amount || null, percentage || null,
       applies_to || 'truck', is_active !== false, sort_order || 0, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/deductions/:id ─────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM deduction_templates WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
