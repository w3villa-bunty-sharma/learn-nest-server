const express = require("express");
const router = express.Router();
const {getSignature,saveProfilePicture,removeProfilePicture} = require("../controller/profilePictureController");

const { getProfile, updateProfile } = require("../controller/profileController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, getProfile);
router.put("/", authMiddleware, updateProfile);
router.post("/photo/signature",authMiddleware,getSignature);
router.post("/photo",authMiddleware,saveProfilePicture);
router.delete("/photo",authMiddleware,removeProfilePicture);
module.exports = router;