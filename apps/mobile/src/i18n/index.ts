import { I18nManager } from "react-native";
import { getLocales } from "expo-localization";
import type { Language } from "@fakkarni/shared";
import { prefs } from "@/lib/prefs";
import { pickLanguage } from "./pick";
import { strings } from "./strings";

// The user's choice (settings/onboarding) wins over the device language.
const chosen = prefs.get("language");
export const language: Language = chosen === "en" || chosen === "ar-EG" ? chosen : pickLanguage(getLocales().map((l) => l.languageTag));
export const t = strings[language];
export const isRTL = language === "ar-EG";

// Full RTL for Arabic even when the device itself is set to English (takes effect after a reload).
if (I18nManager.isRTL !== isRTL) {
  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);
}
/** Between the things of a list written in a sentence ("1:00 PM, 6:00 PM"): the language's own comma. */
export const listComma = language === "ar-EG" ? "، " : ", ";
/** Locale for dates and times: the app's language (Latin digits, like amounts), not the phone's. */
export const dateLocale = language === "ar-EG" ? "ar-EG-u-nu-latn" : "en-US";
