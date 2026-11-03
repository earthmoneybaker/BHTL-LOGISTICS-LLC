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
    ssl: { rejectUnauthorized: false },
  });
  console.log('🔗 Connected to Vercel Postgres (scoped TLS)');
} else {
  const dbPath = path.join(__dirname, '../bhtl_db');
  db = new PGlite(dbPath);
  console.log('🔗 Connected to Local PGlite');
}

/**
 * Convert JS Date objects to "YYYY-MM-DD" strings.
 * The pg driver maps PostgreSQL DATE columns to JS Date objects at UTC midnight.
 * In timezones east of UTC (e.g. +03:00) this causes dates to display one day behind.
 * We detect Date values and return the UTC date string to match exactly what was stored.
 */
function fixDates(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || typeof row !== 'object') return row;
    const fixed = { ...row };
    for (const key of Object.keys(fixed)) {
      const val = fixed[key];
      if (val instanceof Date) {
        // Use UTC methods to get the stored date, not the local-timezone date
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        // If time is midnight UTC, it's a DATE column — return YYYY-MM-DD string
        if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0) {
          fixed[key] = `${y}-${m}-${d}`;
        }
        // Otherwise it's a TIMESTAMP — keep as ISO string
        else {
          fixed[key] = val.toISOString();
        }
      }
    }
    return fixed;
  });
}

module.exports = {
  query: async (text, params) => {
    try {
      const result = await db.query(text, params);
      if (result && result.rows) {
        result.rows = fixDates(result.rows);
      }
      return result;
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
