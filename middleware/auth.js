// JWT authentication and authorization middleware

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

//Verify JWT token and attach tenant to request
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'No token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired',
          message: 'Please refresh your token' 
        });
      }
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token verification failed' 
      });
    }

    // Get tenant from database
    const result = await query(
      `SELECT id, email, company_name, subscription_plan, is_active
       FROM tenants WHERE id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'User not found',
        message: 'Invalid token' 
      });
    }

    const tenant = result.rows[0];

    // Check if account is active
    if (!tenant.is_active) {
      return res.status(403).json({ 
        error: 'Account disabled',
        message: 'Your account has been disabled' 
      });
    }

    // Attach tenant to request
    req.tenant = {
      id: tenant.id,
      email: tenant.email,
      companyName: tenant.company_name,
      plan: tenant.subscription_plan
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      message: 'Internal server error' 
    });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      'SELECT id, email, company_name, subscription_plan FROM tenants WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length > 0) {
      req.tenant = {
        id: result.rows[0].id,
        email: result.rows[0].email,
        companyName: result.rows[0].company_name,
        plan: result.rows[0].subscription_plan
      };
    }
  } catch (error) {
    // Silently fail for optional auth
    console.log('Optional auth failed:', error.message);
  }

  next();
};

//Check if tenant has required subscription plan
const requirePlan = (...allowedPlans) => {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    if (!allowedPlans.includes(req.tenant.plan)) {
      return res.status(403).json({ 
        error: 'Insufficient plan',
        message: `This feature requires ${allowedPlans.join(' or ')} plan`,
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
      return res.status(401).json({ error: 'Authentication required' });
    }

    const plan = req.tenant.plan;
    const tenantId = req.tenant.id;

    // Get plan limits from environment
    const limits = {
      free: {
        projects: parseInt(process.env.FREE_PROJECT_LIMIT || 3),
        clients: parseInt(process.env.FREE_CLIENT_LIMIT || 5),
        photos: parseInt(process.env.FREE_PHOTOS_LIMIT || 50)
      },
      basic: {
        projects: parseInt(process.env.BASIC_PROJECT_LIMIT || 25),
        clients: parseInt(process.env.BASIC_CLIENT_LIMIT || 50),
        photos: parseInt(process.env.BASIC_PHOTOS_LIMIT || 500)
      },
      pro: {
        projects: -1, // Unlimited
        clients: -1,
        photos: -1
      }
    };

    const limit = limits[plan]?.[resourceType];

    // If unlimited (-1), allow
    if (limit === -1) {
      return next();
    }

    // Check current usage
    let currentCount = 0;

    try {
      if (resourceType === 'projects') {
        const result = await query(
          'SELECT COUNT(*) FROM projects WHERE tenant_id = $1',
          [tenantId]
        );
        currentCount = parseInt(result.rows[0].count);
      } else if (resourceType === 'clients') {
        const result = await query(
          'SELECT COUNT(*) FROM clients WHERE tenant_id = $1',
          [tenantId]
        );
        currentCount = parseInt(result.rows[0].count);
      } else if (resourceType === 'photos') {
        const result = await query(
          `SELECT COUNT(*) FROM photos ph
           JOIN projects p ON ph.project_id = p.id
           WHERE p.tenant_id = $1 
           AND EXTRACT(MONTH FROM ph.uploaded_at) = EXTRACT(MONTH FROM NOW())
           AND EXTRACT(YEAR FROM ph.uploaded_at) = EXTRACT(YEAR FROM NOW())`,
          [tenantId]
        );
        currentCount = parseInt(result.rows[0].count);
      }

      if (currentCount >= limit) {
        return res.status(403).json({
          error: 'Usage limit reached',
          message: `You have reached your ${resourceType} limit for the ${plan} plan`,
          limit: limit,
          current: currentCount,
          upgradeRequired: true
        });
      }

      // Attach usage info to request
      req.usageInfo = {
        limit,
        current: currentCount,
        remaining: limit - currentCount
      };

      next();
    } catch (error) {
      console.error('Usage check error:', error);
      return res.status(500).json({ error: 'Failed to check usage limits' });
    }
  };
};

//Rate limiting based on plan
const planBasedRateLimit = (req, res, next) => {
  // Placeholder to implement with express-rate-limit;
  // Different limits per plan will be configured in the main app;
  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requirePlan,
  checkUsageLimit,
  planBasedRateLimit
};