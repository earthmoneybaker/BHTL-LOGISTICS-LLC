const express = require('express');
const router = express.Router();
const db = require('../db');
const upload = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/documents — list documents by entity type/id
router.get('/', async (req, res) => {
  try {
    const { entity_type, entity_id, doc_type, expiring_in_days, expiring_days } = req.query;
    const days = expiring_in_days || expiring_days;
    const conditions = ['1=1'];
    const params = [];

    if (entity_type) {
      params.push(entity_type);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (entity_id) {
      params.push(entity_id);
      conditions.push(`entity_id = $${params.length}`);
    }
    if (doc_type) {
      params.push(doc_type);
      conditions.push(`doc_type = $${params.length}`);
    }
    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + parseInt(days));
      params.push(cutoff.toISOString().split('T')[0]);
      conditions.push(`expiration_date <= $${params.length} AND expiration_date IS NOT NULL`);
    }

    const result = await db.query(
      `SELECT id, entity_type, entity_id, doc_type, file_name, file_mime, expiration_date, notes, created_at
       FROM documents WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents — upload a document
router.post('/', upload.single('file'), async (req, res) => {
  const { entity_type, entity_id, doc_type, expiration_date, notes } = req.body;
  if (!entity_type || !doc_type) return res.status(400).json({ error: 'entity_type and doc_type required' });

  try {
    const fileData = req.file ? req.file.buffer : null;
    const fileName = req.file ? req.file.originalname : null;
    const fileMime = req.file ? req.file.mimetype : null;

    const result = await db.query(
      `INSERT INTO documents (entity_type, entity_id, doc_type, file_name, file_data, file_mime, expiration_date, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, entity_type, entity_id, doc_type, file_name, file_mime, expiration_date, notes, created_at`,
      [entity_type, entity_id || null, doc_type, fileName, fileData, fileMime, expiration_date || null, notes, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/download — download a file
router.get('/:id/download', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_name, file_data, file_mime FROM documents WHERE id=$1',
      [req.params.id]
    );
    const doc = result.rows[0];
    if (!doc || !doc.file_data) return res.status(404).json({ error: 'File not found' });

    res.setHeader('Content-Type', doc.file_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
    res.send(doc.file_data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM documents WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/documents/:id — update metadata (not file)
router.put('/:id', async (req, res) => {
  const { expiration_date, notes, doc_type } = req.body;
  try {
    const result = await db.query(
      'UPDATE documents SET expiration_date=$1, notes=$2, doc_type=$3 WHERE id=$4 RETURNING id, doc_type, expiration_date, notes',
      [expiration_date || null, notes, doc_type, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
