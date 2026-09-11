const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/trailers
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tr.*, t.unit_number as truck_unit
       FROM trailers tr
       LEFT JOIN trucks t ON t.id=tr.assigned_truck_id
       WHERE tr.is_active=TRUE ORDER BY tr.unit_number`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trailers/:id
router.get('/:id', async (req, res) => {
  try {
    const [trailer, maintenance] = await Promise.all([
      db.query(
        `SELECT tr.*, t.unit_number as truck_unit
         FROM trailers tr LEFT JOIN trucks t ON t.id=tr.assigned_truck_id WHERE tr.id=$1`,
        [req.params.id]
      ),
      db.query('SELECT * FROM maintenance_records WHERE trailer_id=$1 ORDER BY service_date DESC', [req.params.id]),
    ]);
    if (!trailer.rows[0]) return res.status(404).json({ error: 'Trailer not found' });
    res.json({ trailer: trailer.rows[0], maintenance: maintenance.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trailers
router.post('/', async (req, res) => {
  const { unit_number, vin, plate_number, plate_state, trailer_type, year, make, registration_expiration, assigned_truck_id, status, notes } = req.body;
  if (!unit_number) return res.status(400).json({ error: 'Unit number required' });
  try {
    const result = await db.query(
      `INSERT INTO trailers (unit_number, vin, plate_number, plate_state, trailer_type, year, make, registration_expiration, assigned_truck_id, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [unit_number, vin, plate_number, plate_state, trailer_type, year, make, registration_expiration || null, assigned_truck_id || null, status || 'active', notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Unit number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/trailers/:id
router.put('/:id', async (req, res) => {
  const { unit_number, vin, plate_number, plate_state, trailer_type, year, make, registration_expiration, assigned_truck_id, status, notes, is_active } = req.body;
  try {
    const result = await db.query(
      `UPDATE trailers SET unit_number=$1, vin=$2, plate_number=$3, plate_state=$4, trailer_type=$5,
       year=$6, make=$7, registration_expiration=$8, assigned_truck_id=$9, status=$10, notes=$11,
       is_active=$12, updated_at=NOW() WHERE id=$13 RETURNING *`,
      [unit_number, vin, plate_number, plate_state, trailer_type, year, make,
       registration_expiration || null, assigned_truck_id || null, status, notes, is_active !== false, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trailers/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE trailers SET is_active=FALSE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
