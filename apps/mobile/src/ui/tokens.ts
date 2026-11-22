import { Platform } from "react-native";
import { isRTL } from "@/i18n";

/**
 * Zaki's design tokens. The world: an Egyptian home in late-afternoon light. A warm sand
 * ground, Zaki's apricot for what he does, Nile green for family, saffron for friends and a
 * calm dusk violet for Session. Every text colour here passes 4.5:1 on `bg` and `surface`.
 */
export const palette = {
  bg: "#FBF6EF",
  surface: "#FFFFFF",
  surfaceAlt: "#F4ECE2",
  line: "#E9DED1",
  lineStrong: "#D8C9B8",
  ink: "#2A211C",
  inkSoft: "#5C4F46",
  inkFaint: "#776A60",
  primary: "#C2552C",
  primaryPressed: "#A64623",
  onPrimary: "#FFFFFF",
  primarySoft: "#FBE7DC",
  primaryInk: "#9A3F1C",
  family: "#1D6B66",
  familySoft: "#DDEFEC",
  friends: "#94600F",
  friendsSoft: "#FAEDD3",
  calm: "#5B4F9E",
  calmSoft: "#ECE9F7",
  ok: "#2B7A4B",
  okSoft: "#E2F2E7",
  warn: "#8F5F00",
  warnSoft: "#FFF1CC",
  danger: "#B3261E",
  dangerSoft: "#FBE5E3",
  whatsapp: "#1D8A4B",
  scrim: "rgba(42,33,28,0.45)",
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const fonts = {
  display: "Alexandria_700Bold",
  displaySemi: "Alexandria_600SemiBold",
  body: "IBMPlexSansArabic_400Regular",
  bodyMedium: "IBMPlexSansArabic_500Medium",
  bodySemi: "IBMPlexSansArabic_600SemiBold",
  bodyBold: "IBMPlexSansArabic_700Bold",
} as const;

/** Type roles (Material-style), sized for Arabic: generous line height, no letter-spacing. */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 28, lineHeight: 40 },
  title: { fontFamily: fonts.displaySemi, fontSize: 21, lineHeight: 32 },
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

/** Soft, warm shadow with a real offset (cards and the composer). */
export const shadow = {
  card: { boxShadow: "0px 3px 12px rgba(92, 60, 34, 0.07)" },
  raised: { boxShadow: "0px 8px 24px rgba(92, 60, 34, 0.14)" },
} as const;

/**
 * Text that should start on the reading side. The phone flips "left" in RTL by itself; the
 * browser does not, so the web preview asks for "right" explicitly.
 */
export const textStart: "left" | "right" = Platform.OS === "web" && isRTL ? "right" : "left";
export const textEnd: "left" | "right" = textStart === "left" ? "right" : "left";

export const minTouch = 48;
