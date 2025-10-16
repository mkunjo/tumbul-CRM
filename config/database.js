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

// Improved error handling - no longer kills the server
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  
  // Log detailed error information
  console.error('Error details:', {
    message: err.message,
    code: err.code,
    severity: err.severity,
    timestamp: new Date().toISOString()
  });
  
  // Send alert in production (integrate with monitoring service)
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with monitoring service
    // Example: Sentry.captureException(err);
    // Example: sendSlackAlert(err);
  }
  
  // Don't kill the server - the pool automatically handles the bad client
  // Connection will be removed from pool and new connections will be created as needed
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
    // In production, you might want to retry or alert
    if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL: Initial database connection failed - server may not function properly');
    }
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
    console.log('Pool configuration:', {
      max: poolConfig.max,
      min: poolConfig.min,
      host: poolConfig.host,
      database: poolConfig.database
    });
  }
});

// Execute query with automatic tenant isolation
// Sets the session variable for row-level security
async function queryWithTenant(tenantId, text, params) {
  const client = await pool.connect();
  try {
    // Set the tenant context for RLS
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    
    // Execute the actual query
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Execute query within a transaction
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

// Execute query within a transaction with tenant isolation
async function transactionWithTenant(tenantId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
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

// Health check for database
async function healthCheck() {
  try {
    const result = await pool.query('SELECT 1 as status');
    return result.rows[0].status === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Get pool statistics
function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  };
}

/**
 * Graceful shutdown - close all database connections
 */
async function shutdown() {
  console.log('Shutting down database pool...');
  try {
    await pool.end();
    console.log('Database pool closed successfully');
    return true;
  } catch (err) {
    console.error('Error closing database pool:', err);
    return false;
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received');
  await shutdown();
  process.exit(0);
});

// Optional: Periodic health monitoring
if (process.env.ENABLE_DB_HEALTH_MONITORING === 'true') {
  const healthCheckInterval = parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '60000', 10);
  
  setInterval(async () => {
    const isHealthy = await healthCheck();
    const stats = getPoolStats();
    
    if (!isHealthy) {
      console.error('Database health check failed!', {
        timestamp: new Date().toISOString(),
        poolStats: stats
      });
      
      // Alert monitoring system in production
      if (process.env.NODE_ENV === 'production') {
        // TODO: Send alert
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // Log stats in development for monitoring
      console.log('Database healthy. Pool stats:', stats);
    }
  }, healthCheckInterval);
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  queryWithTenant,
  transaction,
  transactionWithTenant,
  healthCheck,
  getPoolStats,
  shutdown
};