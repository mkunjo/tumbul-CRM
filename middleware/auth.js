// JWT authentication and authorization middleware (refactored)
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Centralized plan limits (can move to /config/limits.js)
const PLAN_LIMITS = {
  free: {
    projects: parseInt(process.env.FREE_PROJECT_LIMIT || 3, 10),
    clients: parseInt(process.env.FREE_CLIENT_LIMIT || 5, 10),
    photos: parseInt(process.env.FREE_PHOTOS_LIMIT || 50, 10)
  },
  basic: {
    projects: parseInt(process.env.BASIC_PROJECT_LIMIT || 25, 10),
    clients: parseInt(process.env.BASIC_CLIENT_LIMIT || 50, 10),
    photos: parseInt(process.env.BASIC_PHOTOS_LIMIT || 500, 10)
  },
  pro: {
    projects: -1,
    clients: -1,
    photos: -1
  }
};

// ------------------------------------
// Shared helper functions
// ------------------------------------

/** Unified JSON error response */
const respondError = (res, status, error, message, extras = {}) =>
  res.status(status).json({ error, message, ...extras });

/** Fetch tenant record by ID */
const getTenantById = async (tenantId) => {
  const { rows } = await query(
    `SELECT id, email, company_name, subscription_plan, is_active
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return rows[0];
};

/** Get current resource usage for tenant */
const getUsageCount = async (tenantId, type) => {
  const queries = {
    projects: 'SELECT COUNT(*) FROM projects WHERE tenant_id = $1',
    clients: 'SELECT COUNT(*) FROM clients WHERE tenant_id = $1',
    photos: `
      SELECT COUNT(*) FROM photos ph
      JOIN projects p ON ph.project_id = p.id
      WHERE p.tenant_id = $1 
        AND DATE_TRUNC('month', ph.uploaded_at) = DATE_TRUNC('month', NOW())`
  };

  const { rows } = await query(queries[type], [tenantId]);
  return parseInt(rows[0].count, 10);
};

// ------------------------------------
// Middleware functions
// ------------------------------------

/**
 * Verify JWT token and attach tenant to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return respondError(res, 401, 'Authentication required', 'No token provided');
    }

    const token = authHeader.substring(7);
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        audience: process.env.JWT_AUDIENCE || 'your-api',
        issuer: process.env.JWT_ISSUER || 'auth-service'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return respondError(res, 401, 'Token expired', 'Please refresh your token');
      }
      return respondError(res, 401, 'Invalid token', 'Token verification failed');
    }

    if (!decoded?.id) {
      return respondError(res, 401, 'Invalid token payload', 'Missing tenant ID');
    }

    const tenant = await getTenantById(decoded.id);

    if (!tenant) {
      return respondError(res, 401, 'User not found', 'Invalid token');
    }

    if (!tenant.is_active) {
      return respondError(res, 403, 'Account disabled', 'Your account has been disabled');
    }

    req.tenant = {
      id: tenant.id,
      email: tenant.email,
      companyName: tenant.company_name,
      plan: tenant.subscription_plan
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return respondError(res, 500, 'Authentication failed', 'Internal server error');
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) return next();

    const tenant = await getTenantById(decoded.id);
    if (!tenant?.is_active) return next();

    req.tenant = {
      id: tenant.id,
      email: tenant.email,
      companyName: tenant.company_name,
      plan: tenant.subscription_plan
    };
  } catch (error) {
    // Fail silently, only log in non-production
    if (process.env.NODE_ENV !== 'production') {
      console.debug('Optional auth failed:', error.message);
    }
  }

  next();
};

//Check if tenant has required subscription plan
const requirePlan = (...allowedPlans) => {
  return (req, res, next) => {
    if (!req.tenant) {
      return respondError(res, 401, 'Authentication required');
    }

    if (!allowedPlans.includes(req.tenant.plan)) {
      return respondError(res, 403, 'Insufficient plan', `This feature requires ${allowedPlans.join(' or ')} plan`, {
        requiredPlans: allowedPlans,
        currentPlan: req.tenant.plan
      });
    }

    next();
  };
};

// Check usage limits based on subscription plan
const checkUsageLimit = (resourceType) => {
  return async (req, res, next) => {
    if (!req.tenant) {
      return respondError(res, 401, 'Authentication required');
    }

    const { id: tenantId, plan } = req.tenant;
    const limit = PLAN_LIMITS[plan]?.[resourceType];

    if (limit === undefined) {
      return respondError(res, 400, 'Invalid resource type', `Unknown resource: ${resourceType}`);
    }

    // Unlimited (-1)
    if (limit === -1) return next();

    try {
      const currentCount = await getUsageCount(tenantId, resourceType);

      if (currentCount >= limit) {
        return respondError(res, 403, 'Usage limit reached',
          `You have reached your ${resourceType} limit for the ${plan} plan`, {
            limit,
            current: currentCount,
            upgradeRequired: true
          });
      }

      req.usageInfo = {
        limit,
        current: currentCount,
        remaining: limit - currentCount
      };

      next();
    } catch (error) {
      console.error('Usage check error:', error);
      return respondError(res, 500, 'Failed to check usage limits', error.message);
    }
  };
};

//Rate limiting based on plan
const planBasedRateLimit = (req, res, next) => {
  // Placeholder to implement with express-rate-limit;
  // Different limits per plan will be configured in the main app;
  next();
};

// ------------------------------------
// Exports
// ------------------------------------
module.exports = {
  authenticate,
  optionalAuth,
  requirePlan,
  checkUsageLimit,
  planBasedRateLimit
};
