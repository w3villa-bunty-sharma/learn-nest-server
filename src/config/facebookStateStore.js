
const crypto = require("crypto");

const COOKIE_NAME = "facebook_oauth_state";
const COOKIE_PATH = "/api/auth/facebook";
const STATE_TTL = 5 * 60 * 1000;

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: STATE_TTL,
  path: COOKIE_PATH,
});

const stateStore = {
  // Passport custom store signature
  store(req, state, meta, callback) {
    try {
      const secret = process.env.OAUTH_STATE_SECRET;

      if (!secret) {
        return callback(
          new Error("OAUTH_STATE_SECRET is missing")
        );
      }

      const generatedState = crypto
        .randomBytes(32)
        .toString("hex");

      const signature = crypto
        .createHmac("sha256", secret)
        .update(generatedState)
        .digest("hex");

      const cookieValue = `${generatedState}.${signature}`;

      req.res.cookie(
        COOKIE_NAME,
        cookieValue,
        getCookieOptions()
      );

      return callback(null, generatedState);
    } catch (error) {
      return callback(error);
    }
  },

  verify(req, providedState, callback) {
    try {
      const secret = process.env.OAUTH_STATE_SECRET;
      const cookieValue = req.cookies?.[COOKIE_NAME];

      const clearOptions = getCookieOptions();
      delete clearOptions.maxAge;

      req.res.clearCookie(COOKIE_NAME, clearOptions);

      if (!secret || !cookieValue || !providedState) {
        return callback(null, false);
      }

      const parts = cookieValue.split(".");

      if (parts.length !== 2) {
        return callback(null, false);
      }

      const [storedState, storedSignature] = parts;

      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(storedState)
        .digest("hex");

      const actualBuffer = Buffer.from(storedSignature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      if (
        actualBuffer.length !== expectedBuffer.length ||
        actualBuffer.length !== 32
      ) {
        return callback(null, false);
      }

      const validSignature = crypto.timingSafeEqual(
        actualBuffer,
        expectedBuffer
      );

      const validState =
        storedState === providedState && validSignature;

      return callback(null, validState);
    } catch (error) {
      return callback(error);
    }
  },
};

module.exports = stateStore;
