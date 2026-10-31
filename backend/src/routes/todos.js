const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ── GET /api/todos ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { is_completed, category, due_date } = req.query;
    const conditions = ['user_id = $1'];
    const params = [req.user.id];

    if (is_completed !== undefined) {
      params.push(is_completed === 'true');
      conditions.push(`is_completed = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (due_date) {
      params.push(due_date);
      conditions.push(`due_date = $${params.length}`);
    }

    const result = await db.query(
      `SELECT t.*,
              tk.unit_number as truck_unit,
              d.first_name as driver_first, d.last_name as driver_last
       FROM todos t
       LEFT JOIN trucks tk ON tk.id = t.related_truck_id
       LEFT JOIN drivers d ON d.id = t.related_driver_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE WHEN is_completed THEN 1 ELSE 0 END,
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END,
         due_date ASC NULLS LAST,
         created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/todos/upcoming — alerts for next 3 days ─────────────────
router.get('/upcoming', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*,
              tk.unit_number as truck_unit,
              d.first_name as driver_first, d.last_name as driver_last
       FROM todos t
       LEFT JOIN trucks tk ON tk.id = t.related_truck_id
       LEFT JOIN drivers d ON d.id = t.related_driver_id
       WHERE t.user_id = $1
         AND t.is_completed = FALSE
         AND t.due_date <= CURRENT_DATE + INTERVAL '3 days'
         AND t.due_date >= CURRENT_DATE
       ORDER BY t.due_date ASC, t.priority DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/todos ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    title, description, due_date, due_time, priority, category,
    is_recurring, recurrence, related_truck_id, related_driver_id,
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    const result = await db.query(
      `INSERT INTO todos
        (user_id, title, description, due_date, due_time, priority, category,
         is_recurring, recurrence, related_truck_id, related_driver_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.id, title, description, due_date || null, due_time || null,
       priority || 'medium', category || 'general',
       is_recurring || false, recurrence || null,
       related_truck_id || null, related_driver_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/todos/reminders ──────────────────────────────────────────
router.get('/reminders', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM reminder_settings WHERE user_id=$1 ORDER BY reminder_type`,
      [req.user.id]
    );

    // If no settings exist, seed defaults
    if (result.rows.length === 0) {
      const defaults = [
        { type: 'weekly_report', label: 'Weekly Report Due (Monday)', days_before: 1 },
        { type: 'driver_settlement', label: 'Driver Settlement Reminder', days_before: 1 },
        { type: 'cdl_expiration', label: 'CDL Expiration Alert', days_before: 30 },
        { type: 'medical_card', label: 'Medical Card Expiration', days_before: 30 },
        { type: 'insurance_renewal', label: 'Insurance Renewal Reminder', days_before: 30 },
        { type: 'dot_inspection', label: 'DOT Inspection Due', days_before: 14 },
        { type: 'registration', label: 'Registration Expiration', days_before: 30 },
        { type: 'fuel_report', label: 'Weekly Fuel Report', days_before: 0 },
        { type: 'monthly_expenses', label: 'Monthly Expense Review', days_before: 3 },
      ];
      for (const d of defaults) {
        await db.query(
          `INSERT INTO reminder_settings (user_id, reminder_type, label, days_before)
           VALUES ($1,$2,$3,$4)`,
          [req.user.id, d.type, d.label, d.days_before]
        );
      }
      const seeded = await db.query(
        `SELECT * FROM reminder_settings WHERE user_id=$1 ORDER BY reminder_type`,
        [req.user.id]
      );
      return res.json(seeded.rows);
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/todos/reminders/:id ──────────────────────────────────────
router.put('/reminders/:id', async (req, res) => {
  const { is_enabled, days_before, label } = req.body;
  try {
    const result = await db.query(
      `UPDATE reminder_settings SET is_enabled=$1, days_before=$2, label=$3
       WHERE id=$4 AND user_id=$5 RETURNING *`,
      [is_enabled !== false, days_before ?? 1, label, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/todos/reminders ─────────────────────────────────────────
router.post('/reminders', async (req, res) => {
  const { reminder_type, label, is_enabled, days_before } = req.body;
  if (!reminder_type || !label) return res.status(400).json({ error: 'reminder_type and label required' });
  try {
    const result = await db.query(
      `INSERT INTO reminder_settings (user_id, reminder_type, label, is_enabled, days_before)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, reminder_type, label, is_enabled !== false, days_before ?? 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/todos/reminders/:id ──────────────────────────────────
router.delete('/reminders/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM reminder_settings WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const {
    title, description, due_date, due_time, priority, category,
    is_recurring, recurrence, related_truck_id, related_driver_id,
  } = req.body;

  try {
    const result = await db.query(
      `UPDATE todos SET
         title=$1, description=$2, due_date=$3, due_time=$4, priority=$5,
         category=$6, is_recurring=$7, recurrence=$8,
         related_truck_id=$9, related_driver_id=$10, updated_at=NOW()
       WHERE id=$11 AND user_id=$12 RETURNING *`,
      [title, description, due_date || null, due_time || null, priority || 'medium',
       category || 'general', is_recurring || false, recurrence || null,
       related_truck_id || null, related_driver_id || null,
       req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/todos/:id/complete ────────────────────────────────────
router.patch('/:id/complete', async (req, res) => {
  const { is_completed } = req.body;
  try {
    const result = await db.query(
      `UPDATE todos SET
         is_completed=$1,
         completed_at=CASE WHEN $1=TRUE THEN NOW() ELSE NULL END,
         updated_at=NOW()
       WHERE id=$2 AND user_id=$3 RETURNING *`,
      [is_completed !== false, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/todos/:id ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM todos WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
