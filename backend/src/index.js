require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();

// Middleware
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Convert empty strings ("") to null across all requests,
// so optional numeric/date fields don't break database inserts.
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (obj[key] === '') {
        obj[key] = null;
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
  };
  sanitize(req.body);
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/trucks', require('./routes/trucks'));
app.use('/api/trailers', require('./routes/trailers'));
app.use('/api/loads', require('./routes/loads'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/pnl', require('./routes/pnl'));
app.use('/api/fuel', require('./routes/fuel'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/import', require('./routes/import'));
app.use('/api/extract', require('./routes/extract'));
app.use('/api/other-revenue', require('./routes/otherRevenue'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message && err.message.includes('File type not allowed')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize DB and seed admin user
async function initDb() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await db.exec(schema);
    console.log('✅ Database schema applied');

    // Seed default admin if no users exist
    const userCheck = await db.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCheck.rows[0].count) === 0) {
      const hash = await bcrypt.hash('Admin1234!', 12);
      await db.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4)`,
        ['admin@bhtllogistics.com', hash, 'Admin User', 'admin']
      );
      console.log('✅ Default admin user created: admin@bhtllogistics.com / Admin1234!');
    }
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

const PORT = process.env.PORT || 5000;

if (require.main === module || !process.env.VERCEL) {
  initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`🚛 BHTL Logistics API running on port ${PORT}`);
    });
  });
} else {
  // Wait for DB init, but don't block export (Serverless might initialize on first request)
  initDb();
}

module.exports = app;
