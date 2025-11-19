// Run migration 003: Performance improvements
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function runMigration() {
  console.log('🚀 Running Migration 003: Performance Improvements\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '003-performance-improvements.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolons and filter out comments and empty statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip multi-line comments
      if (statement.includes('/*')) continue;

      try {
        console.log(`[${i + 1}/${statements.length}] Executing statement...`);
        await pool.query(statement);
        console.log(`✅ Success\n`);
      } catch (error) {
        // Ignore "already exists" errors
        if (error.code === '42P07' || error.code === '42710') {
          console.log(`⚠️  Already exists, skipping\n`);
        } else {
          console.error(`❌ Error:`, error.message);
          console.error(`Statement: ${statement.substring(0, 100)}...\n`);
        }
      }
    }

    // Verify sequence was created
    console.log('\n📊 Verifying sequence...');
    const seqCheck = await pool.query(`
      SELECT last_value, is_called
      FROM invoice_number_seq
    `);
    console.log('✅ Sequence exists:', seqCheck.rows[0]);

    // Verify indexes were created
    console.log('\n📊 Verifying indexes...');
    const indexCheck = await pool.query(`
      SELECT
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('invoices', 'payments', 'projects', 'clients')
      ORDER BY tablename, indexname
    `);

    console.log(`\n✅ Created ${indexCheck.rows.length} indexes:`);
    indexCheck.rows.forEach(idx => {
      console.log(`   - ${idx.tablename}.${idx.indexname} (${idx.size})`);
    });

    // Analyze tables for query planner
    console.log('\n📊 Running ANALYZE on tables...');
    await pool.query('ANALYZE invoices');
    await pool.query('ANALYZE payments');
    await pool.query('ANALYZE projects');
    await pool.query('ANALYZE clients');
    console.log('✅ ANALYZE completed');

    console.log('\n✅ Migration 003 completed successfully!\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
