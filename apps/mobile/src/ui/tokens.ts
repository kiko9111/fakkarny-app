import { Platform } from "react-native";
import { isRTL } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { THEMES, themeOf, type ThemeId } from "./themes";

/**
 * Zaki's design tokens: soft, positive colours on a clean structure (white surfaces, tinted
 * grouped background, hairlines, one accent). The accent family comes from the theme the
 * user picked (src/ui/themes.ts); it is read once at start-up, and changing it reloads the app.
 */
export const themeId: ThemeId = themeOf(prefs.get("theme"));
const th = THEMES[themeId];

export const palette = {
  ...th,
  surface: "#FFFFFF",
  onPrimary: "#FFFFFF",
  family: "#1F7A6E",
  familySoft: "#E0F2EE",
  friends: "#9A600E",
  friendsSoft: "#FCEFD8",
  calm: "#6650C8",
  calmSoft: "#EEEBFA",
  ok: "#2B7A4B",
  okSoft: "#E3F4E9",
  warn: "#8F5F00",
  warnSoft: "#FFF3D1",
  danger: "#C0362C",
  dangerSoft: "#FDE8E6",
  whatsapp: "#1D8A4B",
  scrim: "rgba(20,16,30,0.40)",
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 10, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const fonts = {
  display: "IBMPlexSansArabic_700Bold",
  displaySemi: "IBMPlexSansArabic_600SemiBold",
  body: "IBMPlexSansArabic_400Regular",
  bodyMedium: "IBMPlexSansArabic_500Medium",
  bodySemi: "IBMPlexSansArabic_600SemiBold",
  bodyBold: "IBMPlexSansArabic_700Bold",
} as const;

/** Type roles in the Apple manner (large title, title, headline, body), sized for Arabic. */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 42 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 32 },
  headline: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 25 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  smallStrong: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 21 },
  caption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22 },
  number: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38 },
} as const;
export type TypeRole = keyof typeof type;

/** Barely-there depth: grouped cards sit flat, floating things lift a little. */
export const shadow = {
  card: { boxShadow: "0px 1px 2px rgba(20, 16, 30, 0.04)" },
  raised: { boxShadow: "0px 8px 24px rgba(20, 16, 30, 0.10)" },
} as const;

/**
 * Text that should start on the reading side. The phone flips "left" in RTL by itself; the
 * browser does not, so the web preview asks for "right" explicitly.
 */
export const textStart: "left" | "right" = Platform.OS === "web" && isRTL ? "right" : "left";
export const textEnd: "left" | "right" = textStart === "left" ? "right" : "left";

export const minTouch = 48;
