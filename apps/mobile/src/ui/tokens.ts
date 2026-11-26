import { Platform } from "react-native";
import { isRTL } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { THEMES, themeOf, type ThemeId } from "./themes";

/**
 * Zaki's design tokens: a near-white page with a barely-there glow of the theme in one corner
 * (src/ui/glass.tsx), clean white surfaces with a hairline edge and a soft neutral shadow,
 * rounded geometry. Colour is for the main button, the active tab, small icons and status. The accent family comes from the theme the user picked
 * (src/ui/themes.ts); it is read once at start-up, and changing it reloads the app.
 */
export const themeId: ThemeId = themeOf(prefs.get("theme"));
const th = THEMES[themeId];

const SURFACE = "rgba(255,255,255,0.9)";
const EDGE = "rgba(24,22,32,0.07)";

export const palette = {
  ...th,
  /** Solid version of the page colour, for the moment before the mesh image draws. */
  ground: th.bg,
  /** Screens are see-through so the colour mesh behind the app shows. */
  bg: "transparent",
  /** Cards: white, a touch see-through so the ground's tint carries, with a hairline edge (`glassEdge`). */
  surface: SURFACE,
  surfaceStrong: "rgba(255,255,255,0.96)",
  surfaceSolid: "#FFFFFF",
  /** The hairline around a surface and under a header: neutral, so it reads on white and on the ground. */
  glassEdge: EDGE,
  /** A quiet fill inside a white card (a progress track, a note, a day pill). */
  wash: "rgba(24,22,32,0.045)",
  /** Session's ground before its image draws. */
  calmGround: "#FAFAFD",
  primarySoftGlass: th.primarySoft + "CC",
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
export const radius = { sm: 12, md: 14, lg: 22, xl: 28, pill: 999 } as const;

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

/** The theme's colour at an alpha: only for the main button's glow and the focus ring. */
const tint = (alpha: number) => {
  const h = th.primary.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
};
/** Depth is neutral and soft: a card lifts off the page by a hair, never by a coloured glow. */
export const shadow = {
  card: { boxShadow: "0px 1px 2px rgba(24, 22, 32, 0.04), 0px 4px 14px rgba(24, 22, 32, 0.035)" },
  raised: { boxShadow: "0px 2px 6px rgba(24, 22, 32, 0.05), 0px 14px 34px rgba(24, 22, 32, 0.10)" },
  button: { boxShadow: `0px 4px 12px ${tint(0.2)}` },
  /** A soft ring in the theme's colour around the box being typed in. */
  focus: { boxShadow: `0px 0px 0px 3px ${tint(0.16)}` },
} as const;

/**
 * A surface: white with a hairline edge and a soft neutral shadow. (The name stays from the
 * frosted look it replaced; every card, row and bar spreads it.)
 */
export const glass = {
  backgroundColor: SURFACE,
  borderWidth: 1,
  borderColor: EDGE,
  ...shadow.card,
  ...(Platform.OS === "web" ? ({ backdropFilter: "blur(18px)" } as object) : null),
} as const;

/**
 * Text that should start on the reading side. The phone flips "left" in RTL by itself; the
 * browser does not, so the web preview asks for "right" explicitly.
 */
export const textStart: "left" | "right" = Platform.OS === "web" && isRTL ? "right" : "left";
export const textEnd: "left" | "right" = textStart === "left" ? "right" : "left";

export const minTouch = 48;
