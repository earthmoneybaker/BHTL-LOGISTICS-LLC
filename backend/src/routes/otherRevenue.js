const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (date_from) { params.push(date_from); conditions.push(`revenue_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`revenue_date <= $${params.length}`); }
    const result = await db.query(
      `SELECT * FROM other_revenue WHERE ${conditions.join(' AND ')} ORDER BY revenue_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { description, amount, revenue_date, notes } = req.body;
  if (!description || !amount || !revenue_date) {
    return res.status(400).json({ error: 'description, amount, revenue_date required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO other_revenue (description, amount, revenue_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [description, amount, revenue_date, notes || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { description, amount, revenue_date, notes } = req.body;
  try {
    const result = await db.query(
      `UPDATE other_revenue SET description=$1, amount=$2, revenue_date=$3, notes=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [description, amount, revenue_date, notes || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM other_revenue WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
