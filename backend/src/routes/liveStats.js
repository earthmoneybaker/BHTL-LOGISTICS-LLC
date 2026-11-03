const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ── Helper: get current week boundaries ──────────────────────────────────
function getWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysFromMonday);
  return {
    weekStartStr: weekStart.toISOString().slice(0, 10),
    weekEndStr: now.toISOString().slice(0, 10),
    now,
  };
}

// ── AUTO STATUS: Mark overdue in_transit loads as delivered ──────────────
// Called before every live-stats fetch
async function autoMarkDelivered() {
  try {
    const now = new Date();
    const nowDate = now.toISOString().slice(0, 10);
    const nowTime = now.toTimeString().slice(0, 5); // HH:MM

    // Find in_transit loads whose delivery_date+time has passed
    const overdueQ = await db.query(
      `SELECT id, load_number, delivery_date, delivery_time
       FROM loads
       WHERE status = 'in_transit'
         AND delivery_date IS NOT NULL
         AND (
           delivery_date < $1
           OR (delivery_date = $1 AND delivery_time IS NOT NULL AND delivery_time <= $2)
           OR (delivery_date = $1 AND delivery_time IS NULL)
         )`,
      [nowDate, nowTime]
    );

    for (const load of overdueQ.rows) {
      await db.query(
        `UPDATE loads SET status = 'delivered', updated_at = NOW()
         WHERE id = $1 AND status = 'in_transit'`,
        [load.id]
      );
      console.log(`⚡ Auto-marked load ${load.load_number} as delivered (past delivery time)`);
    }

    return overdueQ.rows.length;
  } catch (err) {
    console.warn('Auto-mark delivery error:', err.message);
    return 0;
  }
}

