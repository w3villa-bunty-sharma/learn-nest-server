
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
const courseRoutes = require("./routes/courseRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const { handleRazorpayWebhook } = require("./controller/paymentController");

const passport = require("./config/passport");

const app = express();

app.use(helmet());

const configuredOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
].filter((origin) => typeof origin === "string" && origin.trim())
  .map((origin) => origin.trim().replace(/\/$/, ""));

const corsOptions = {
  origin: configuredOrigins,
  credentials: true,
};



app.use(cors(corsOptions));


app.post(
  "/api/payment/webhook",
  express.raw({ type: "application/json" }),
  handleRazorpayWebhook,
);


app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/payment", paymentRoutes);



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




const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
