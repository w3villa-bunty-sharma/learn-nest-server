
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { pool, connectDB } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const adminMiddleware = require("./middleware/adminMiddleware");
const authMiddleware = require("./middleware/authMiddleware");

const passport = require("./config/passport");

const app = express();

// Security middleware
app.use(helmet());

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
  ],
  credentials: true,
};

app.use(cors(corsOptions));

// Request middleware
app.use(express.json());

// Parse cookies before Passport routes.
app.use(cookieParser());

// Initialize Passport without persistent login sessions.
app.use(passport.initialize());

// Authentication routes
app.use("/api/auth", authRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Learn-nest API is running",
  });
});

// Admin dashboard
app.get(
  "/api/admin/dashboard",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome to Admin Dashboard",
      user: req.user,
    });
  }
);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
