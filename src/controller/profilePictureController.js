const cloudinary = require("../config/cloudinary");
const {pool} = require("../config/db");

const getSignature = (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "learnnest/profile-images";
    const publicId = `user-${req.user.id}`;

    const paramsToSign = {
      folder,
      public_id: publicId,
      overwrite: true,
      timestamp,
    };

    const cloudinaryConfig = cloudinary.config();
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      cloudinaryConfig.api_secret,
    );

    return res.json({
      success: true,
      signature,
      timestamp,
      folder,
      publicId,
      overwrite: true,
      apiKey: cloudinaryConfig.api_key,
      cloudName: cloudinaryConfig.cloud_name,
    });
  } catch (error) {
    console.error("Cloudinary signature error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not prepare profile photo upload.",
    });
  }
};

const saveProfilePicture = async (req, res) => {
  try {
    const { secureUrl } = req.body;

    if (typeof secureUrl !== "string") {
      return res.status(400).json({
        success: false,
        message: "Profile picture URL is required.",
      });
    }

    const cloudName = cloudinary.config().cloud_name;
    const expectedPath = `/${cloudName}/image/upload/`;
    const expectedPublicId = `learnnest/profile-images/user-${req.user.id}`;

    let parsedUrl;

    try {
      parsedUrl = new URL(secureUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid profile picture URL.",
      });
    }

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname !== "res.cloudinary.com" ||
      !parsedUrl.pathname.includes(expectedPath) ||
      !parsedUrl.pathname.includes(expectedPublicId)
    ) {
      return res.status(400).json({
        success: false,
        message: "This Cloudinary image is not valid for your profile.",
      });
    }

    await pool.query(
      `INSERT INTO profiles (user_id, profile_picture_url)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         profile_picture_url = EXCLUDED.profile_picture_url,
         updated_at = NOW()`,
      [req.user.id, secureUrl],
    );

    return res.json({
      success: true,
      message: "Profile picture saved.",
      profile_picture_url: secureUrl,
    });
  } catch (error) {
    console.error("Save profile picture error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not save profile picture.",
    });
  }
};

const removeProfilePicture = async (req, res) => {
  try {
    const publicId = `learnnest/profile-images/user-${req.user.id}`;

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      type: "upload",
      invalidate: true,
    });

    if (result.result !== "ok" && result.result !== "not found") {
      return res.status(500).json({
        success: false,
        message: "Could not remove profile picture from Cloudinary.",
      });
    }

    await pool.query(
      `UPDATE profiles
       SET profile_picture_url = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [req.user.id],
    );

    return res.json({
      success: true,
      message: "Profile picture removed.",
    });
  } catch (error) {
    console.error("Remove profile picture error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not remove profile picture.",
    });
  }
};

module.exports = { getSignature, saveProfilePicture, removeProfilePicture }; 