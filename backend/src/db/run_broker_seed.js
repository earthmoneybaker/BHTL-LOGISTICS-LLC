// One-time script: seeds all 101 brokers into the customers table
// Run from: /backend  →  node src/db/run_broker_seed.js

require('dotenv').config({ path: __dirname + '/../../.env' });
const db = require('../db');
const fs = require('fs');
const path = require('path');

async function seed() {
  const sql = fs.readFileSync(path.join(__dirname, 'brokers_seed.sql'), 'utf8');
  console.log('🌱 Seeding brokers...');
  try {
    await db.exec(sql);
    const result = await db.query("SELECT COUNT(*) FROM customers WHERE is_active = TRUE");
    console.log(`✅ Done! Total active brokers/customers in DB: ${result.rows[0].count}`);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  }
  process.exit(0);
}

seed();
