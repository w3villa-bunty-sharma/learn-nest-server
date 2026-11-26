const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const transporter = require("../config/email");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const API_BASE_URL = (
  process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`
).replace(/\/$/, "");
const FRONTEND_URL = (process.env.CLIENT_URL || "http://localhost:3000")
  .replace(/\/$/, "");
const frontendPath = (path) => `${FRONTEND_URL}${path}`;

// SIGNUP
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid name",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    // password ko scramble karo
    const hash = await bcrypt.hash(password, 10);

    // Generate secure verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    const verificationTokenExpiry = new Date(Date.now() + 1 * 60 * 1000);

    // Save the user and verification token in the database
    await pool.query(
      `INSERT INTO users
   (name, email, password_hash, email_verification_token_hash, email_verification_expires_at)
   VALUES ($1, $2, $3, $4, $5)`,
      [
        normalizedName,
        normalizedEmail,
        hash,
        verificationTokenHash,
        verificationTokenExpiry,
      ],
    );

    // Create the email verification link
    const verificationLink = `${API_BASE_URL}/api/auth/verify-email?token=${verificationToken}`;

    // Send the verification email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: normalizedEmail,
      subject: "Verify Your Email Address",
      html: `
    <h2>Welcome to Learn-Nest!</h2>
    <p>Please click the link below to verify your email address:</p>
    <a href="${verificationLink}">Verify Email</a>
    <p>This link will expire in 1 minute.</p>
  `,
    });

    return res.status(201).json({
      success: true,
      message: "Signup successful. Please check your email for verification.",
    });
  } catch (error) {
    console.error("Signup error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Signup failed. Please try again.",
    });
  }
};

// VERIFY EMAIL
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    // Generate hash from the received token
    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find the user with a valid verification token
    const result = await pool.query(
      `SELECT id FROM users
       WHERE email_verification_token_hash = $1
       AND email_verification_expires_at > NOW()`,
      [verificationTokenHash],
    );

    if (result.rows.length === 0) {
      return res.redirect(frontendPath("/verify-email?expired=true"));
    }

    // Mark the user's email as verified
    await pool.query(
      `UPDATE users
       SET is_email_verified = TRUE,
           email_verification_token_hash = NULL,
           email_verification_expires_at = NULL
       WHERE id = $1`,
      [result.rows[0].id],
    );

    return res.redirect(frontendPath("/verify-email?verified=true"));
  } catch (error) {
    console.error("Email verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// RESEND VERIFICATION EMAIL
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Check whether email is provided
    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user in database
    const result = await pool.query(
      "SELECT id, email, is_email_verified FROM users WHERE email = $1",
      [normalizedEmail],
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check whether email is already verified
    if (user.is_email_verified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Generate a new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    // Set token expiry to 1 minute
    const verificationTokenExpiry = new Date(Date.now() + 1 * 60 * 1000);

    // Update verification token in database
    await pool.query(
      `UPDATE users
       SET email_verification_token_hash = $1,
           email_verification_expires_at = $2
       WHERE id = $3`,
      [verificationTokenHash, verificationTokenExpiry, user.id],
    );

    // Create verification link
    const verificationLink = `${API_BASE_URL}/api/auth/verify-email?token=${verificationToken}`;

    // Send verification email using existing transporter
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: normalizedEmail,
      subject: "Verify Your Email Address",
      html: `
        <h2>Welcome to Learn-Nest!</h2>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>This link will expire in 1 minute.</p>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Verification email sent successfully",
    });
  } catch (error) {
    console.error("Resend verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to resend verification email. Please try again.",
    });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Password must be a valid string",
      });
    }

    if (!password.trim()) {
      return res.status(400).json({
        success: false,
        message: "Password cannot be empty",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (typeof email !== "string" || !emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // search the user in the database with the provided email
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      normalizedEmail,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // password matched
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Password incorrect",
      });
    }

    // Check whether the user's email is verified
    if (!user.is_email_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in",
      });
    }

    // JWT token generate
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" },
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, is_email_verified, created_at
        FROM users
        WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// GOOGLE LOGIN / SIGNUP

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
    }

    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const { sub: googleId, email, name, email_verified } = payload;

    if (!email || !email_verified) {
      return res.status(401).json({
        success: false,
        message: "Google email is not verified",
      });
    }

    const normalizedEmail = email.toLowerCase();

    // Check existing user
    let result = await pool.query("SELECT * FROM users WHERE email = $1", [
      normalizedEmail,
    ]);

    let user = result.rows[0];

    // Create new user if not exists
    if (!user) {
      result = await pool.query(
        `INSERT INTO users
        (name, email, password_hash, is_email_verified, google_id)
        VALUES ($1, $2, $3, TRUE, $4)
        RETURNING id, name, email, role`,
        [
          name || normalizedEmail.split("@")[0],
          normalizedEmail,
          null,
          googleId,
        ],
      );

      user = result.rows[0];
    }
    if (!user.google_id) {
      await pool.query("UPDATE users SET google_id = $1 WHERE id = $2", [
        googleId,
        user.id,
      ]);
    } else if (!user.is_email_verified) {
      await pool.query(
        `UPDATE users
         SET is_email_verified = TRUE,
             email_verification_token_hash = NULL,
             email_verification_expires_at = NULL
         WHERE id = $1`,
        [user.id],
      );

      user.is_email_verified = true;
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
    );

    return res.status(200).json({
      success: true,
      message: "Google login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Google login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};

// FACEBOOK LOGIN / SIGNUP


const facebookLogin = async (req, res) => {
  try {
    const profile = req.user;

    if (!profile || !profile.id) {
      return res.redirect(frontendPath("/login?error=facebook"));
    }

    const facebookId = profile.id;
    const email = profile.emails?.[0]?.value?.trim().toLowerCase();

    const name =
      profile.displayName ||
      [
        profile.name?.givenName,
        profile.name?.familyName,
      ]
        .filter(Boolean)
        .join(" ");

    if (!email) {
      return res.redirect(
        frontendPath("/login?error=facebook_email")
      );
    }

    // Check whether this Facebook account already exists
    let result = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE facebook_id = $1`,
      [facebookId]
    );

    let user = result.rows[0];

    if (!user) {
      // Check whether this email belongs to an existing account
      result = await pool.query(
        `SELECT id FROM users WHERE email = $1`,
        [email]
      );

      if (result.rows.length > 0) {
        return res.redirect(
          frontendPath("/login?error=account_exists")
        );
      }

      // Create a new Facebook user
      result = await pool.query(
        `INSERT INTO users
         (name, email, password_hash, facebook_id, is_email_verified)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, name, email, role`,
        [
          name || email.split("@")[0],
          email,
          null,
          facebookId,
        ]
      );

      user = result.rows[0];
    }

    // Generate a short-lived one-time authorization code
    const authorizationCode = crypto.randomBytes(32).toString("hex");

    // Generate a browser-binding secret
    const browserBinding = crypto.randomBytes(32).toString("hex");

    const codeHash = crypto
      .createHash("sha256")
      .update(authorizationCode)
      .digest("hex");

    const browserBindingHash = crypto
      .createHash("sha256")
      .update(browserBinding)
      .digest("hex");

    // Store only the hashes in PostgreSQL
    await pool.query(
      `INSERT INTO oauth_authorization_codes
       (code_hash, browser_binding_hash, user_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '2 minutes')`,
      [codeHash, browserBindingHash, user.id]
    );

    // Browser-binding cookie
    res.cookie("facebook_code_binding", browserBinding, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 2 * 60 * 1000,
      path: "/api/auth/facebook/exchange",
    });

    // Send only the one-time code to the frontend
    const frontendUrl = new URL(frontendPath("/login"));
    frontendUrl.searchParams.set("facebook_code", authorizationCode);

    return res.redirect(frontendUrl.toString());
  } catch (error) {
    console.error("Facebook login error:", error);

    return res.redirect(
      frontendPath("/login?error=facebook")
    );
  }
};


// Exchange one-time Facebook code for JWT
const exchangeFacebookCode = async (req, res) => {
  try {
    const { code } = req.body;

    const browserBinding = req.cookies?.facebook_code_binding;

    // Clear the browser-binding cookie
    res.clearCookie("facebook_code_binding", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/api/auth/facebook/exchange",
    });

    if (
      !code ||
      typeof code !== "string" ||
      !browserBinding
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired Facebook authorization.",
      });
    }

    const codeHash = crypto
      .createHash("sha256")
      .update(code)
      .digest("hex");

    const browserBindingHash = crypto
      .createHash("sha256")
      .update(browserBinding)
      .digest("hex");

    // Atomically consume the one-time code
    const result = await pool.query(
      `UPDATE oauth_authorization_codes
       SET consumed_at = NOW()
       WHERE code_hash = $1
         AND browser_binding_hash = $2
         AND expires_at > NOW()
         AND consumed_at IS NULL
       RETURNING user_id`,
      [codeHash, browserBindingHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Facebook authorization code is invalid or expired.",
      });
    }

    const userResult = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id = $1`,
      [result.rows[0].user_id]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Generate the application's JWT
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Facebook login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Facebook code exchange error:", error);

    return res.status(500).json({
      success: false,
      message: "Facebook authentication failed.",
    });
  }
};

module.exports = {
  signup,
  verifyEmail,
  login,
  facebookLogin,
  exchangeFacebookCode,
  getMe,
  resendVerificationEmail,
  googleLogin,
};
