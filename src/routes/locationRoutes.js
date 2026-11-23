const express = require("express");
const router = express.Router();

const { reverseGeocode, searchLocations } = require("../controller/locationController");

router.get("/reverse", reverseGeocode);

router.get("/search", searchLocations);

module.exports = router;
