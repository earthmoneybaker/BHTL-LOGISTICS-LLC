const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/dashboard
router.get('/', async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(today.getDate() + 30);
    const ninetyDaysOut = new Date(today);
    ninetyDaysOut.setDate(today.getDate() + 90);

    const todayStr = today.toISOString().split('T')[0];
    const thirtyStr = thirtyDaysOut.toISOString().split('T')[0];
    const ninetyStr = ninetyDaysOut.toISOString().split('T')[0];

    // Load status breakdown
    const loadStatusQ = await db.query(
      `SELECT status, COUNT(*) as count FROM loads
       WHERE status NOT IN ('cancelled','paid') GROUP BY status`
    );

    // Trucks on road vs idle
    const truckStatusQ = await db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE status='in_shop') as in_shop,
        COUNT(*) FILTER (WHERE status='out_of_service') as out_of_service
       FROM trucks WHERE is_active=TRUE`
    );

    // Revenue this month vs last month (admin only)
    let revenueData = null;
    if (req.user.role === 'admin') {
      const revenueQ = await db.query(
        `SELECT
          SUM(CASE WHEN date_trunc('month', date_issued) = date_trunc('month', NOW()) THEN amount ELSE 0 END) as this_month,
          SUM(CASE WHEN date_trunc('month', date_issued) = date_trunc('month', NOW() - INTERVAL '1 month') THEN amount ELSE 0 END) as last_month
         FROM invoices WHERE status IN ('paid','unpaid','overdue')`
      );
      revenueData = revenueQ.rows[0];
    }

    // Expirations within 90 days
    const expirations = [];

    // CDL expirations
    const cdlQ = await db.query(
      `SELECT id, first_name, last_name, cdl_expiration as expiration_date, 'CDL' as doc_type, 'driver' as entity_type
       FROM drivers WHERE is_active=TRUE AND cdl_expiration IS NOT NULL AND cdl_expiration <= $1`,
      [ninetyStr]
    );
    expirations.push(...cdlQ.rows.map(r => ({ ...r, entity_name: `${r.first_name} ${r.last_name}` })));

    // Medical card expirations
    const medQ = await db.query(
      `SELECT id, first_name, last_name, medical_card_expiration as expiration_date, 'Medical Card' as doc_type, 'driver' as entity_type
       FROM drivers WHERE is_active=TRUE AND medical_card_expiration IS NOT NULL AND medical_card_expiration <= $1`,
      [ninetyStr]
    );
    expirations.push(...medQ.rows.map(r => ({ ...r, entity_name: `${r.first_name} ${r.last_name}` })));

    // Truck registration expirations
    const truckRegQ = await db.query(
      `SELECT id, unit_number, registration_expiration as expiration_date, 'Registration' as doc_type, 'truck' as entity_type
       FROM trucks WHERE is_active=TRUE AND registration_expiration IS NOT NULL AND registration_expiration <= $1`,
      [ninetyStr]
    );
    expirations.push(...truckRegQ.rows.map(r => ({ ...r, entity_name: `Truck ${r.unit_number}` })));

    // Trailer registration expirations
    const trailerRegQ = await db.query(
      `SELECT id, unit_number, registration_expiration as expiration_date, 'Registration' as doc_type, 'trailer' as entity_type
       FROM trailers WHERE is_active=TRUE AND registration_expiration IS NOT NULL AND registration_expiration <= $1`,
      [ninetyStr]
    );
    expirations.push(...trailerRegQ.rows.map(r => ({ ...r, entity_name: `Trailer ${r.unit_number}` })));

    // Document expirations
    const docExpQ = await db.query(
      `SELECT id, entity_type, entity_id, doc_type, expiration_date, file_name
       FROM documents WHERE expiration_date IS NOT NULL AND expiration_date <= $1
       ORDER BY expiration_date ASC`,
      [ninetyStr]
    );
    expirations.push(...docExpQ.rows.map(r => ({ ...r, entity_name: r.entity_type + ' document' })));

    // Sort all expirations by date
    expirations.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));

    // Recent loads
    const recentLoadsQ = await db.query(
      `SELECT l.id, l.load_number, l.status, l.rate, l.pickup_date, l.delivery_date,
              c.name as customer_name, d.first_name, d.last_name, t.unit_number as truck_unit
       FROM loads l
       LEFT JOIN customers c ON c.id = l.customer_id
       LEFT JOIN drivers d ON d.id = l.driver_id
       LEFT JOIN trucks t ON t.id = l.truck_id
       ORDER BY l.created_at DESC LIMIT 10`
    );

    // Outstanding invoices summary
    const invoiceQ = await db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status='unpaid') as unpaid_count,
        SUM(amount) FILTER (WHERE status='unpaid') as unpaid_amount,
        COUNT(*) FILTER (WHERE status='overdue') as overdue_count,
        SUM(amount) FILTER (WHERE status='overdue') as overdue_amount
       FROM invoices WHERE status IN ('unpaid','overdue')`
    );

    res.json({
      load_status: loadStatusQ.rows,
      truck_status: truckStatusQ.rows[0],
      revenue: revenueData,
      expirations,
      recent_loads: recentLoadsQ.rows,
      invoice_summary: invoiceQ.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
