const express = require('express');
const router = express.Router();
const { signup,verifyEmail, login, getMe, resendVerificationEmail, googleLogin } = require('../controller/authController');
const authMiddleware = require('../middleware/authMiddleware');


router.post('/signup', signup);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);
router.post('/login', login);
router.get('/me',authMiddleware, getMe);
router.post('/google', googleLogin);

module.exports = router;
