import { isRTL, language } from "@/i18n";

// The browser lays out right-to-left from the document's `dir`, not from I18nManager.
if (typeof document !== "undefined") {
  document.documentElement.dir = isRTL ? "rtl" : "ltr";
  document.documentElement.lang = language === "ar-EG" ? "ar" : "en";
}
