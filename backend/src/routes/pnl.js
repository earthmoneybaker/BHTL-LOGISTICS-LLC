const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const { stringify } = require('csv-stringify/sync');

router.use(authenticate, requireAdmin);

async function computePnL(start, end) {
  const [rev, otherRev, exp, pay] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(amount),0) as total FROM invoices
       WHERE status IN ('paid','unpaid','overdue') AND date_issued >= $1 AND date_issued <= $2`,
      [start, end]
    ),
    db.query(
      `SELECT COALESCE(SUM(amount),0) as total FROM other_revenue
       WHERE revenue_date >= $1 AND revenue_date <= $2`,
      [start, end]
    ),
    db.query(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses
       WHERE expense_date >= $1 AND expense_date <= $2`,
      [start, end]
    ),
    db.query(
      `SELECT COALESCE(SUM(net_pay),0) as total FROM payroll_records
       WHERE status IN ('approved','paid') AND period_start >= $1 AND period_end <= $2`,
      [start, end]
    ),
  ]);

  const freightRevenue = parseFloat(rev.rows[0].total);
  const otherRevenue = parseFloat(otherRev.rows[0].total);
  const revenue = freightRevenue + otherRevenue;
  const expenses = parseFloat(exp.rows[0].total);
  const payroll = parseFloat(pay.rows[0].total);
  return {
    revenue,
    freight_revenue: freightRevenue,
    other_revenue: otherRevenue,
    expenses,
    payroll,
    net_profit: revenue - expenses - payroll,
  };
}

