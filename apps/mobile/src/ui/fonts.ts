import { Alexandria_600SemiBold } from "@expo-google-fonts/alexandria/600SemiBold";
import { Alexandria_700Bold } from "@expo-google-fonts/alexandria/700Bold";
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { Ionicons } from "@expo/vector-icons";

/**
 * Alexandria (by Egyptian type designer Mohamed Gaber) for headings and numbers; IBM Plex
 * Sans Arabic for reading. Both cover Arabic and Latin. Loaded once in the root layout.
 */
export const appFonts = {
  Alexandria_600SemiBold,
  Alexandria_700Bold,
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  ...Ionicons.font,
};
