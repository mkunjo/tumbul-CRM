const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('./models/User');

//Passport Google Strategy
passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            //Find existing users, don't create
            const user = await User.findOne({
                googleId: profile.id
            });

            if (!user) {
                //Return a special indicator that user needs to register
                return done(null, false, {
                    message: 'Please complete registration first'
                });
            }

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }
));

//Passport serialization
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

//Generate JWT with expiration
function generateToken(user) {
    if (!user || !user.id || !user.email) {
        throw new Error('Invalid user data for token generation');
    }
    
    const payload = {
        userId: user.id,
        email: user.email,
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '1h', // token valid for 1 hour
        algorithm: 'HS256',
    });
}

//Route handlers
function setupGoogleAuthRoutes(app) {
    //Login route
    app.get('/auth/google', 
        passport.authenticate('google', { scope: ['profile', 'email'] })
    );

    //Callback route
    app.get('/auth/google/callback', 
        passport.authenticate('google', { 
            session: false, 
            failureRedirect: '/register?error=not_registered' 
        }),
        (req, res) => {
            try {
                const token = generateToken(req.user);
                res.redirect(`/dashboard?token=${token}`);
            } catch (err) {
                console.error('Token generation error:', err);
                res.redirect('/login?error=token_generation_failed');
            }
        }
    );

    //Logout route
    app.get('/auth/logout', (req, res) => {
        req.logout((err) => {
            if (err) {
                return res.status(500).json({ error: 'Logout failed' });
            }
            res.redirect('/');
        });
    });
}

module.exports = {
    generateToken,
    setupGoogleAuthRoutes
};