// GET /api/pnl?period_type=month&year=2025&period=1
router.get('/', async (req, res) => {
  try {
    const { period_type = 'month', year, period } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    let start, end, label;

    if (period_type === 'month') {
      const m = parseInt(period) || (new Date().getMonth() + 1);
      start = `${y}-${String(m).padStart(2,'0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      end = `${y}-${String(m).padStart(2,'0')}-${lastDay}`;
      label = `${y}-${String(m).padStart(2,'0')}`;
    } else if (period_type === 'quarter') {
      const q = parseInt(period) || Math.ceil((new Date().getMonth() + 1) / 3);
      const qStart = (q - 1) * 3 + 1;
      const qEnd = q * 3;
      start = `${y}-${String(qStart).padStart(2,'0')}-01`;
      const lastDay = new Date(y, qEnd, 0).getDate();
      end = `${y}-${String(qEnd).padStart(2,'0')}-${lastDay}`;
      label = `${y}-Q${q}`;
    } else {
      start = `${y}-01-01`;
      end = `${y}-12-31`;
      label = `${y}`;
    }

    const summary = await computePnL(start, end);

    const truckBreakdown = await db.query(
      `SELECT t.unit_number, t.id as truck_id,
        COALESCE(SUM(i.amount) FILTER (WHERE i.date_issued >= $1 AND i.date_issued <= $2), 0) as revenue,
        COALESCE(SUM(e.amount) FILTER (WHERE e.expense_date >= $1 AND e.expense_date <= $2), 0) as expenses
       FROM trucks t
       LEFT JOIN loads l ON l.truck_id=t.id
       LEFT JOIN invoices i ON i.load_id=l.id AND i.status IN ('paid','unpaid','overdue')
       LEFT JOIN expenses e ON e.truck_id=t.id
       WHERE t.is_active=TRUE
       GROUP BY t.id, t.unit_number ORDER BY revenue DESC`,
      [start, end]
    );

    const driverBreakdown = await db.query(
      `SELECT d.first_name, d.last_name, d.id as driver_id,
        COALESCE(SUM(i.amount) FILTER (WHERE i.date_issued >= $1 AND i.date_issued <= $2), 0) as revenue,
        COALESCE(SUM(pr.net_pay) FILTER (WHERE pr.period_start >= $1 AND pr.period_end <= $2 AND pr.status IN ('approved','paid')), 0) as payroll
       FROM drivers d
       LEFT JOIN loads l ON l.driver_id=d.id
       LEFT JOIN invoices i ON i.load_id=l.id AND i.status IN ('paid','unpaid','overdue')
       LEFT JOIN payroll_records pr ON pr.driver_id=d.id
       WHERE d.is_active=TRUE
       GROUP BY d.id, d.first_name, d.last_name ORDER BY revenue DESC`,
      [start, end]
    );

    const invoiceDetail = await db.query(
      `SELECT i.invoice_number, i.amount, i.date_issued, i.status, c.name as customer_name
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.status IN ('paid','unpaid','overdue') AND i.date_issued >= $1 AND i.date_issued <= $2
       ORDER BY i.date_issued`,
      [start, end]
    );

    const otherRevenueDetail = await db.query(
      `SELECT description, amount, revenue_date, notes FROM other_revenue
       WHERE revenue_date >= $1 AND revenue_date <= $2 ORDER BY revenue_date`,
      [start, end]
    );

    const expenseDetail = await db.query(
      `SELECT category, SUM(amount) as total FROM expenses
       WHERE expense_date >= $1 AND expense_date <= $2 GROUP BY category ORDER BY total DESC`,
      [start, end]
    );

    res.json({
      period_type, label, start, end,
      summary,
      truck_breakdown: truckBreakdown.rows,
      driver_breakdown: driverBreakdown.rows,
      invoice_detail: invoiceDetail.rows,
      other_revenue_detail: otherRevenueDetail.rows,
      expense_detail: expenseDetail.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/trend', async (req, res) => {
  try {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const start = `${y}-${String(m).padStart(2,'0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2,'0')}-${lastDay}`;
      const label = `${y}-${String(m).padStart(2,'0')}`;
      const data = await computePnL(start, end);
      months.push({ label, ...data });
    }
    res.json(months);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/csv', async (req, res) => {
  try {
    const { start, end, label } = req.query;
    const s = start || `${new Date().getFullYear()}-01-01`;
    const e = end || `${new Date().getFullYear()}-12-31`;

    const invoices = await db.query(
      `SELECT 'Revenue' as type, i.invoice_number as ref, c.name as entity, i.amount, i.date_issued as date
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.status IN ('paid','unpaid','overdue') AND i.date_issued >= $1 AND i.date_issued <= $2`,
      [s, e]
    );
    const otherRev = await db.query(
      `SELECT 'Other Revenue' as type, description as ref, COALESCE(notes,'') as entity, amount, revenue_date as date
       FROM other_revenue WHERE revenue_date >= $1 AND revenue_date <= $2`,
      [s, e]
    );
    const expenses = await db.query(
      `SELECT 'Expense' as type, category as ref, COALESCE(description, vendor, '') as entity, amount, expense_date as date
       FROM expenses WHERE expense_date >= $1 AND expense_date <= $2`,
      [s, e]
    );
    const payroll = await db.query(
      `SELECT 'Payroll' as type, 'Payroll' as ref,
        COALESCE(d.first_name||' '||d.last_name, u.full_name, 'Staff') as entity,
        pr.net_pay as amount, pr.period_end as date
       FROM payroll_records pr
       LEFT JOIN drivers d ON d.id=pr.driver_id
       LEFT JOIN users u ON u.id=pr.user_id
       WHERE pr.status IN ('approved','paid') AND pr.period_start >= $1 AND pr.period_end <= $2`,
      [s, e]
    );

    const rows = [...invoices.rows, ...otherRev.rows, ...expenses.rows, ...payroll.rows]
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const csv = stringify(rows, {
      header: true,
      columns: ['type', 'date', 'ref', 'entity', 'amount'],
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="PnL-${label || s}-${e}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/pdf', async (req, res) => {
  try {
    const { start, end, label } = req.query;
    const s = start || `${new Date().getFullYear()}-01-01`;
    const e = end || `${new Date().getFullYear()}-12-31`;
    const summary = await computePnL(s, e);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PnL-${label || s}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('BHTL Logistics LLC', 50, 50);
    doc.fontSize(14).text(`Profit & Loss Report — ${label || s} to ${e}`, 50, 80);
    doc.moveTo(50, 105).lineTo(545, 105).stroke();

    let y = 120;
    const row = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(12);
      doc.text(label, 50, y);
      doc.text(`$${parseFloat(value).toFixed(2)}`, 400, y);
      y += 22;
    };

    row('Freight / Load Revenue:', summary.freight_revenue);
    row('Other Business Revenue:', summary.other_revenue);
    row('Total Revenue:', summary.revenue, true);
    y += 6;
    row('Total Expenses:', summary.expenses);
    row('Total Payroll:', summary.payroll);
    doc.moveTo(50, y).lineTo(545, y).stroke(); y += 10;
    row('NET PROFIT / LOSS:', summary.net_profit, true);

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
