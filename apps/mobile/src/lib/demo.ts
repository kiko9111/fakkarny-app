import { Platform } from "react-native";

/**
 * The browser preview runs on sample data with no server (EXPO_PUBLIC_DEMO=1 at build time):
 * every API call is answered in the browser by src/demo/server.ts, and Zaki's replies are
 * written by simple rules, not the real AI.
 */
export const isDemo = Platform.OS === "web" && process.env.EXPO_PUBLIC_DEMO === "1";
