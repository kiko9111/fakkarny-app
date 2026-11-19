import { DevSettings } from "react-native";
import * as Updates from "expo-updates";

/** Restart the JS app (language/RTL changes need it). */
export async function reloadApp() {
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}
