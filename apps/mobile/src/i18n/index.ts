import { I18nManager } from "react-native";
import { getLocales } from "expo-localization";
import type { Language } from "@fakkarni/shared";
import { prefs } from "@/lib/prefs";
import { pickLanguage } from "./pick";
import { layoutStrings } from "./layout";
import { strings } from "./strings";
import { currencyOf } from "@fakkarni/shared";
import { withCurrency } from "./currency";

// The user's choice (settings/onboarding) wins over the device language.
const chosen = prefs.get("language");
export const language: Language = chosen === "en" || chosen === "ar-EG" ? chosen : pickLanguage(getLocales().map((l) => l.languageTag));
// `t.lay.<area>.<key>`: the layout rebuild's words, one file per area (src/i18n/layout).
// Money words follow the city the user picked (riyals in Jeddah); changing the city reloads the app.
export const currency = currencyOf(prefs.get("city"));
export const t = withCurrency({ ...strings[language], lay: layoutStrings(language) }, currency);
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
