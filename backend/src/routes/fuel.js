const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { stringify } = require('csv-stringify/sync');

router.use(authenticate);

// GET /api/fuel
router.get('/', async (req, res) => {
  try {
    const { truck_id, state, date_from, date_to, quarter, year } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (truck_id) { params.push(truck_id); conditions.push(`f.truck_id = $${params.length}`); }
    if (state) { params.push(state); conditions.push(`f.state = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`f.purchase_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`f.purchase_date <= $${params.length}`); }
    if (quarter && year) {
      const q = parseInt(quarter);
      const y = parseInt(year);
      const qStart = `${y}-${String((q-1)*3+1).padStart(2,'0')}-01`;
      const qEndMonth = q * 3;
      const lastDay = new Date(y, qEndMonth, 0).getDate();
      const qEnd = `${y}-${String(qEndMonth).padStart(2,'0')}-${lastDay}`;
      params.push(qStart); conditions.push(`f.purchase_date >= $${params.length}`);
      params.push(qEnd); conditions.push(`f.purchase_date <= $${params.length}`);
    }

    const result = await db.query(
      `SELECT f.*, t.unit_number as truck_unit
       FROM fuel_purchases f
       LEFT JOIN trucks t ON t.id=f.truck_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY f.purchase_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fuel
router.post('/', async (req, res) => {
  const { truck_id, purchase_date, state, gallons, cost_per_gallon, total_cost, vendor, notes } = req.body;
  if (!purchase_date || !state || !gallons) return res.status(400).json({ error: 'purchase_date, state, gallons required' });
  try {
    const total = total_cost || (parseFloat(gallons) * parseFloat(cost_per_gallon || 0));
    const result = await db.query(
      `INSERT INTO fuel_purchases (truck_id, purchase_date, state, gallons, cost_per_gallon, total_cost, vendor, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [truck_id || null, purchase_date, state.toUpperCase(), gallons, cost_per_gallon, total, vendor, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/fuel/:id
router.put('/:id', async (req, res) => {
  const { truck_id, purchase_date, state, gallons, cost_per_gallon, total_cost, vendor, notes } = req.body;
  try {
    const total = total_cost || (parseFloat(gallons) * parseFloat(cost_per_gallon || 0));
    const result = await db.query(
      `UPDATE fuel_purchases SET truck_id=$1, purchase_date=$2, state=$3, gallons=$4, cost_per_gallon=$5, total_cost=$6, vendor=$7, notes=$8
       WHERE id=$9 RETURNING *`,
      [truck_id || null, purchase_date, state.toUpperCase(), gallons, cost_per_gallon, total, vendor, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fuel/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM fuel_purchases WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fuel/ifta — quarterly IFTA report
router.get('/report/ifta', async (req, res) => {
  try {
    const { quarter, year, truck_id } = req.query;
    const q = parseInt(quarter) || Math.ceil((new Date().getMonth() + 1) / 3);
    const y = parseInt(year) || new Date().getFullYear();
    const qStart = `${y}-${String((q-1)*3+1).padStart(2,'0')}-01`;
    const qEndMonth = q * 3;
    const lastDay = new Date(y, qEndMonth, 0).getDate();
    const qEnd = `${y}-${String(qEndMonth).padStart(2,'0')}-${lastDay}`;

    const conditions = [`f.purchase_date >= '${qStart}' AND f.purchase_date <= '${qEnd}'`];
    if (truck_id) conditions.push(`f.truck_id = '${truck_id}'`);

    // Gallons purchased per state
    const fuelByState = await db.query(
      `SELECT state, SUM(gallons) as gallons_purchased, SUM(total_cost) as total_cost
       FROM fuel_purchases f
       WHERE ${conditions.join(' AND ')}
       GROUP BY state ORDER BY state`
    );

    // Miles per state
    const mConds = [`m.trip_date >= '${qStart}' AND m.trip_date <= '${qEnd}'`];
    if (truck_id) mConds.push(`m.truck_id = '${truck_id}'`);

    const milesByState = await db.query(
      `SELECT state, SUM(miles) as miles
       FROM miles_by_state m
       WHERE ${mConds.join(' AND ')}
       GROUP BY state ORDER BY state`
    );

    // Total miles and gallons
    const totalMiles = milesByState.rows.reduce((acc, r) => acc + parseFloat(r.miles), 0);
    const totalGallons = fuelByState.rows.reduce((acc, r) => acc + parseFloat(r.gallons_purchased), 0);
    const avgMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;

    // Per-state calculation
    const states = new Set([
      ...fuelByState.rows.map(r => r.state),
      ...milesByState.rows.map(r => r.state),
    ]);

    const iftaRows = Array.from(states).sort().map(state => {
      const fuel = fuelByState.rows.find(r => r.state === state) || { gallons_purchased: 0, total_cost: 0 };
      const miles = milesByState.rows.find(r => r.state === state) || { miles: 0 };
      const stateGallonsUsed = avgMpg > 0 ? parseFloat(miles.miles) / avgMpg : 0;
      const gallonsDiff = parseFloat(fuel.gallons_purchased) - stateGallonsUsed;
      return {
        state,
        miles: parseFloat(miles.miles),
        gallons_purchased: parseFloat(fuel.gallons_purchased),
        gallons_used: stateGallonsUsed.toFixed(3),
        gallons_net: gallonsDiff.toFixed(3), // positive = overpaid, negative = owe
        total_fuel_cost: parseFloat(fuel.total_cost),
      };
    });

    res.json({
      quarter: q, year: y, period: `${qStart} to ${qEnd}`,
      total_miles: totalMiles, total_gallons: totalGallons, avg_mpg: avgMpg.toFixed(2),
      by_state: iftaRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fuel/report/ifta/csv — export IFTA as CSV
router.get('/report/ifta/csv', async (req, res) => {
  try {
    const { quarter, year, truck_id } = req.query;
    // reuse the computation
    const q = parseInt(quarter) || Math.ceil((new Date().getMonth() + 1) / 3);
    const y = parseInt(year) || new Date().getFullYear();
    const qStart = `${y}-${String((q-1)*3+1).padStart(2,'0')}-01`;
    const qEndMonth = q * 3;
    const lastDay = new Date(y, qEndMonth, 0).getDate();
    const qEnd = `${y}-${String(qEndMonth).padStart(2,'0')}-${lastDay}`;

    const conditions = [`purchase_date >= '${qStart}' AND purchase_date <= '${qEnd}'`];
    if (truck_id) conditions.push(`truck_id = '${truck_id}'`);
    const fuelByState = await db.query(`SELECT state, SUM(gallons) as gallons_purchased, SUM(total_cost) as total_cost FROM fuel_purchases WHERE ${conditions.join(' AND ')} GROUP BY state`);
    const mConds = [`trip_date >= '${qStart}' AND trip_date <= '${qEnd}'`];
    if (truck_id) mConds.push(`truck_id = '${truck_id}'`);
    const milesByState = await db.query(`SELECT state, SUM(miles) as miles FROM miles_by_state WHERE ${mConds.join(' AND ')} GROUP BY state`);

    const totalMiles = milesByState.rows.reduce((a, r) => a + parseFloat(r.miles), 0);
    const totalGallons = fuelByState.rows.reduce((a, r) => a + parseFloat(r.gallons_purchased), 0);
    const avgMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;

    const states = new Set([...fuelByState.rows.map(r => r.state), ...milesByState.rows.map(r => r.state)]);
    const rows = Array.from(states).sort().map(state => {
      const fuel = fuelByState.rows.find(r => r.state === state) || { gallons_purchased: 0 };
      const miles = milesByState.rows.find(r => r.state === state) || { miles: 0 };
      const used = avgMpg > 0 ? parseFloat(miles.miles) / avgMpg : 0;
      return { state, miles: parseFloat(miles.miles), gallons_purchased: parseFloat(fuel.gallons_purchased), gallons_used: used.toFixed(3), net_gallons: (parseFloat(fuel.gallons_purchased) - used).toFixed(3) };
    });

    const csv = stringify(rows, { header: true, columns: ['state','miles','gallons_purchased','gallons_used','net_gallons'] });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="IFTA-Q${q}-${y}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fuel/miles — log miles by state (for IFTA)
router.post('/miles', async (req, res) => {
  const { truck_id, load_id, state, miles, trip_date } = req.body;
  if (!state || !miles || !trip_date) return res.status(400).json({ error: 'state, miles, trip_date required' });
  try {
    const d = new Date(trip_date);
    const quarter = `Q${Math.ceil((d.getMonth() + 1) / 3)}`;
    const year = d.getFullYear();
    const result = await db.query(
      `INSERT INTO miles_by_state (truck_id, load_id, state, miles, trip_date, quarter, year)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [truck_id || null, load_id || null, state.toUpperCase(), miles, trip_date, quarter, year]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fuel/miles — list miles by state
router.get('/miles', async (req, res) => {
  try {
    const { truck_id, quarter, year } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (truck_id) { params.push(truck_id); conditions.push(`truck_id = $${params.length}`); }
    if (quarter) { params.push(quarter); conditions.push(`quarter = $${params.length}`); }
    if (year) { params.push(parseInt(year)); conditions.push(`year = $${params.length}`); }

    const result = await db.query(
      `SELECT m.*, t.unit_number as truck_unit, l.load_number
       FROM miles_by_state m
       LEFT JOIN trucks t ON t.id=m.truck_id
       LEFT JOIN loads l ON l.id=m.load_id
       WHERE ${conditions.join(' AND ')} ORDER BY trip_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
