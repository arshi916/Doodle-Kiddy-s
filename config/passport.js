require("dotenv").config();
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");

console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleID: profile.id });
        
        if (!user) {
            user = await User.findOne({ email: profile.emails[0].value });
            
            if (user) {
                user.googleID = profile.id;
                await user.save();
            } else {
            
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleID: profile.id,
                    isAdmin: false,
                    isBlocked: false,
                    createdOn: new Date(), 
                    wallet: 0, 
                    redeemed: false
                });
                await user.save();
                console.log('New Google user created:', user.name, user.email, user.createdOn);
            }
        }

        if (user.isBlocked) {
            return done(null, false, { message: "Your account is blocked" });
        }

        return done(null, user);
    } catch (error) {
        console.error('Google Strategy Error:', error);
        return done(error, null);
    }
}));


passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;

 