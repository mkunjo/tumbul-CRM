// Create invoice number sequence
require('dotenv').config();
const { pool } = require('../config/database');

async function createSequence() {
  try {
    console.log('Creating invoice_number_seq...\n');

    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
        START WITH 1
        INCREMENT BY 1
        NO MAXVALUE
        NO CYCLE
        CACHE 10
    `);

    console.log('✅ Sequence created');

    // Verify
    const result = await pool.query('SELECT last_value FROM invoice_number_seq');
    console.log('✅ Current value:', result.rows[0].last_value);

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

createSequence();
