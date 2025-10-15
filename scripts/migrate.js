// Simple migration runner for database setup

const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

// Migration tracking table
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    executed_at TIMESTAMP DEFAULT NOW()
  );
`;

/**
 * Get list of executed migrations
 */
async function getExecutedMigrations() {
  const result = await pool.query(
    'SELECT name FROM migrations ORDER BY id'
  );
  return result.rows.map(row => row.name);
}

/**
 * Mark migration as executed
 */
async function recordMigration(name) {
  await pool.query(
    'INSERT INTO migrations (name) VALUES ($1)',
    [name]
  );
}

/**
 * Run a single migration file
 */
async function runMigration(filePath, name) {
  console.log(`Running migration: ${name}`);
  
  const sql = fs.readFileSync(filePath, 'utf8');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await recordMigration(name);
    await client.query('COMMIT');
    console.log(`✓ Migration completed: ${name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Migration failed: ${name}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Main migration runner
 */
async function migrate() {
  try {
    // Create migrations tracking table
    await pool.query(MIGRATIONS_TABLE);
    
    // Get already executed migrations
    const executed = await getExecutedMigrations();
    
    // Read migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    // Run pending migrations
    for (const file of files) {
      if (!executed.includes(file)) {
        const filePath = path.join(migrationsDir, file);
        await runMigration(filePath, file);
      } else {
        console.log(`⊘ Skipping already executed: ${file}`);
      }
    }
    
    console.log('\n✓ All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Rollback last migration (basic implementation)
 */
async function rollback() {
  try {
    const result = await pool.query(
      'SELECT name FROM migrations ORDER BY id DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      console.log('No migrations to rollback');
      return;
    }
    
    const lastMigration = result.rows[0].name;
    console.log(`Rolling back: ${lastMigration}`);
    
    // Look for corresponding rollback file
    const rollbackFile = lastMigration.replace('.sql', '.rollback.sql');
    const rollbackPath = path.join(__dirname, '../migrations', rollbackFile);
    
    if (fs.existsSync(rollbackPath)) {
      const sql = fs.readFileSync(rollbackPath, 'utf8');
      await pool.query(sql);
      await pool.query('DELETE FROM migrations WHERE name = $1', [lastMigration]);
      console.log(`✓ Rollback completed: ${lastMigration}`);
    } else {
      console.error(`✗ Rollback file not found: ${rollbackFile}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Rollback failed:', error);
    process.exit(1);
  }
}

/**
 * Reset database (drop all tables)
 */
async function reset() {
  const confirm = process.argv.includes('--confirm');
  
  if (!confirm) {
    console.log('⚠️  This will DELETE ALL DATA. Run with --confirm to proceed.');
    process.exit(0);
  }
  
  try {
    console.log('Dropping all tables...');
    
    const dropSQL = `
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `;
    
    await pool.query(dropSQL);
    console.log('✓ Database reset completed');
    process.exit(0);
  } catch (error) {
    console.error('✗ Reset failed:', error);
    process.exit(1);
  }
}

/**
 * Show migration status
 */
async function status() {
  try {
    await pool.query(MIGRATIONS_TABLE);
    
    const executed = await getExecutedMigrations();
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.includes('.rollback.'))
      .sort();
    
    console.log('\nMigration Status:');
    console.log('='.repeat(60));
    
    files.forEach(file => {
      const status = executed.includes(file) ? '✓ Executed' : '⊘ Pending';
      console.log(`${status}\t${file}`);
    });
    
    console.log('='.repeat(60));
    console.log(`Total: ${files.length} | Executed: ${executed.length} | Pending: ${files.length - executed.length}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Status check failed:', error);
    process.exit(1);
  }
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'up':
    migrate();
    break;
  case 'down':
    rollback();
    break;
  case 'reset':
    reset();
    break;
  case 'status':
    status();
    break;
  default:
    console.log(`
Database Migration Tool

Usage:
  npm run migrate:up      - Run all pending migrations
  npm run migrate:down    - Rollback last migration
  npm run migrate:status  - Show migration status
  npm run migrate:reset   - Reset database (requires --confirm)

Examples:
  node scripts/migrate.js up
  node scripts/migrate.js down
  node scripts/migrate.js reset --confirm
    `);
    process.exit(0);
}