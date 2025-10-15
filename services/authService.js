// Authentication logic with JWT and OAuth support

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, queryWithTenant } = require('../config/database');
const speakeasy = require('speakeasy');

const SALT_ROUNDS = 10;

class AuthService {
  /**
   * Register new tenant
   */
  async register({ email, password, companyName, phone }) {
    // Check if email already exists
    const existingUser = await query(
      'SELECT id FROM tenants WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create tenant
    const result = await query(
      `INSERT INTO tenants (email, password_hash, company_name, phone, subscription_plan)
       VALUES ($1, $2, $3, $4, 'free')
       RETURNING id, email, company_name, subscription_plan, created_at`,
      [email, passwordHash, companyName, phone]
    );

    const tenant = result.rows[0];

    // Create default subscription record
    await query(
      `INSERT INTO subscriptions (tenant_id, plan, status)
       VALUES ($1, 'free', 'active')`,
      [tenant.id]
    );

    // Generate tokens
    const tokens = this.generateTokens(tenant);

    return {
      tenant: {
        id: tenant.id,
        email: tenant.email,
        companyName: tenant.company_name,
        plan: tenant.subscription_plan
      },
      ...tokens
    };
  }

  /**
   * Login with email and password
   */
  async login(email, password) {
    // Find tenant
    const result = await query(
      `SELECT id, email, password_hash, company_name, subscription_plan, is_active
       FROM tenants WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const tenant = result.rows[0];

    // Check if account is active
    if (!tenant.is_active) {
      throw new Error('Account is disabled');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, tenant.password_hash);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await query(
      'UPDATE tenants SET last_login_at = NOW() WHERE id = $1',
      [tenant.id]
    );

    // Generate tokens
    const tokens = this.generateTokens(tenant);

    return {
      tenant: {
        id: tenant.id,
        email: tenant.email,
        companyName: tenant.company_name,
        plan: tenant.subscription_plan
      },
      ...tokens
    };
  }

  /**
   * Generate JWT access and refresh tokens
   */
  generateTokens(tenant) {
    const payload = {
      id: tenant.id,
      email: tenant.email,
      plan: tenant.subscription_plan
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    const refreshToken = jwt.sign(
      { id: tenant.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      // Get tenant data
      const result = await query(
        `SELECT id, email, subscription_plan, is_active
         FROM tenants WHERE id = $1`,
        [decoded.id]
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        throw new Error('Invalid refresh token');
      }

      const tenant = result.rows[0];
      const tokens = this.generateTokens(tenant);

      return tokens;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * OAuth - Find or create tenant from OAuth provider
   */
  async findOrCreateOAuthUser(provider, profile) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('Email not provided by OAuth provider');
    }

    // Check if OAuth account exists
    const oauthResult = await query(
      `SELECT tenant_id FROM oauth_accounts 
       WHERE provider = $1 AND provider_account_id = $2`,
      [provider, profile.id]
    );

    let tenantId;

    if (oauthResult.rows.length > 0) {
      // Existing OAuth account
      tenantId = oauthResult.rows[0].tenant_id;
    } else {
      // Check if email exists
      const tenantResult = await query(
        'SELECT id FROM tenants WHERE email = $1',
        [email]
      );

      if (tenantResult.rows.length > 0) {
        tenantId = tenantResult.rows[0].id;
      } else {
        // Create new tenant
        const newTenantResult = await query(
          `INSERT INTO tenants (email, company_name, subscription_plan, password_hash)
           VALUES ($1, $2, 'free', '')
           RETURNING id`,
          [email, profile.displayName || email.split('@')[0]]
        );
        tenantId = newTenantResult.rows[0].id;

        // Create default subscription
        await query(
          `INSERT INTO subscriptions (tenant_id, plan, status)
           VALUES ($1, 'free', 'active')`,
          [tenantId]
        );
      }

      // Link OAuth account
      await query(
        `INSERT INTO oauth_accounts (tenant_id, provider, provider_account_id, access_token, refresh_token)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, provider, profile.id, profile.accessToken, profile.refreshToken]
      );
    }

    // Get full tenant data
    const tenantResult = await query(
      'SELECT id, email, company_name, subscription_plan FROM tenants WHERE id = $1',
      [tenantId]
    );

    const tenant = tenantResult.rows[0];
    const tokens = this.generateTokens(tenant);

    return {
      tenant: {
        id: tenant.id,
        email: tenant.email,
        companyName: tenant.company_name,
        plan: tenant.subscription_plan
      },
      ...tokens
    };
  }

  /**
   * Change password
   */
  async changePassword(tenantId, oldPassword, newPassword) {
    const result = await query(
      'SELECT password_hash FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    const validPassword = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!validPassword) {
      throw new Error('Invalid current password');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query(
      'UPDATE tenants SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, tenantId]
    );

    return { success: true };
  }

  /**
   * Enable 2FA
   */
  async enable2FA(tenantId) {
    const secret = speakeasy.generateSecret({
      name: `CRM (${tenantId})`,
      length: 32
    });

    // Store secret temporarily (you might want a separate table for this)
    await query(
      `UPDATE tenants SET 
       two_factor_secret = $1,
       two_factor_enabled = false
       WHERE id = $2`,
      [secret.base32, tenantId]
    );

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url
    };
  }

  /**
   * Verify and activate 2FA
   */
  async verify2FA(tenantId, token) {
    const result = await query(
      'SELECT two_factor_secret FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    const secret = result.rows[0].two_factor_secret;
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (!verified) {
      throw new Error('Invalid 2FA token');
    }

    // Enable 2FA
    await query(
      'UPDATE tenants SET two_factor_enabled = true WHERE id = $1',
      [tenantId]
    );

    return { success: true };
  }

  /**
   * Disable 2FA
   */
  async disable2FA(tenantId, password) {
    const result = await query(
      'SELECT password_hash FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    const validPassword = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!validPassword) {
      throw new Error('Invalid password');
    }

    await query(
      `UPDATE tenants SET 
       two_factor_enabled = false,
       two_factor_secret = NULL
       WHERE id = $1`,
      [tenantId]
    );

    return { success: true };
  }
}

module.exports = new AuthService();