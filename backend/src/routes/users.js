const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All user routes require auth
router.use(authenticate);

// GET /api/users — admin only
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — admin only
router.post('/', requireAdmin, async (req, res) => {
  const { email, password, full_name, role } = req.body;
  if (!email || !password || !full_name) return res.status(400).json({ error: 'email, password, and full_name required' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id, email, full_name, role',
      [email.toLowerCase().trim(), hash, full_name, role || 'staff']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id — admin only
router.put('/:id', requireAdmin, async (req, res) => {
  const { email, full_name, role, is_active, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await db.query(
        'UPDATE users SET email=$1, full_name=$2, role=$3, is_active=$4, password_hash=$5, updated_at=NOW() WHERE id=$6',
        [email, full_name, role, is_active, hash, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE users SET email=$1, full_name=$2, role=$3, is_active=$4, updated_at=NOW() WHERE id=$5',
        [email, full_name, role, is_active, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — admin only (soft delete)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    await db.query('UPDATE users SET is_active=FALSE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/me/password — change own password
router.put('/me/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
