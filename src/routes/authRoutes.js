
const express = require("express");
const router = express.Router();

const {
  signup,
  verifyEmail,
  login,
  getMe,
  resendVerificationEmail,
  googleLogin,
  facebookLogin,
  exchangeFacebookCode,
} = require("../controller/authController");

const authMiddleware = require("../middleware/authMiddleware");
const passport = require("../config/passport");

router.post("/signup", signup);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationEmail);
router.post("/login", login);

// Existing JWT authentication
router.get("/me", authMiddleware, getMe);

// Google authentication
router.post("/google", googleLogin);

// Facebook OAuth initiation
router.get(
  "/facebook",
  passport.authenticate("facebook", {
    scope: ["email"],
  })
);

// Facebook OAuth callback
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: "http://localhost:3000/login?error=facebook",
  }),
  facebookLogin
);

// Exchange one-time authorization code for JWT
router.post("/facebook/exchange", exchangeFacebookCode);

module.exports = router;
