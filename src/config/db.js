require("dotenv").config();

const { Pool } = require("pg");

const databaseUrl =
  process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL;

if (!databaseUrl) {
  console.error("Database URL is missing");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

pool.on("error", (error) => {
  console.error("PostgreSQL error:", error.message);
});

const connectDB = async () => {
  try {
    const result = await pool.query("SELECT NOW() AS server_time");
    console.log("Database connected at:", result.rows[0].server_time);
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};


module.exports = { pool, connectDB };