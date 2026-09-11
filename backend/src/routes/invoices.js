const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const PDFDocument = require('pdfkit');

router.use(authenticate);

// Helper: generate invoice number
async function nextInvoiceNumber() {
  const result = await db.query("SELECT COUNT(*) FROM invoices");
  const num = parseInt(result.rows[0].count) + 1;
  return `INV-${new Date().getFullYear()}-${String(num).padStart(4, '0')}`;
}

// GET /api/invoices
router.get('/', async (req, res) => {
  try {
    const { status, customer_id, date_from, date_to } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (customer_id) {
      params.push(customer_id);
      conditions.push(`i.customer_id = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`i.date_issued >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`i.date_issued <= $${params.length}`);
    }

    // Auto-update overdue status
    await db.query(
      `UPDATE invoices SET status='overdue' WHERE status='unpaid' AND due_date < CURRENT_DATE`
    );

    const result = await db.query(
      `SELECT i.*,
        c.name as customer_name, c.contact_email,
        l.load_number, l.origin_city, l.destination_city,
        CURRENT_DATE - i.due_date as days_overdue
       FROM invoices i
       LEFT JOIN customers c ON c.id=i.customer_id
       LEFT JOIN loads l ON l.id=i.load_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.date_issued DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT i.*,
        c.name as customer_name, c.contact_name, c.contact_email, c.address_line1, c.city, c.state, c.zip, c.payment_terms,
        l.load_number, l.origin_city, l.origin_state, l.destination_city, l.destination_state,
        l.pickup_date, l.delivery_date, l.commodity, l.weight, l.miles, l.rate,
        cs.company_name, cs.address_line1 as co_address, cs.city as co_city, cs.state as co_state,
        cs.zip as co_zip, cs.mc_number, cs.dot_number, cs.phone as co_phone, cs.email as co_email
       FROM invoices i
       LEFT JOIN customers c ON c.id=i.customer_id
       LEFT JOIN loads l ON l.id=i.load_id
       LEFT JOIN company_settings cs ON TRUE
       WHERE i.id=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices — generate invoice from load
router.post('/', async (req, res) => {
  const { load_id, customer_id, amount, date_issued, due_date, factoring_company, factoring_notes, notes, status, paid_date, paid_amount } = req.body;
  if (!customer_id || !amount || !date_issued || !due_date) {
    return res.status(400).json({ error: 'customer_id, amount, date_issued, due_date required' });
  }
  try {
    const invoice_number = await nextInvoiceNumber();
    const finalStatus = status === 'paid' ? 'paid' : 'unpaid';
    const finalPaidDate = finalStatus === 'paid' ? (paid_date || date_issued) : null;
    const finalPaidAmount = finalStatus === 'paid' ? (paid_amount || amount) : null;
    const result = await db.query(
      `INSERT INTO invoices (invoice_number, customer_id, load_id, amount, date_issued, due_date, factoring_company, factoring_notes, notes, status, paid_date, paid_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [invoice_number, customer_id, load_id || null, amount, date_issued, due_date, factoring_company, factoring_notes, notes, finalStatus, finalPaidDate, finalPaidAmount]
    );
    // Update load status to match — invoiced normally, or paid if marked paid on creation
    if (load_id) {
      const newLoadStatus = finalStatus === 'paid' ? 'paid' : 'invoiced';
      await db.query("UPDATE loads SET status=$1, updated_at=NOW() WHERE id=$2 AND status != 'paid'", [newLoadStatus, load_id]);
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/invoices/:id
router.put('/:id', async (req, res) => {
  const { status, paid_date, paid_amount, factoring_company, factoring_notes, notes, due_date } = req.body;
  try {
    const result = await db.query(
      `UPDATE invoices SET status=$1, paid_date=$2, paid_amount=$3, factoring_company=$4,
       factoring_notes=$5, notes=$6, due_date=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [status, paid_date || null, paid_amount, factoring_company, factoring_notes, notes, due_date, req.params.id]
    );
    // Update load status to paid if invoice marked paid
    if (status === 'paid' && result.rows[0]?.load_id) {
      await db.query("UPDATE loads SET status='paid', updated_at=NOW() WHERE id=$1", [result.rows[0].load_id]);
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/:id (void)
router.delete('/:id', async (req, res) => {
  try {
    await db.query("UPDATE invoices SET status='voided', updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id/pdf — generate PDF invoice
router.get('/:id/pdf', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT i.*,
        c.name as customer_name, c.contact_name, c.contact_email, c.address_line1 as c_addr, c.city as c_city, c.state as c_state, c.zip as c_zip,
        l.load_number, l.origin_city, l.origin_state, l.destination_city, l.destination_state, l.pickup_date, l.delivery_date, l.commodity, l.miles,
        cs.company_name, cs.address_line1 as co_addr, cs.city as co_city, cs.state as co_state, cs.zip as co_zip, cs.mc_number, cs.dot_number, cs.phone as co_phone
       FROM invoices i
       LEFT JOIN customers c ON c.id=i.customer_id
       LEFT JOIN loads l ON l.id=i.load_id
       LEFT JOIN company_settings cs ON TRUE
       WHERE i.id=$1 LIMIT 1`,
      [req.params.id]
    );
    const inv = result.rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${inv.invoice_number}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text(inv.company_name || 'BHTL Logistics LLC', 50, 50);
    doc.fontSize(10).font('Helvetica').text(`MC# ${inv.mc_number || '---'}   DOT# ${inv.dot_number || '---'}`, 50, 80);
    doc.text(`${inv.co_addr || ''} ${inv.co_city || ''}, ${inv.co_state || ''} ${inv.co_zip || ''}`, 50, 95);
    doc.text(`Phone: ${inv.co_phone || '---'}`, 50, 110);

    // Invoice title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a3a6b').text('INVOICE', 400, 50);
    doc.fontSize(10).font('Helvetica').fillColor('black');
    doc.text(`Invoice #: ${inv.invoice_number}`, 400, 80);
    doc.text(`Date: ${inv.date_issued}`, 400, 95);
    doc.text(`Due: ${inv.due_date}`, 400, 110);
    doc.text(`Status: ${inv.status.toUpperCase()}`, 400, 125);

    // Divider
    doc.moveTo(50, 145).lineTo(545, 145).stroke();

    // Bill To
    doc.fontSize(11).font('Helvetica-Bold').text('BILL TO:', 50, 155);
    doc.font('Helvetica').fontSize(10);
    doc.text(inv.customer_name || '', 50, 170);
    doc.text(inv.contact_name || '', 50, 185);
    doc.text(`${inv.c_addr || ''} ${inv.c_city || ''}, ${inv.c_state || ''} ${inv.c_zip || ''}`, 50, 200);
    doc.text(inv.contact_email || '', 50, 215);

    // Load details
    if (inv.load_number) {
      doc.font('Helvetica-Bold').fontSize(11).text('LOAD DETAILS:', 300, 155);
      doc.font('Helvetica').fontSize(10);
      doc.text(`Load #: ${inv.load_number}`, 300, 170);
      doc.text(`Origin: ${inv.origin_city || ''}, ${inv.origin_state || ''}`, 300, 185);
      doc.text(`Destination: ${inv.destination_city || ''}, ${inv.destination_state || ''}`, 300, 200);
      doc.text(`Pickup: ${inv.pickup_date || ''}  Delivery: ${inv.delivery_date || ''}`, 300, 215);
      doc.text(`Commodity: ${inv.commodity || '---'}  Miles: ${inv.miles || '---'}`, 300, 230);
    }

    // Amount table
    doc.moveTo(50, 255).lineTo(545, 255).stroke();
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Description', 50, 265);
    doc.text('Amount', 450, 265);
    doc.moveTo(50, 285).lineTo(545, 285).stroke();
    doc.font('Helvetica').fontSize(10);
    doc.text(`Freight charges - ${inv.load_number || 'See load details'}`, 50, 295);
    doc.text(`$${parseFloat(inv.amount).toFixed(2)}`, 450, 295);
    doc.moveTo(50, 315).lineTo(545, 315).stroke();

    // Total
    doc.font('Helvetica-Bold').fontSize(13).text('TOTAL DUE:', 350, 330);
    doc.fontSize(16).fillColor('#1a3a6b').text(`$${parseFloat(inv.amount).toFixed(2)}`, 450, 328);

    // Notes
    if (inv.notes) {
      doc.fillColor('black').fontSize(9).font('Helvetica');
      doc.text('Notes:', 50, 380);
      doc.text(inv.notes, 50, 395, { width: 495 });
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/aging — aging report (admin only)
router.get('/report/aging', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT i.*,
        c.name as customer_name,
        CURRENT_DATE - i.due_date as days_past_due,
        CASE 
          WHEN i.status='paid' THEN 'paid'
          WHEN CURRENT_DATE - i.due_date <= 0 THEN 'current'
          WHEN CURRENT_DATE - i.due_date <= 30 THEN '1-30'
          WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
          WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90'
          ELSE '90+'
        END as aging_bucket
       FROM invoices i
       LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.status NOT IN ('voided')
       ORDER BY i.due_date ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
