// Sync sequence with existing invoices
require('dotenv').config();
const { pool } = require('../config/database');

async function syncSequence() {
  try {
    console.log('Syncing invoice_number_seq with existing invoices...\n');

    // Get the highest sequence number from existing invoices
    const result = await pool.query(`
      SELECT COALESCE(MAX(
        CAST(SPLIT_PART(invoice_number, '-', 3) AS INTEGER)
      ), 0) as max_seq
      FROM invoices
    `);

    const maxSeq = result.rows[0].max_seq;
    console.log(`✅ Highest existing sequence: ${maxSeq}`);

    // Set sequence to start after the highest existing number
    const newValue = maxSeq + 1;
    await pool.query(`SELECT setval('invoice_number_seq', $1, false)`, [newValue]);

    console.log(`✅ Sequence set to: ${newValue}`);

    // Verify
    const verify = await pool.query('SELECT last_value, is_called FROM invoice_number_seq');
    console.log('✅ Verification:', verify.rows[0]);

    await pool.end();
    console.log('\n✅ Sequence synced successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

syncSequence();
