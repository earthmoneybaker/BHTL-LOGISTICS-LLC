const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/maintenance
router.get('/', async (req, res) => {
  try {
    const { entity_type, truck_id, trailer_id } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (entity_type) {
      params.push(entity_type);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (truck_id) {
      params.push(truck_id);
      conditions.push(`truck_id = $${params.length}`);
    }
    if (trailer_id) {
      params.push(trailer_id);
      conditions.push(`trailer_id = $${params.length}`);
    }

    const result = await db.query(
      `SELECT m.*,
        t.unit_number as truck_unit,
        tr.unit_number as trailer_unit
       FROM maintenance_records m
       LEFT JOIN trucks t ON t.id=m.truck_id
       LEFT JOIN trailers tr ON tr.id=m.trailer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY service_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/maintenance
router.post('/', async (req, res) => {
  const {
    entity_type, truck_id, trailer_id, service_date, service_type, description,
    vendor, cost, mileage_at_service, next_due_mileage, next_due_date,
    dot_inspection, dot_inspection_expiration
  } = req.body;
  if (!entity_type || !service_date || !service_type) {
    return res.status(400).json({ error: 'entity_type, service_date, and service_type required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO maintenance_records (entity_type, truck_id, trailer_id, service_date, service_type, description,
       vendor, cost, mileage_at_service, next_due_mileage, next_due_date, dot_inspection, dot_inspection_expiration)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [entity_type, truck_id || null, trailer_id || null, service_date, service_type, description,
       vendor, cost, mileage_at_service, next_due_mileage, next_due_date || null,
       dot_inspection || false, dot_inspection_expiration || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/maintenance/:id
router.put('/:id', async (req, res) => {
  const {
    service_date, service_type, description, vendor, cost, mileage_at_service,
    next_due_mileage, next_due_date, dot_inspection, dot_inspection_expiration
  } = req.body;
  try {
    const result = await db.query(
      `UPDATE maintenance_records SET service_date=$1, service_type=$2, description=$3, vendor=$4,
       cost=$5, mileage_at_service=$6, next_due_mileage=$7, next_due_date=$8, dot_inspection=$9,
       dot_inspection_expiration=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [service_date, service_type, description, vendor, cost, mileage_at_service,
       next_due_mileage, next_due_date || null, dot_inspection || false,
       dot_inspection_expiration || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/maintenance/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM maintenance_records WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
