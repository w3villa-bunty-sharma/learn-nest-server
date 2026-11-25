const express = require("express");
const {listCourses,getCourseBySlug} = require("../controller/courseController");

const router = express.Router();

router.get("/", listCourses);
router.get("/:slug", getCourseBySlug);

module.exports = router;