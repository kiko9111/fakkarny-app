// The browser preview (EXPO_PUBLIC_DEMO=1) ships as one HTML file, so routes are not split
// into separate chunks there. Everything else comes from app.json unchanged.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_DEMO !== "1") return config;
  return { ...config, extra: { ...config.extra, router: { ...config.extra?.router, asyncRoutes: false } } };
};
