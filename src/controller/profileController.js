const { pool } = require("../config/db");

const getProfile = async (req, res) => {
  try {
      const result = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.google_id IS NOT NULL AS google_connected,
         u.facebook_id IS NOT NULL AS facebook_connected,
         p.address_line1,
         p.address_line2,
         p.city,
         p.state,
         p.postal_code,
         p.country,
         p.latitude,
         p.longitude,
         p.profile_picture_url
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, profile: result.rows[0] });
  } catch (error) {
    console.error("Get profile error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load profile" });
  }
};

const updateProfile = async (req, res) => {
  const {
    name,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    latitude,
    longitude,
  } = req.body;

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ success: false, message: "Name cannot be empty" });
  }

  const coordinatesProvided = latitude != null || longitude != null;
  const parsedLatitude = latitude == null ? null : Number(latitude);
  const parsedLongitude = longitude == null ? null : Number(longitude);

  if (
    coordinatesProvided &&
    (!Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      parsedLongitude < -180 ||
      parsedLongitude > 180)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid latitude and longitude are required",
    });
  }

  try {
    if (name !== undefined) {
      await pool.query(
        "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2",
        [name.trim(), req.user.id],
      );
    }

    await pool.query(
      `INSERT INTO profiles
         (user_id, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         address_line1 = EXCLUDED.address_line1,
         address_line2 = EXCLUDED.address_line2,
         city = EXCLUDED.city,
         state = EXCLUDED.state,
         postal_code = EXCLUDED.postal_code,
         country = EXCLUDED.country,
         latitude = COALESCE(EXCLUDED.latitude, profiles.latitude),
         longitude = COALESCE(EXCLUDED.longitude, profiles.longitude),
         updated_at = NOW()`,
      [
        req.user.id,
        address_line1 ?? null,
        address_line2 ?? null,
        city ?? null,
        state ?? null,
        postal_code ?? null,
        country ?? null,
        parsedLatitude,
        parsedLongitude,
      ],
    );

    return res.json({ success: true, message: "Profile updated" });
  } catch (error) {
    console.error("Update profile error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update profile" });
  }
};

module.exports = { getProfile, updateProfile };
