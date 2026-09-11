const { PGlite } = require('@electric-sql/pglite');
const { Pool } = require('pg');
const path = require('path');

let db;
let isPg = false;

if (process.env.POSTGRES_URL) {
  isPg = true;
  const dbUrl = new URL(process.env.POSTGRES_URL);
  db = new Pool({
    host: dbUrl.hostname,
    port: dbUrl.port || 5432,
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace(/^\//, ''),
    // Scoped to this connection only — encrypts traffic to the database
    // without requiring NODE_TLS_REJECT_UNAUTHORIZED globally.
    ssl: { rejectUnauthorized: false },
  });
  console.log('🔗 Connected to Vercel Postgres (scoped TLS)');
} else {
  const dbPath = path.join(__dirname, '../bhtl_db');
  db = new PGlite(dbPath);
  console.log('🔗 Connected to Local PGlite');
}

module.exports = {
  query: async (text, params) => {
    try {
      return await db.query(text, params);
    } catch (err) {
      console.error('Database query error:', err.message, '\nQuery:', text);
      throw err;
    }
  },
  exec: async (text) => {
    try {
      if (isPg) {
        return await db.query(text);
      } else {
        return await db.exec(text);
      }
    } catch (err) {
      console.error('Database exec error:', err.message);
      throw err;
    }
  },
  pool: db,
};
