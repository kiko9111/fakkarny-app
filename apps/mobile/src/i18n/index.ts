import { getLocales } from "expo-localization";
import { pickLanguage } from "./pick";
import { strings } from "./strings";

// M1: language follows the device. M5 adds the in-app language setting (F10).
export const language = pickLanguage(getLocales().map((l) => l.languageTag));
export const t = strings[language];
export const isRTL = language === "ar-EG";
