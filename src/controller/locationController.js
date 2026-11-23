const PHOTON_API = "https://photon.komoot.io";

const isValidCoordinates = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const getAddressFromProperties = (properties = {}) => {
  const city =
    properties.city || properties.town || properties.village || "";
  const street = [properties.housenumber, properties.street]
    .filter(Boolean)
    .join(" ");
  const fullAddress = [
    properties.name,
    street,
    city,
    properties.county,
    properties.state,
    properties.postcode,
    properties.country,
  ]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(", ");

  return {
    fullAddress,
    area: properties.suburb || properties.district || properties.locality || "",
    city,
    district: properties.county || "",
    state: properties.state || "",
    postalCode: properties.postcode || "",
    country: properties.country || "",
  };
};

const reverseGeocode = async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);

    if (
      req.query.latitude === undefined ||
      req.query.longitude === undefined ||
      !isValidCoordinates(latitude, longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    const url = new URL(`${PHOTON_API}/reverse`);
    url.searchParams.set("lat", latitude);
    url.searchParams.set("lon", longitude);
    url.searchParams.set("lang", "en");

    const response = await fetch(url, {
      headers: { "User-Agent": "LearnNest/1.0" },
    });
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "Address lookup is temporarily unavailable",
      });
    }

    const data = await response.json();
    const properties = data.features?.[0]?.properties;
    if (!properties) {
      return res.status(200).json({
        success: true,
        coordinates: { latitude, longitude },
        address: {
          fullAddress: "",
          area: "",
          city: "",
          district: "",
          state: "",
          postalCode: "",
          country: "",
        },
      });
    }

    return res.status(200).json({
      success: true,
      coordinates: { latitude, longitude },
      address: getAddressFromProperties(properties),
    });
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch location address",
    });
  }
};

const searchLocations = async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2 || query.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search query must be between 2 and 100 characters",
      });
    }

    const url = new URL(`${PHOTON_API}/api/`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");
    url.searchParams.set("lang", "en");

    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    if (isValidCoordinates(latitude, longitude)) {
      url.searchParams.set("lat", latitude);
      url.searchParams.set("lon", longitude);
      url.searchParams.set("zoom", "14");
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "LearnNest/1.0" },
    });
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "Place search is temporarily unavailable",
      });
    }

    const data = await response.json();
    const locations = (data.features || [])
      .map((feature) => {
        const [resultLongitude, resultLatitude] =
          feature.geometry?.coordinates || [];
        const properties = feature.properties || {};

        return {
          name:
            properties.name ||
            properties.street ||
            properties.city ||
            properties.town ||
            properties.village ||
            "Unnamed location",
          ...getAddressFromProperties(properties),
          latitude: Number(resultLatitude),
          longitude: Number(resultLongitude),
          type: properties.osm_value || properties.type || "",
          id: properties.osm_id
            ? `${properties.osm_type || "osm"}-${properties.osm_id}`
            : `${resultLatitude},${resultLongitude}`,
        };
      })
      .filter((location) =>
        isValidCoordinates(location.latitude, location.longitude)
      );

    return res.status(200).json({
      success: true,
      count: locations.length,
      locations,
    });
  } catch (error) {
    console.error("Photon location search error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search locations",
    });
  }
};

module.exports = { reverseGeocode, searchLocations };
