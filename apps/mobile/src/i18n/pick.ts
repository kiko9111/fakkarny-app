import { DEFAULT_LANGUAGE, type Language } from "@fakkarni/shared";

/**
 * Map device locale tags (e.g. "ar-SA", "en-GB", "fr") to a supported app language.
 * Any Arabic locale gets Egyptian Arabic for now (Gulf/MSA come later, PRD §7);
 * unknown languages fall back to the default (ar-EG).
 */
export function pickLanguage(localeTags: readonly (string | null | undefined)[]): Language {
  for (const tag of localeTags) {
    const lang = tag?.toLowerCase().split(/[-_]/)[0];
    if (lang === "ar") return "ar-EG";
    if (lang === "en") return "en";
  }
  return DEFAULT_LANGUAGE;
}
