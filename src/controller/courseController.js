const { pool } = require("../config/db");

const listCourses = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT slug, title, category, description, duration, level,
             price_paise, popularity, gradient, image
      FROM public.courses
      WHERE is_active = TRUE
      ORDER BY popularity DESC, title ASC
    `);

    return res.json({ success: true, courses: result.rows });
  } catch (error) {
    console.error("List courses error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load courses",
    });
  }
};

const getCourseBySlug = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT slug, title, category, description, duration, level,
              price_paise, popularity, gradient, image
       FROM public.courses
       WHERE slug = $1 AND is_active = TRUE`,
      [req.params.slug],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    return res.json({ success: true, course: result.rows[0] });
  } catch (error) {
    console.error("Get course error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load course",
    });
  }
};

module.exports = { listCourses, getCourseBySlug };