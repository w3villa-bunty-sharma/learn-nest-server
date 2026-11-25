
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");


const { pool, connectDB } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const adminMiddleware = require("./middleware/adminMiddleware");
const authMiddleware = require("./middleware/authMiddleware");
const profileRoutes = require("./routes/profileRoutes");
const locationRoutes = require("./routes/locationRoutes");

const passport = require("./config/passport");

const app = express();

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
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/location", locationRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Learn-nest API is running",
  });
});

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


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
