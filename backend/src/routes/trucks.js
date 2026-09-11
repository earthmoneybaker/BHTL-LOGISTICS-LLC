const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/trucks
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*,
        d.first_name, d.last_name,
        (SELECT MAX(service_date) FROM maintenance_records WHERE truck_id=t.id) as last_service_date,
        (SELECT dot_inspection_expiration FROM maintenance_records WHERE truck_id=t.id AND dot_inspection=TRUE ORDER BY service_date DESC LIMIT 1) as dot_inspection_expiration
       FROM trucks t
       LEFT JOIN drivers d ON d.id=t.assigned_driver_id
       WHERE t.is_active=TRUE
       ORDER BY t.unit_number`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trucks/:id
router.get('/:id', async (req, res) => {
  try {
    const [truck, maintenance, trailers, loads] = await Promise.all([
      db.query(
        `SELECT t.*, d.first_name, d.last_name, d.id as driver_id_ref
         FROM trucks t LEFT JOIN drivers d ON d.id=t.assigned_driver_id WHERE t.id=$1`,
        [req.params.id]
      ),
      db.query(
        'SELECT * FROM maintenance_records WHERE truck_id=$1 ORDER BY service_date DESC',
        [req.params.id]
      ),
      db.query(
        'SELECT * FROM trailers WHERE assigned_truck_id=$1 AND is_active=TRUE',
        [req.params.id]
      ),
      db.query(
        `SELECT l.id, l.load_number, l.status, l.rate, l.miles, l.pickup_date, l.delivery_date, c.name as customer_name
         FROM loads l LEFT JOIN customers c ON c.id=l.customer_id
         WHERE l.truck_id=$1 ORDER BY l.pickup_date DESC LIMIT 30`,
        [req.params.id]
      ),
    ]);
    if (!truck.rows[0]) return res.status(404).json({ error: 'Truck not found' });
    res.json({ truck: truck.rows[0], maintenance: maintenance.rows, trailers: trailers.rows, loads: loads.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trucks
router.post('/', async (req, res) => {
  const { unit_number, vin, plate_number, plate_state, year, make, model, registration_expiration, irp_status, irp_expiration, current_mileage, assigned_driver_id, status, notes } = req.body;
  if (!unit_number) return res.status(400).json({ error: 'Unit number required' });
  try {
    const result = await db.query(
      `INSERT INTO trucks (unit_number, vin, plate_number, plate_state, year, make, model, registration_expiration, irp_status, irp_expiration, current_mileage, assigned_driver_id, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [unit_number, vin, plate_number, plate_state, year, make, model, registration_expiration || null, irp_status, irp_expiration || null, current_mileage, assigned_driver_id || null, status || 'active', notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Unit number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/trucks/:id
router.put('/:id', async (req, res) => {
  const { unit_number, vin, plate_number, plate_state, year, make, model, registration_expiration, irp_status, irp_expiration, current_mileage, assigned_driver_id, status, notes, is_active } = req.body;
  try {
    const result = await db.query(
      `UPDATE trucks SET unit_number=$1, vin=$2, plate_number=$3, plate_state=$4, year=$5, make=$6, model=$7,
       registration_expiration=$8, irp_status=$9, irp_expiration=$10, current_mileage=$11,
       assigned_driver_id=$12, status=$13, notes=$14, is_active=$15, updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [unit_number, vin, plate_number, plate_state, year, make, model,
       registration_expiration || null, irp_status, irp_expiration || null,
       current_mileage, assigned_driver_id || null, status, notes, is_active !== false, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trucks/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE trucks SET is_active=FALSE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
