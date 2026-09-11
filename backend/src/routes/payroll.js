const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// Calculate gross pay for a driver based on pay type and loads
async function calculateDriverPay(driver_id, period_start, period_end) {
  const driverQ = await db.query('SELECT pay_type, pay_rate FROM drivers WHERE id=$1', [driver_id]);
  const driver = driverQ.rows[0];
  if (!driver) return { gross_pay: 0, loads: [], pay_type: null, pay_rate: null };

  const loadsQ = await db.query(
    `SELECT id, load_number, rate, miles, status FROM loads
     WHERE driver_id=$1 AND status IN ('delivered','invoiced','paid')
     AND delivery_date >= $2 AND delivery_date <= $3`,
    [driver_id, period_start, period_end]
  );
  const loads = loadsQ.rows;

  let gross_pay = 0;
  const load_items = [];

  if (driver.pay_type === 'per_mile') {
    const rate = parseFloat(driver.pay_rate) || 0;
    for (const load of loads) {
      const miles = parseFloat(load.miles) || 0;
      const pay = miles * rate;
      gross_pay += pay;
      load_items.push({ load_id: load.id, miles, rate_amount: rate, driver_pay: pay });
    }
  } else if (driver.pay_type === 'percentage') {
    const pct = (parseFloat(driver.pay_rate) || 0) / 100;
    for (const load of loads) {
      const rate_amt = parseFloat(load.rate) || 0;
      const pay = rate_amt * pct;
      gross_pay += pay;
      load_items.push({ load_id: load.id, miles: load.miles, rate_amount: rate_amt, driver_pay: pay });
    }
  } else if (driver.pay_type === 'hourly') {
    // Hourly: stored separately, return 0 with note
    gross_pay = 0;
  } else if (driver.pay_type === 'salary') {
    // Salary: pay_rate is per period (e.g., bi-weekly salary)
    gross_pay = parseFloat(driver.pay_rate) || 0;
  }

  return { gross_pay, loads: load_items, pay_type: driver.pay_type, pay_rate: driver.pay_rate };
}

// GET /api/payroll
router.get('/', async (req, res) => {
  try {
    const { person_type, driver_id, status, period_start, period_end } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (person_type) { params.push(person_type); conditions.push(`pr.person_type = $${params.length}`); }
    if (driver_id) { params.push(driver_id); conditions.push(`pr.driver_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`pr.status = $${params.length}`); }
    if (period_start) { params.push(period_start); conditions.push(`pr.period_start >= $${params.length}`); }
    if (period_end) { params.push(period_end); conditions.push(`pr.period_end <= $${params.length}`); }

    const result = await db.query(
      `SELECT pr.*,
        d.first_name, d.last_name,
        u.full_name as staff_name
       FROM payroll_records pr
       LEFT JOIN drivers d ON d.id=pr.driver_id
       LEFT JOIN users u ON u.id=pr.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pr.period_start DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payroll/calculate — preview calculation before saving
router.post('/calculate', async (req, res) => {
  const { driver_id, period_start, period_end } = req.body;
  try {
    const calc = await calculateDriverPay(driver_id, period_start, period_end);
    res.json(calc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payroll
router.post('/', async (req, res) => {
  const {
    driver_id, user_id, person_type, period_start, period_end,
    gross_pay, deductions, deduction_notes, net_pay, notes, status,
    load_items
  } = req.body;

  try {
    const driverQ = driver_id
      ? await db.query('SELECT pay_type, pay_rate FROM drivers WHERE id=$1', [driver_id])
      : { rows: [{ pay_type: null, pay_rate: null }] };
    const driver = driverQ.rows[0];

    const calc_net = net_pay !== undefined ? net_pay : (parseFloat(gross_pay) - parseFloat(deductions || 0));
    const person_id = driver_id || user_id;

    const result = await db.query(
      `INSERT INTO payroll_records (person_id, person_type, driver_id, user_id, period_start, period_end,
       pay_type, pay_rate, gross_pay, deductions, deduction_notes, net_pay, notes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [person_id, person_type || 'driver', driver_id || null, user_id || null,
       period_start, period_end, driver.pay_type, driver.pay_rate,
       gross_pay, deductions || 0, deduction_notes, calc_net, notes, status || 'draft', req.user.id]
    );

    const payroll_id = result.rows[0].id;

    // Save load line items
    if (load_items && load_items.length > 0) {
      for (const item of load_items) {
        await db.query(
          'INSERT INTO payroll_load_items (payroll_id, load_id, miles, rate_amount, driver_pay) VALUES ($1,$2,$3,$4,$5)',
          [payroll_id, item.load_id, item.miles, item.rate_amount, item.driver_pay]
        );
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/payroll/:id
router.put('/:id', async (req, res) => {
  const { gross_pay, deductions, deduction_notes, net_pay, notes, status } = req.body;
  try {
    const calc_net = net_pay !== undefined ? net_pay : (parseFloat(gross_pay) - parseFloat(deductions || 0));
    const result = await db.query(
      `UPDATE payroll_records SET gross_pay=$1, deductions=$2, deduction_notes=$3, net_pay=$4, notes=$5, status=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [gross_pay, deductions || 0, deduction_notes, calc_net, notes, status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/payroll/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM payroll_load_items WHERE payroll_id=$1', [req.params.id]);
    await db.query('DELETE FROM payroll_records WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
