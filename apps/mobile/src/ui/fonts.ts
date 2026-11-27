import { Rubik_400Regular } from "@expo-google-fonts/rubik/400Regular";
import { Rubik_500Medium } from "@expo-google-fonts/rubik/500Medium";
import { Rubik_600SemiBold } from "@expo-google-fonts/rubik/600SemiBold";
import { Rubik_700Bold } from "@expo-google-fonts/rubik/700Bold";
import { Ionicons } from "@expo/vector-icons";

/**
 * One family, Rubik (Arabic and Latin in the same files), in four weights (owner pick,
 * 2026-11-27). Loaded at run time, so it reaches existing builds with an over-the-air update.
 */
export const appFonts = {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  ...Ionicons.font,
};
