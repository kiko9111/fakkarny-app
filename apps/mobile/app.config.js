const fs = require("node:fs");
const path = require("node:path");

// Push on Android needs Firebase: google-services.json from the Firebase project (Android app
// com.fakkarni.app). It is read from the EAS file variable GOOGLE_SERVICES_JSON when set, else
// from apps/mobile/google-services.json. Without it the build still works; it just gets no push token.
function googleServicesFile() {
  const fromEnv = process.env.GOOGLE_SERVICES_JSON;
  if (fromEnv) return fromEnv;
  const local = path.join(__dirname, "google-services.json");
  return fs.existsSync(local) ? "./google-services.json" : undefined;
}

// The browser preview (EXPO_PUBLIC_DEMO=1) ships as one HTML file, so routes are not split
// into separate chunks there. Everything else comes from app.json unchanged.
module.exports = ({ config }) => {
  const googleServices = googleServicesFile();
  if (googleServices) config = { ...config, android: { ...config.android, googleServicesFile: googleServices } };
  if (process.env.EXPO_PUBLIC_DEMO !== "1") return config;
  return { ...config, extra: { ...config.extra, router: { ...config.extra?.router, asyncRoutes: false } } };
};
