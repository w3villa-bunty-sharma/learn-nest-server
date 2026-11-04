const express = require('express');
const router = express.Router();
const { signup,verifyEmail, login, getMe, resendVerificationEmail } = require('../controller/authController');
const authMiddleware = require('../middleware/authMiddleware');


router.post('/signup', signup);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);
router.post('/login', login);
router.get('/me',authMiddleware, getMe);

module.exports = router;
