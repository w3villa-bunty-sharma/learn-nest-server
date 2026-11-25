const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { createCourseOrder, verifyCoursePayment, listMyEnrollments } = require("../controller/paymentController");

const router = express.Router();

router.post("/orders", authMiddleware, createCourseOrder);
router.post("/verify", authMiddleware, verifyCoursePayment);
router.get("/enrollments", authMiddleware, listMyEnrollments);



module.exports = router;
