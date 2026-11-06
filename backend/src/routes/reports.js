const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// ── Helper: generate report number ────────────────────────────────────
async function nextReportNumber() {
  const res = await db.query('SELECT COUNT(*) FROM weekly_reports');
  const num = parseInt(res.rows[0].count) + 1;
  const yr = new Date().getFullYear();
  return `RPT-${yr}-${String(num).padStart(4, '0')}`;
}

// ── Helper: get deduction templates ──────────────────────────────────
async function getDeductionTemplates() {
  const res = await db.query(
    `SELECT * FROM deduction_templates WHERE is_active=TRUE ORDER BY sort_order`
  );
  return res.rows;
}

// ── Helper: calculate report figures ─────────────────────────────────
async function calculateReport(truck_id, driver_id, period_start, period_end, excludeLoadIds = []) {
  // Get loads for this period / truck / driver
  const conditions = [
    `l.status IN ('delivered','invoiced','paid')`,
    `l.delivery_date >= $1`,
    `l.delivery_date <= $2`,
  ];
  const params = [period_start, period_end];

  if (truck_id) { params.push(truck_id); conditions.push(`l.truck_id = $${params.length}`); }
  if (driver_id) { params.push(driver_id); conditions.push(`l.driver_id = $${params.length}`); }

  const loadsQ = await db.query(
    `SELECT l.id, l.load_number, l.rate, l.miles, l.pickup_date, l.delivery_date,
            l.driver_id, l.truck_id,
            l.origin_city, l.origin_state, l.destination_city, l.destination_state,
            d.pay_type, d.pay_rate,
            d.first_name as driver_first, d.last_name as driver_last
     FROM loads l
     LEFT JOIN drivers d ON d.id = l.driver_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.delivery_date ASC`,
    params
  );

  const loads = loadsQ.rows;
  let gross_revenue = 0;
  const load_items = [];

  for (const load of loads) {
    const rate_amt = parseFloat(load.rate) || 0;
    const miles = parseFloat(load.miles) || 0;

    // Driver pay calculation
    let driver_pay = 0;
    if (load.pay_type === 'per_mile') {
      driver_pay = miles * (parseFloat(load.pay_rate) || 0);
    } else if (load.pay_type === 'percentage') {
      driver_pay = rate_amt * ((parseFloat(load.pay_rate) || 0) / 100);
    } else if (load.pay_type === 'salary') {
      driver_pay = 0; // handled at period level
    }

    // Get fuel cost for this load
    const fuelQ = await db.query(
      `SELECT COALESCE(SUM(total_cost), 0) as fuel FROM fuel_purchases
       WHERE truck_id = $1 AND purchase_date BETWEEN $2 AND $3`,
      [load.truck_id, load.pickup_date || period_start, load.delivery_date || period_end]
    );
    const fuel_cost = 0; // We'll aggregate at period level

    const included = !excludeLoadIds.includes(load.id);
    if (included) gross_revenue += rate_amt;

    load_items.push({
      load_id: load.id,
      load_number: load.load_number,
      pickup_date: load.pickup_date,
      delivery_date: load.delivery_date,
      origin: `${load.origin_city || ''}, ${load.origin_state || ''}`.trim().replace(/^,\s*|,\s*$/, ''),
      destination: `${load.destination_city || ''}, ${load.destination_state || ''}`.trim().replace(/^,\s*|,\s*$/, ''),
      miles,
      load_rate: rate_amt,
      driver_pay: Math.round(driver_pay * 100) / 100,
      fuel_cost: 0,
      included,
      driver_name: load.driver_first ? `${load.driver_first} ${load.driver_last}` : null,
      pay_type: load.pay_type,
    });
  }

  // Get total fuel for the period / truck
  let fuel_cost = 0;
  if (truck_id) {
    const fuelQ = await db.query(
      `SELECT COALESCE(SUM(total_cost), 0) as total FROM fuel_purchases
       WHERE truck_id = $1 AND purchase_date >= $2 AND purchase_date <= $3`,
      [truck_id, period_start, period_end]
    );
    fuel_cost = parseFloat(fuelQ.rows[0]?.total) || 0;
  }

  // Calculate driver salary for included loads
  const driver_salary = load_items
    .filter(l => l.included)
    .reduce((sum, l) => sum + (l.driver_pay || 0), 0);

  // Get company settings for deduction defaults (fall back to hardcoded defaults)
  let settingsRow = { eld_fee_weekly: 35, insurance_monthly: 2000, trailer_payment_monthly: 600, dispatch_fee_pct: 4, office_authority_pct: 12 };
  try {
    const settingsQ = await db.query('SELECT * FROM company_settings LIMIT 1');
    if (settingsQ.rows[0]) settingsRow = { ...settingsRow, ...settingsQ.rows[0] };
  } catch (_) {}

  const eldDefault    = parseFloat(settingsRow.eld_fee_weekly) || 35;
  const insurDefault  = (parseFloat(settingsRow.insurance_monthly) || 2000) / 4;
  const trailerDefault = (parseFloat(settingsRow.trailer_payment_monthly) || 600) / 4;
  const dispatchPct   = (parseFloat(settingsRow.dispatch_fee_pct) || 4) / 100;
  const authorityPct  = (parseFloat(settingsRow.office_authority_pct) || 12) / 100;

  // Calculate deductions: use company settings, override with deduction templates if configured
  const templates = await getDeductionTemplates();
  let eld_fee = eldDefault, dispatch_fee = 0, insurance_fee = insurDefault, trailer_payment = trailerDefault, office_authority_fee = 0;

  for (const tpl of templates) {
    if (tpl.deduction_type === 'fixed_weekly') {
      const amt = parseFloat(tpl.amount) || 0;
      if (tpl.name.toLowerCase().includes('eld') || tpl.name.toLowerCase().includes('rock')) eld_fee = amt;
      else if (tpl.name.toLowerCase().includes('insurance')) insurance_fee = amt;
      else if (tpl.name.toLowerCase().includes('trailer')) trailer_payment = amt;
    } else if (tpl.deduction_type === 'percentage_revenue') {
      const pct = (parseFloat(tpl.percentage) || 0) / 100;
      const fee = Math.round(gross_revenue * pct * 100) / 100;
      if (tpl.name.toLowerCase().includes('dispatch')) dispatch_fee = fee;
      else if (tpl.name.toLowerCase().includes('office') || tpl.name.toLowerCase().includes('authority')) office_authority_fee = fee;
    }
  }

  // If no dispatch/authority template found, apply from settings
  if (dispatch_fee === 0) dispatch_fee = Math.round(gross_revenue * dispatchPct * 100) / 100;
  if (office_authority_fee === 0) office_authority_fee = Math.round(gross_revenue * authorityPct * 100) / 100;

  const total_deductions = fuel_cost + eld_fee + dispatch_fee + insurance_fee + trailer_payment + driver_salary + office_authority_fee;
  const net_revenue = gross_revenue - total_deductions;

  return {
    gross_revenue: Math.round(gross_revenue * 100) / 100,
    fuel_cost: Math.round(fuel_cost * 100) / 100,
    eld_fee,
    dispatch_fee,
    insurance_fee,
    trailer_payment,
    driver_salary: Math.round(driver_salary * 100) / 100,
    office_authority_fee,
    total_deductions: Math.round(total_deductions * 100) / 100,
    net_revenue: Math.round(net_revenue * 100) / 100,
    loads: load_items,
  };
}

