// config/database.js
// PostgreSQL connection configuration with multi-tenant support

const { Pool } = require('pg');
require('dotenv').config();

// Connection pool configuration
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'crm_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  
  // Pool settings for optimal performance
  max: 20, // Maximum connections
  min: 5,  // Minimum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  
  // SSL for production
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
};

// Create the pool
const pool = new Pool(poolConfig);

// Error handling
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

/**
 * Execute query with automatic tenant isolation
 * Sets the session variable for row-level security
 */
async function queryWithTenant(tenantId, text, params) {
  const client = await pool.connect();
  try {
    // Set the tenant context for RLS
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    
    // Execute the actual query
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute query within a transaction
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute query within a transaction with tenant isolation
 */
async function transactionWithTenant(tenantId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check for database
 */
async function healthCheck() {
  try {
    const result = await pool.query('SELECT 1 as status');
    return result.rows[0].status === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Get pool statistics
 */
function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  };
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  queryWithTenant,
  transaction,
  transactionWithTenant,
  healthCheck,
  getPoolStats
};