// ── GET /api/live-stats ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Auto-mark overdue loads before fetching stats
    await autoMarkDelivered();

    const { weekStartStr, weekEndStr } = getWeekBounds();

    // Active loads (in motion or booked) — include delivery_time
    const activeLoadsQ = await db.query(
      `SELECT l.id, l.load_number, l.status, l.rate, l.miles,
              l.pickup_date, l.delivery_date, l.pickup_time, l.delivery_time,
              l.origin_city, l.origin_state, l.destination_city, l.destination_state,
              l.truck_id,
              t.unit_number as truck_unit,
              d.first_name as driver_first, d.last_name as driver_last, d.phone as driver_phone,
              c.name as customer_name
       FROM loads l
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       LEFT JOIN customers c ON c.id = l.customer_id
       WHERE l.status IN ('booked','dispatched','in_transit')
       ORDER BY l.delivery_date ASC NULLS LAST, l.pickup_date ASC`
    );

    // This week's delivered/invoiced/paid loads
    const weekLoadsQ = await db.query(
      `SELECT l.id, l.load_number, l.status, l.rate, l.miles,
              l.pickup_date, l.delivery_date, l.delivery_time,
              l.origin_city, l.origin_state, l.destination_city, l.destination_state,
              l.truck_id,
              t.unit_number as truck_unit,
              d.first_name as driver_first, d.last_name as driver_last,
              c.name as customer_name
       FROM loads l
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       LEFT JOIN customers c ON c.id = l.customer_id
       WHERE l.status IN ('delivered','invoiced','paid')
         AND l.delivery_date >= $1 AND l.delivery_date <= $2
       ORDER BY l.delivery_date DESC`,
      [weekStartStr, weekEndStr]
    );

    // Revenue by truck this week
    const revenueByTruckQ = await db.query(
      `SELECT l.truck_id, t.unit_number,
              COUNT(l.id) as load_count,
              COALESCE(SUM(l.rate), 0) as gross_revenue,
              d.first_name, d.last_name
       FROM loads l
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       WHERE l.status IN ('delivered','invoiced','paid')
         AND l.delivery_date >= $1 AND l.delivery_date <= $2
       GROUP BY l.truck_id, t.unit_number, d.first_name, d.last_name
       ORDER BY gross_revenue DESC`,
      [weekStartStr, weekEndStr]
    );

    // Fuel by truck this week
    const fuelByTruckQ = await db.query(
      `SELECT fp.truck_id, t.unit_number,
              COALESCE(SUM(fp.total_cost), 0) as total_fuel,
              COALESCE(SUM(fp.gallons), 0) as total_gallons
       FROM fuel_purchases fp
       LEFT JOIN trucks t ON t.id = fp.truck_id
       WHERE fp.purchase_date >= $1 AND fp.purchase_date <= $2
       GROUP BY fp.truck_id, t.unit_number`,
      [weekStartStr, weekEndStr]
    );

    // Week totals
    const weekTotalsQ = await db.query(
      `SELECT COALESCE(SUM(rate), 0) as total_revenue,
              COUNT(*) as total_loads,
              COALESCE(SUM(miles), 0) as total_miles
       FROM loads
       WHERE status IN ('delivered','invoiced','paid')
         AND delivery_date >= $1 AND delivery_date <= $2`,
      [weekStartStr, weekEndStr]
    );

    const weekFuelTotalQ = await db.query(
      `SELECT COALESCE(SUM(total_cost), 0) as total_fuel
       FROM fuel_purchases
       WHERE purchase_date >= $1 AND purchase_date <= $2`,
      [weekStartStr, weekEndStr]
    );

    // Truck status with delivery_time from current active load
    const truckStatusQ = await db.query(
      `SELECT t.id, t.unit_number, t.status,
              d.first_name, d.last_name, d.phone,
              l.id as load_id, l.load_number as current_load_number,
              l.status as load_status,
              l.origin_city, l.origin_state, l.destination_city, l.destination_state,
              l.pickup_date, l.delivery_date, l.delivery_time, l.rate,
              c.name as customer_name
       FROM trucks t
       LEFT JOIN drivers d ON d.id = t.assigned_driver_id
       LEFT JOIN LATERAL (
         SELECT * FROM loads
         WHERE truck_id = t.id
           AND status IN ('booked','dispatched','in_transit')
         ORDER BY pickup_date DESC LIMIT 1
       ) l ON TRUE
       LEFT JOIN customers c ON c.id = l.customer_id
       WHERE t.is_active = TRUE
       ORDER BY t.unit_number`
    );

    // Pending settlements
    const pendingSettlementsQ = await db.query(
      `SELECT d.id, d.first_name, d.last_name,
              COUNT(l.id) as week_load_count,
              COALESCE(SUM(l.rate), 0) as week_revenue
       FROM drivers d
       LEFT JOIN loads l ON l.driver_id = d.id
         AND l.status IN ('delivered','invoiced','paid')
         AND l.delivery_date >= $1 AND l.delivery_date <= $2
       WHERE d.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM driver_settlements s
           WHERE s.driver_id = d.id
             AND s.period_start <= $2 AND s.period_end >= $1
         )
       GROUP BY d.id, d.first_name, d.last_name
       HAVING COUNT(l.id) > 0
       ORDER BY week_revenue DESC`,
      [weekStartStr, weekEndStr]
    );

    const fuelMap = {};
    for (const f of fuelByTruckQ.rows) {
      fuelMap[f.truck_id] = {
        unit_number: f.unit_number,
        total_fuel: parseFloat(f.total_fuel),
        total_gallons: parseFloat(f.total_gallons),
      };
    }

    const weekRevenue = parseFloat(weekTotalsQ.rows[0]?.total_revenue) || 0;
    const weekFuel = parseFloat(weekFuelTotalQ.rows[0]?.total_fuel) || 0;

    res.json({
      week: { start: weekStartStr, end: weekEndStr },
      summary: {
        week_revenue: weekRevenue,
        week_fuel: weekFuel,
        week_loads: parseInt(weekTotalsQ.rows[0]?.total_loads) || 0,
        week_miles: parseFloat(weekTotalsQ.rows[0]?.total_miles) || 0,
        active_loads: activeLoadsQ.rows.length,
        net_after_fuel: Math.round((weekRevenue - weekFuel) * 100) / 100,
      },
      active_loads: activeLoadsQ.rows,
      week_loads: weekLoadsQ.rows,
      by_truck: revenueByTruckQ.rows.map(row => ({
        ...row,
        gross_revenue: parseFloat(row.gross_revenue),
        load_count: parseInt(row.load_count),
        fuel_cost: fuelMap[row.truck_id]?.total_fuel || 0,
        net_after_fuel: Math.round((parseFloat(row.gross_revenue) - (fuelMap[row.truck_id]?.total_fuel || 0)) * 100) / 100,
      })),
      truck_status: truckStatusQ.rows,
      pending_settlements: pendingSettlementsQ.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/live-stats/fuel-breakdown?truck_id=&start=&end= ─────────────
router.get('/fuel-breakdown', async (req, res) => {
  try {
    const { truck_id, start, end } = req.query;
    const { weekStartStr, weekEndStr } = getWeekBounds();
    const startDate = start || weekStartStr;
    const endDate = end || weekEndStr;

    const params = [startDate, endDate];
    let truckFilter = '';
    if (truck_id) {
      params.push(truck_id);
      truckFilter = `AND fp.truck_id = $${params.length}`;
    }

    const rows = await db.query(
      `SELECT fp.id, fp.purchase_date, fp.location, fp.gallons, fp.price_per_gallon,
              fp.total_cost, fp.fuel_type, fp.notes,
              t.unit_number, t.make, t.model
       FROM fuel_purchases fp
       LEFT JOIN trucks t ON t.id = fp.truck_id
       WHERE fp.purchase_date >= $1 AND fp.purchase_date <= $2
         ${truckFilter}
       ORDER BY fp.purchase_date DESC, t.unit_number`,
      params
    );

    // Totals per truck
    const totals = await db.query(
      `SELECT fp.truck_id, t.unit_number,
              COALESCE(SUM(fp.total_cost), 0) as total_cost,
              COALESCE(SUM(fp.gallons), 0) as total_gallons,
              COUNT(*) as purchases
       FROM fuel_purchases fp
       LEFT JOIN trucks t ON t.id = fp.truck_id
       WHERE fp.purchase_date >= $1 AND fp.purchase_date <= $2
         ${truckFilter}
       GROUP BY fp.truck_id, t.unit_number
       ORDER BY total_cost DESC`,
      params
    );

    res.json({ purchases: rows.rows, totals: totals.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/live-stats/loads-breakdown?truck_id=&start=&end= ────────────
router.get('/loads-breakdown', async (req, res) => {
  try {
    const { truck_id, status, start, end } = req.query;
    const { weekStartStr, weekEndStr } = getWeekBounds();
    const startDate = start || weekStartStr;
    const endDate = end || weekEndStr;

    const params = [startDate, endDate];
    const filters = [];
    if (truck_id) { params.push(truck_id); filters.push(`l.truck_id = $${params.length}`); }
    if (status) { params.push(status); filters.push(`l.status = $${params.length}`); }
    const where = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const rows = await db.query(
      `SELECT l.id, l.load_number, l.status, l.rate, l.miles,
              l.pickup_date, l.pickup_time, l.delivery_date, l.delivery_time,
              l.origin_city, l.origin_state, l.destination_city, l.destination_state,
              l.commodity, l.weight,
              t.unit_number as truck_unit, t.make, t.model,
              d.first_name as driver_first, d.last_name as driver_last, d.phone as driver_phone,
              c.name as customer_name
       FROM loads l
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       LEFT JOIN customers c ON c.id = l.customer_id
       WHERE (l.delivery_date >= $1 AND l.delivery_date <= $2
              OR (l.delivery_date IS NULL AND l.pickup_date >= $1 AND l.pickup_date <= $2))
         ${where}
       ORDER BY l.delivery_date DESC NULLS LAST, l.pickup_date DESC`,
      params
    );

    res.json({ loads: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/live-stats/auto-deliver ────────────────────────────────────
// Manually trigger auto-delivery check
router.post('/auto-deliver', async (req, res) => {
  try {
    const count = await autoMarkDelivered();
    res.json({ updated: count, message: `${count} load(s) auto-marked as delivered` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