// ── GET /api/reports ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { truck_id, driver_id, status, period_start, period_end } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (truck_id) { params.push(truck_id); conditions.push(`r.truck_id = $${params.length}`); }
    if (driver_id) { params.push(driver_id); conditions.push(`r.driver_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
    if (period_start) { params.push(period_start); conditions.push(`r.period_start >= $${params.length}`); }
    if (period_end) { params.push(period_end); conditions.push(`r.period_end <= $${params.length}`); }

    const result = await db.query(
      `SELECT r.*,
              t.unit_number as truck_unit,
              d.first_name as driver_first, d.last_name as driver_last,
              u.full_name as created_by_name
       FROM weekly_reports r
       LEFT JOIN trucks t ON t.id = r.truck_id
       LEFT JOIN drivers d ON d.id = r.driver_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.period_start DESC, r.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/summary — week overview for all trucks ──────────
router.get('/summary', async (req, res) => {
  try {
    const { period_start, period_end } = req.query;
    const start = period_start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = period_end || new Date().toISOString().slice(0, 10);

    // Revenue by truck
    const revenueQ = await db.query(
      `SELECT l.truck_id, t.unit_number,
              d.first_name, d.last_name,
              COUNT(l.id) as load_count,
              COALESCE(SUM(l.rate), 0) as gross_revenue
       FROM loads l
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       WHERE l.status IN ('delivered','invoiced','paid')
         AND l.delivery_date >= $1 AND l.delivery_date <= $2
       GROUP BY l.truck_id, t.unit_number, d.first_name, d.last_name
       ORDER BY gross_revenue DESC`,
      [start, end]
    );

    // Fuel by truck
    const fuelQ = await db.query(
      `SELECT truck_id, COALESCE(SUM(total_cost), 0) as total_fuel
       FROM fuel_purchases
       WHERE purchase_date >= $1 AND purchase_date <= $2
       GROUP BY truck_id`,
      [start, end]
    );

    const fuelMap = {};
    for (const f of fuelQ.rows) fuelMap[f.truck_id] = parseFloat(f.total_fuel);

    // Active loads (in transit / dispatched)
    const activeQ = await db.query(
      `SELECT l.id, l.load_number, l.status, l.rate, l.pickup_date, l.delivery_date,
              l.origin_city, l.origin_state, l.destination_city, l.destination_state,
              t.unit_number, d.first_name, d.last_name
       FROM loads l
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       WHERE l.status IN ('booked','dispatched','in_transit')
       ORDER BY l.pickup_date ASC`
    );

    const totals = {
      total_revenue: 0,
      total_fuel: 0,
      total_loads: 0,
    };

    const byTruck = revenueQ.rows.map(row => {
      const fuel = fuelMap[row.truck_id] || 0;
      const rev = parseFloat(row.gross_revenue);
      totals.total_revenue += rev;
      totals.total_fuel += fuel;
      totals.total_loads += parseInt(row.load_count);
      return {
        truck_id: row.truck_id,
        unit_number: row.unit_number,
        driver_name: row.first_name ? `${row.first_name} ${row.last_name}` : '—',
        load_count: parseInt(row.load_count),
        gross_revenue: rev,
        fuel_cost: fuel,
        net_after_fuel: Math.round((rev - fuel) * 100) / 100,
      };
    });

    res.json({
      period: { start, end },
      by_truck: byTruck,
      active_loads: activeQ.rows,
      totals,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/reports/calculate  (preview) ───────────────────────────
router.post('/calculate', async (req, res) => {
  const { truck_id, driver_id, period_start, period_end, exclude_load_ids } = req.body;
  if (!period_start || !period_end) {
    return res.status(400).json({ error: 'period_start and period_end required' });
  }
  try {
    const calc = await calculateReport(truck_id, driver_id, period_start, period_end, exclude_load_ids || []);
    res.json(calc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/weekly-summary — data for weekly PDF download ────
// ?period_start=YYYY-MM-DD&period_end=YYYY-MM-DD&truck_id=UUID (optional)
router.get('/weekly-summary', async (req, res) => {
  try {
    const { period_start, period_end, truck_id } = req.query;

    // Default to current week Mon–Sun
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const start = period_start || monday.toISOString().split('T')[0];
    const end   = period_end   || sunday.toISOString().split('T')[0];

    // Get active trucks (filtered or all)
    const truckQ = await db.query(
      `SELECT t.id, t.unit_number, t.make, t.model,
              d.id as driver_id, d.first_name, d.last_name, d.phone
       FROM trucks t
       LEFT JOIN drivers d ON d.id = t.assigned_driver_id
       WHERE t.is_active = true ${truck_id ? 'AND t.id = $1' : ''}
       ORDER BY t.unit_number`,
      truck_id ? [truck_id] : []
    );

    const trucks = truckQ.rows;
    const result = [];

    for (const truck of trucks) {
      const loadsQ = await db.query(
        `SELECT l.id, l.load_number, l.rate, l.miles,
                l.pickup_date, l.delivery_date,
                l.origin_city, l.origin_state,
                l.destination_city, l.destination_state,
                l.status,
                d.first_name as driver_first, d.last_name as driver_last,
                d.pay_type, d.pay_rate
         FROM loads l
         LEFT JOIN drivers d ON d.id = l.driver_id
         WHERE l.truck_id = $1
           AND l.delivery_date >= $2 AND l.delivery_date <= $3
           AND l.status IN ('delivered','invoiced','paid')
         ORDER BY l.delivery_date ASC`,
        [truck.id, start, end]
      );

      const fuelQ = await db.query(
        `SELECT COALESCE(SUM(total_cost),0) as total_cost,
                COALESCE(SUM(gallons),0) as total_gallons,
                COUNT(*) as purchases
         FROM fuel_purchases
         WHERE truck_id = $1 AND purchase_date >= $2 AND purchase_date <= $3`,
        [truck.id, start, end]
      );

      const loads = loadsQ.rows;
      const fuelRow = fuelQ.rows[0];
      const gross_revenue = loads.reduce((s, l) => s + (parseFloat(l.rate) || 0), 0);
      const fuel_cost = parseFloat(fuelRow.total_cost) || 0;

      const driver_pay = loads.reduce((s, l) => {
        const rate = parseFloat(l.rate) || 0;
        const miles = parseFloat(l.miles) || 0;
        if (l.pay_type === 'per_mile') return s + miles * (parseFloat(l.pay_rate) || 0);
        if (l.pay_type === 'percentage') return s + rate * ((parseFloat(l.pay_rate) || 0) / 100);
        return s;
      }, 0);

      result.push({
        truck_id: truck.id,
        unit_number: truck.unit_number,
        make: truck.make,
        model: truck.model,
        driver_first: truck.first_name,
        driver_last: truck.last_name,
        driver_phone: truck.phone,
        gross_revenue: Math.round(gross_revenue * 100) / 100,
        fuel_cost: Math.round(fuel_cost * 100) / 100,
        net_after_fuel: Math.round((gross_revenue - fuel_cost) * 100) / 100,
        driver_pay: Math.round(driver_pay * 100) / 100,
        load_count: loads.length,
        total_gallons: parseFloat(fuelRow.total_gallons) || 0,
        fuel_purchases: parseInt(fuelRow.purchases) || 0,
        loads: loads.map(l => ({
          load_number: l.load_number,
          pickup_date: l.pickup_date,
          delivery_date: l.delivery_date,
          origin: `${l.origin_city || ''}, ${l.origin_state || ''}`.trim().replace(/^,\s*|,\s*$/,''),
          destination: `${l.destination_city || ''}, ${l.destination_state || ''}`.trim().replace(/^,\s*|,\s*$/,''),
          miles: parseFloat(l.miles) || 0,
          rate: parseFloat(l.rate) || 0,
          status: l.status,
        })),
      });
    }

    const fleet_total_revenue = result.reduce((s, t) => s + t.gross_revenue, 0);
    const fleet_total_fuel    = result.reduce((s, t) => s + t.fuel_cost, 0);
    const fleet_total_loads   = result.reduce((s, t) => s + t.load_count, 0);

    res.json({
      period: { start, end },
      trucks: result,
      totals: {
        gross_revenue: Math.round(fleet_total_revenue * 100) / 100,
        fuel_cost:     Math.round(fleet_total_fuel * 100) / 100,
        net_after_fuel: Math.round((fleet_total_revenue - fleet_total_fuel) * 100) / 100,
        load_count:    fleet_total_loads,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/:id ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [reportQ, itemsQ] = await Promise.all([
      db.query(
        `SELECT r.*,
                t.unit_number, t.make, t.model, t.year as truck_year,
                d.first_name as driver_first, d.last_name as driver_last,
                d.phone as driver_phone,
                u.full_name as created_by_name
         FROM weekly_reports r
         LEFT JOIN trucks t ON t.id = r.truck_id
         LEFT JOIN drivers d ON d.id = r.driver_id
         LEFT JOIN users u ON u.id = r.created_by
         WHERE r.id = $1`, [req.params.id]
      ),
      db.query(
        'SELECT * FROM report_load_items WHERE report_id=$1 ORDER BY delivery_date ASC',
        [req.params.id]
      ),
    ]);
    if (!reportQ.rows[0]) return res.status(404).json({ error: 'Report not found' });
    res.json({ report: reportQ.rows[0], load_items: itemsQ.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/reports  (create) ───────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const {
    report_type, period_start, period_end, truck_id, driver_id,
    gross_revenue, fuel_cost, eld_fee, dispatch_fee, insurance_fee,
    trailer_payment, office_authority_fee, driver_salary,
    custom_deductions, total_deductions, net_revenue,
    notes, status, load_items,
  } = req.body;

  if (!period_start || !period_end) {
    return res.status(400).json({ error: 'period_start and period_end required' });
  }

  try {
    const report_number = await nextReportNumber();
    const customDed = Array.isArray(custom_deductions) ? JSON.stringify(custom_deductions) : '[]';

    const result = await db.query(
      `INSERT INTO weekly_reports
        (report_number, report_type, period_start, period_end, truck_id, driver_id,
         gross_revenue, fuel_cost, eld_fee, dispatch_fee, insurance_fee, trailer_payment,
         office_authority_fee, driver_salary, custom_deductions, total_deductions, net_revenue,
         notes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [report_number, report_type || 'weekly', period_start, period_end,
       truck_id || null, driver_id || null,
       gross_revenue || 0, fuel_cost || 0, eld_fee || 35, dispatch_fee || 0,
       insurance_fee || 500, trailer_payment || 150,
       office_authority_fee || 0, driver_salary || 0, customDed,
       total_deductions || 0, net_revenue || 0,
       notes, status || 'draft', req.user.id]
    );

    const report_id = result.rows[0].id;

    // Save load line items
    if (Array.isArray(load_items) && load_items.length > 0) {
      for (const item of load_items) {
        await db.query(
          `INSERT INTO report_load_items
            (report_id, load_id, load_number, pickup_date, delivery_date,
             origin, destination, miles, load_rate, driver_pay, fuel_cost, included)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [report_id, item.load_id || null, item.load_number,
           item.pickup_date || null, item.delivery_date || null,
           item.origin, item.destination,
           item.miles || 0, item.load_rate || 0, item.driver_pay || 0,
           item.fuel_cost || 0, item.included !== false]
        );
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/reports/:id ─────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const {
    gross_revenue, fuel_cost, eld_fee, dispatch_fee, insurance_fee,
    trailer_payment, office_authority_fee, driver_salary,
    custom_deductions, total_deductions, net_revenue,
    notes, status,
  } = req.body;

  try {
    const customDed = Array.isArray(custom_deductions) ? JSON.stringify(custom_deductions) : '[]';
    const result = await db.query(
      `UPDATE weekly_reports SET
         gross_revenue=$1, fuel_cost=$2, eld_fee=$3, dispatch_fee=$4, insurance_fee=$5,
         trailer_payment=$6, office_authority_fee=$7, driver_salary=$8,
         custom_deductions=$9, total_deductions=$10, net_revenue=$11,
         notes=$12, status=$13, updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [gross_revenue, fuel_cost, eld_fee, dispatch_fee, insurance_fee,
       trailer_payment, office_authority_fee, driver_salary,
       customDed, total_deductions, net_revenue,
       notes, status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/reports/:id/status ───────────────────────────────────
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status, sent_via } = req.body;
  if (!['draft', 'finalized', 'sent'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const result = await db.query(
      `UPDATE weekly_reports SET status=$1, sent_via=$2, sent_at=CASE WHEN $1='sent' THEN NOW() ELSE sent_at END, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, sent_via || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/reports/:id ──────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM weekly_reports WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/weekly-summary — data for weekly PDF download ────
// ?period_start=YYYY-MM-DD&period_end=YYYY-MM-DD&truck_id=UUID (optional)
router.get('/weekly-summary', async (req, res) => {
  try {
    const { period_start, period_end, truck_id } = req.query;

    // Default to current week Mon–Sun
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const start = period_start || monday.toISOString().split('T')[0];
    const end   = period_end   || sunday.toISOString().split('T')[0];

    // Get active trucks (filtered or all)
    const truckQ = await db.query(
      `SELECT t.id, t.unit_number, t.make, t.model,
              d.id as driver_id, d.first_name, d.last_name, d.phone
       FROM trucks t
       LEFT JOIN drivers d ON d.id = t.assigned_driver_id
       WHERE t.is_active = true ${truck_id ? 'AND t.id = $1' : ''}
       ORDER BY t.unit_number`,
      truck_id ? [truck_id] : []
    );

    const trucks = truckQ.rows;
    const result = [];

    for (const truck of trucks) {
      // Loads delivered this week for this truck
      const loadsQ = await db.query(
        `SELECT l.id, l.load_number, l.rate, l.miles,
                l.pickup_date, l.delivery_date,
                l.origin_city, l.origin_state,
                l.destination_city, l.destination_state,
                l.status,
                d.first_name as driver_first, d.last_name as driver_last,
                d.pay_type, d.pay_rate
         FROM loads l
         LEFT JOIN drivers d ON d.id = l.driver_id
         WHERE l.truck_id = $1
           AND l.delivery_date >= $2 AND l.delivery_date <= $3
           AND l.status IN ('delivered','invoiced','paid')
         ORDER BY l.delivery_date ASC`,
        [truck.id, start, end]
      );

      // Fuel this week for this truck
      const fuelQ = await db.query(
        `SELECT COALESCE(SUM(total_cost),0) as total_cost,
                COALESCE(SUM(gallons),0) as total_gallons,
                COUNT(*) as purchases
         FROM fuel_purchases
         WHERE truck_id = $1 AND purchase_date >= $2 AND purchase_date <= $3`,
        [truck.id, start, end]
      );

      const loads = loadsQ.rows;
      const fuelRow = fuelQ.rows[0];
      const gross_revenue = loads.reduce((s, l) => s + (parseFloat(l.rate) || 0), 0);
      const fuel_cost = parseFloat(fuelRow.total_cost) || 0;
      const net_after_fuel = gross_revenue - fuel_cost;

      // Driver pay
      const driver_pay = loads.reduce((s, l) => {
        const rate = parseFloat(l.rate) || 0;
        const miles = parseFloat(l.miles) || 0;
        if (l.pay_type === 'per_mile') return s + miles * (parseFloat(l.pay_rate) || 0);
        if (l.pay_type === 'percentage') return s + rate * ((parseFloat(l.pay_rate) || 0) / 100);
        return s;
      }, 0);

      result.push({
        truck_id: truck.id,
        unit_number: truck.unit_number,
        make: truck.make,
        model: truck.model,
        driver_first: truck.first_name,
        driver_last: truck.last_name,
        driver_phone: truck.phone,
        gross_revenue: Math.round(gross_revenue * 100) / 100,
        fuel_cost: Math.round(fuel_cost * 100) / 100,
        net_after_fuel: Math.round(net_after_fuel * 100) / 100,
        driver_pay: Math.round(driver_pay * 100) / 100,
        load_count: loads.length,
        total_gallons: parseFloat(fuelRow.total_gallons) || 0,
        fuel_purchases: parseInt(fuelRow.purchases) || 0,
        loads: loads.map(l => ({
          load_number: l.load_number,
          pickup_date: l.pickup_date,
          delivery_date: l.delivery_date,
          origin: `${l.origin_city || ''}, ${l.origin_state || ''}`.trim().replace(/^,\s*|,\s*$/,''),
          destination: `${l.destination_city || ''}, ${l.destination_state || ''}`.trim().replace(/^,\s*|,\s*$/,''),
          miles: parseFloat(l.miles) || 0,
          rate: parseFloat(l.rate) || 0,
          status: l.status,
        })),
      });
    }

    const fleet_total_revenue = result.reduce((s, t) => s + t.gross_revenue, 0);
    const fleet_total_fuel    = result.reduce((s, t) => s + t.fuel_cost, 0);
    const fleet_total_loads   = result.reduce((s, t) => s + t.load_count, 0);

    res.json({
      period: { start, end },
      trucks: result,
      totals: {
        gross_revenue: Math.round(fleet_total_revenue * 100) / 100,
        fuel_cost:     Math.round(fleet_total_fuel * 100) / 100,
        net_after_fuel: Math.round((fleet_total_revenue - fleet_total_fuel) * 100) / 100,
        load_count:    fleet_total_loads,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
