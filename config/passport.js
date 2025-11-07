// OAuth configuration for Google and Apple

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const authService = require('../services/authService');

/**
 * Configure Google OAuth Strategy (only if credentials provided)
 */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'placeholder') {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const result = await authService.findOrCreateOAuthUser('google', {
            id: profile.id,
            displayName: profile.displayName,
            emails: profile.emails,
            accessToken,
            refreshToken
          });

          return done(null, result);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

/**
 * Configure Apple OAuth Strategy (only if credentials provided)
 */
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_ID !== 'placeholder') {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        callbackURL: process.env.APPLE_CALLBACK_URL,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
        scope: ['name', 'email'],
        passReqToCallback: false
      },
      async (accessToken, refreshToken, idToken, profile, done) => {
        try {
          const result = await authService.findOrCreateOAuthUser('apple', {
            id: profile.id,
            displayName: profile.name ? `${profile.name.firstName} ${profile.name.lastName}` : null,
            emails: [{ value: profile.email }],
            accessToken,
            refreshToken
          });
          
          return done(null, result);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

/**
 * Serialize user for session (if using sessions)
 */
passport.serializeUser((user, done) => {
  done(null, user.tenant.id);
});

/**
 * Deserialize user from session
 */
passport.deserializeUser(async (id, done) => {
  try {
    const { query } = require('../config/database');
    const result = await query(
      'SELECT id, email, company_name, subscription_plan FROM tenants WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return done(null, false);
    }
    
    const tenant = result.rows[0];
    done(null, {
      id: tenant.id,
      email: tenant.email,
      companyName: tenant.company_name,
      plan: tenant.subscription_plan
    });
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;