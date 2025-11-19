// Cleanup old test data
require('dotenv').config();
const { pool } = require('../config/database');

async function cleanupTestData() {
  try {
    console.log('🧹 Cleaning up old test data...\n');

    // Delete test tenants (cascades to all related data)
    const result = await pool.query(`
      DELETE FROM tenants
      WHERE email LIKE 'status-test%' OR email LIKE '%@test.com'
      RETURNING email
    `);

    if (result.rows.length > 0) {
      console.log(`✅ Deleted ${result.rows.length} test tenant(s):`);
      result.rows.forEach(row => console.log(`   - ${row.email}`));
    } else {
      console.log('✅ No test data found to clean up');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

cleanupTestData();
