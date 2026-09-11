const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM company_settings LIMIT 1');
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — admin only
router.put('/', requireAdmin, async (req, res) => {
  const { company_name, mc_number, dot_number, address_line1, address_line2, city, state, zip, phone, email, ifta_license, base_state } = req.body;
  try {
    const existing = await db.query('SELECT id FROM company_settings LIMIT 1');
    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO company_settings (company_name, mc_number, dot_number, address_line1, address_line2, city, state, zip, phone, email, ifta_license, base_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [company_name, mc_number, dot_number, address_line1, address_line2, city, state, zip, phone, email, ifta_license, base_state || 'OH']
      );
    } else {
      await db.query(
        `UPDATE company_settings SET company_name=$1, mc_number=$2, dot_number=$3, address_line1=$4,
         address_line2=$5, city=$6, state=$7, zip=$8, phone=$9, email=$10, ifta_license=$11, base_state=$12, updated_at=NOW()
         WHERE id=$13`,
        [company_name, mc_number, dot_number, address_line1, address_line2, city, state, zip, phone, email, ifta_license, base_state || 'OH', existing.rows[0].id]
      );
    }
    const result = await db.query('SELECT * FROM company_settings LIMIT 1');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
