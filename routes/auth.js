// Authentication endpoints

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');
const passport = require('../config/passport');
const qrcode = require('qrcode');

/**
 * Validation middleware helper
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      errors: errors.array() 
    });
  }
  next();
};

/**
 * POST /auth/register
 * Register new tenant account
 */
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('companyName').optional().trim(),
    body('phone').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      console.error('Registration error:', error);
      res.status(400).json({ 
        error: 'Registration failed',
        message: error.message 
      });
    }
  }
);

/**
 * POST /auth/login
 * Login with email and password
 */
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json(result);
    } catch (error) {
      console.error('Login error:', error);
      res.status(401).json({ 
        error: 'Login failed',
        message: error.message 
      });
    }
  }
);

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh',
  [body('refreshToken').notEmpty()],
  validate,
  async (req, res) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshAccessToken(refreshToken);
      res.json(tokens);
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({ 
        error: 'Token refresh failed',
        message: error.message 
      });
    }
  }
);

/**
 * GET /auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, (req, res) => {
  res.json({ tenant: req.tenant });
});

/**
 * POST /auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password',
  authenticate,
  [
    body('oldPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 })
  ],
  validate,
  async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      await authService.changePassword(req.tenant.id, oldPassword, newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(400).json({ 
        error: 'Password change failed',
        message: error.message 
      });
    }
  }
);

/**
 * POST /auth/2fa/enable
 * Enable 2FA for user
 */
router.post('/2fa/enable', authenticate, async (req, res) => {
  try {
    const result = await authService.enable2FA(req.tenant.id);
    
    // Generate QR code
    const qrCodeDataUrl = await qrcode.toDataURL(result.qrCode);
    
    res.json({
      secret: result.secret,
      qrCode: qrCodeDataUrl,
      message: 'Scan this QR code with your authenticator app and verify with a code'
    });
  } catch (error) {
    console.error('2FA enable error:', error);
    res.status(500).json({ 
      error: '2FA setup failed',
      message: error.message 
    });
  }
});

/**
 * POST /auth/2fa/verify
 * Verify and activate 2FA
 */
router.post('/2fa/verify',
  authenticate,
  [body('token').isLength({ min: 6, max: 6 })],
  validate,
  async (req, res) => {
    try {
      const { token } = req.body;
      await authService.verify2FA(req.tenant.id, token);
      res.json({ 
        success: true,
        message: '2FA enabled successfully' 
      });
    } catch (error) {
      console.error('2FA verify error:', error);
      res.status(400).json({ 
        error: '2FA verification failed',
        message: error.message 
      });
    }
  }
);

/**
 * POST /auth/2fa/disable
 * Disable 2FA
 */
router.post('/2fa/disable',
  authenticate,
  [body('password').notEmpty()],
  validate,
  async (req, res) => {
    try {
      const { password } = req.body;
      await authService.disable2FA(req.tenant.id, password);
      res.json({ 
        success: true,
        message: '2FA disabled successfully' 
      });
    } catch (error) {
      console.error('2FA disable error:', error);
      res.status(400).json({ 
        error: '2FA disable failed',
        message: error.message 
      });
    }
  }
);

// =============================================
// OAuth Routes
// =============================================

/**
 * GET /auth/google
 * Initiate Google OAuth flow
 */
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  })
);

/**
 * GET /auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback',
  passport.authenticate('google', { 
    session: false,
    failureRedirect: '/login?error=oauth_failed' 
  }),
  (req, res) => {
    // Success - redirect to frontend with tokens
    const { accessToken, refreshToken } = req.user;
    const redirectUrl = `${process.env.CORS_ORIGIN}/auth/callback?token=${accessToken}&refresh=${refreshToken}`;
    res.redirect(redirectUrl);
  }
);

/**
 * GET /auth/apple
 * Initiate Apple OAuth flow
 */
router.get('/apple',
  passport.authenticate('apple', { session: false })
);

/**
 * POST /auth/apple/callback
 * Apple OAuth callback (Apple uses POST)
 */
router.post('/apple/callback',
  passport.authenticate('apple', { 
    session: false,
    failureRedirect: '/login?error=oauth_failed' 
  }),
  (req, res) => {
    const { accessToken, refreshToken } = req.user;
    const redirectUrl = `${process.env.CORS_ORIGIN}/auth/callback?token=${accessToken}&refresh=${refreshToken}`;
    res.redirect(redirectUrl);
  }
);

/**
 * POST /auth/logout
 * Logout (client-side token removal mainly)
 */
router.post('/logout', authenticate, (req, res) => {
  // In a JWT system, logout is mainly client-side
  // Optionally implement token blacklist here
  res.json({ 
    success: true,
    message: 'Logged out successfully' 
  });
});

module.exports = router;