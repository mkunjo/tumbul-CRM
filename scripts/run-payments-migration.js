// Run the payments table migration
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function runPaymentsMigration() {
  const client = await pool.connect();

  try {
    console.log('Running payments table migration...');

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '002-add-payments-table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await client.query(sql);

    // Record in migrations table
    await client.query(
      `INSERT INTO migrations (name, executed_at)
       VALUES ($1, NOW())
       ON CONFLICT (name) DO NOTHING`,
      ['002-add-payments-table.sql']
    );

    console.log('✓ Payments table migration completed successfully');
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runPaymentsMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
