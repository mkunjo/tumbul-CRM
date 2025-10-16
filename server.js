// Main Express application server

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');
const { healthCheck, shutdown } = require('./config/database');


// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// Security Middleware
// =============================================

// Helmet for security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// =============================================
// Basic Middleware
// =============================================

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Passport initialization
app.use(passport.initialize());

// =============================================
// Rate Limiting
// =============================================

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiter (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 login attempts per 15 minutes
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later.',
});

// Apply to all routes
app.use('/api/', generalLimiter);

// =============================================
// Request Logger Middleware
// =============================================

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

// =============================================
// Health Check Routes
// =============================================

app.get('/health', async (req, res) => {
  const dbHealthy = await healthCheck();
  
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealthy ? 'connected' : 'disconnected'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Contractor CRM API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      clients: '/api/clients',
      projects: '/api/projects',
      invoices: '/api/invoices',
      portal: '/api/portal'
    }
  });
});

// =============================================
// API Routes
// =============================================

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const projectRoutes = require('./routes/projects');
const invoiceRoutes = require('./routes/invoices');
const expenseRoutes = require('./routes/expenses');
const timeEntryRoutes = require('./routes/timeEntries');
const dashboardRoutes = require('./routes/dashboard');
const portalRoutes = require('./routes/portal');

// Mount routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/portal', portalRoutes); // Public routes

// =============================================
// Error Handling Middleware
// =============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.errors
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token'
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred processing your request'
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// =============================================
// Graceful Shutdown
// =============================================
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received: Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✓ HTTP server closed - no longer accepting connections');
    
    try {
      // Close database connections using the new shutdown method
      const dbClosed = await shutdown();
      
      if (dbClosed) {
        console.log('✓ Database connections closed successfully');
        console.log('✓ Graceful shutdown complete');
        process.exit(0);
      } else {
        console.error('✗ Database shutdown encountered errors');
        process.exit(1);
      }
    } catch (error) {
      console.error('✗ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('⚠ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// =============================================
// Start Server
// =============================================

const server = app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
});

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  gracefulShutdown();
});

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;