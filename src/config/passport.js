
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;

const facebookStateStore = require("./facebookStateStore");

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,

      profileFields: [
        "id",
        "displayName",
        "name",
        "emails",
        "photos",
      ],

      // Custom session-free OAuth state verification.
      store: facebookStateStore,
    },
    (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

module.exports = passport;
