/**
 * Colour themes the user picks (welcome screen, Settings). Each one is a light, playful ground in
 * the theme's hues under translucent white cards (owner, 2026-11-27: the first playful look merged
 * with the calm one). Ink is near-black; the theme's colour is for the one filled button, the
 * active tab, numbers on tiles and quiet buttons. Family, friends, Session and the by-kind icon
 * colours (tokens.ts `kind`) are the same in every theme so they read the same everywhere.
 */
export type ThemeId = "sunrise" | "mint" | "cloud";
export const THEME_IDS: ThemeId[] = ["sunrise", "mint", "cloud"];
export const DEFAULT_THEME: ThemeId = "sunrise";

export interface ThemeColors {
  bg: string;
  surfaceAlt: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primaryInk: string;
  zakiBody: string;
  zakiRim: string;
  zakiFace: string;
  zakiCheek: string;
}

export const THEMES: Record<ThemeId, ThemeColors> = {
  sunrise: {
    bg: "#FFFAF5",
    surfaceAlt: "#F8F0EA",
    line: "#F1E8E1",
    lineStrong: "#E6DAD0",
    ink: "#1D1B1A",
    inkSoft: "#5E5955",
    inkFaint: "#6C6762",
    primary: "#CE491A",
    primaryPressed: "#B53E14",
    primarySoft: "#FFE9DD",
    primaryInk: "#A9461E",
    zakiBody: "#FFC36B",
    zakiRim: "#FFAE52",
    zakiFace: "#5A3420",
    zakiCheek: "#FF8C6B",
  },
  mint: {
    bg: "#F7FCFA",
    surfaceAlt: "#EAF4F1",
    line: "#E2EEEA",
    lineStrong: "#D0E0DA",
    ink: "#1A1C1B",
    inkSoft: "#565D5A",
    inkFaint: "#646A68",
    primary: "#12856E",
    primaryPressed: "#0F7460",
    primarySoft: "#E4F5F0",
    primaryInk: "#12705E",
    zakiBody: "#8EE3CB",
    zakiRim: "#5CCDB2",
    zakiFace: "#134A40",
    zakiCheek: "#FF9FA8",
  },
  cloud: {
    bg: "#FAF8FF",
    surfaceAlt: "#F0EDFA",
    line: "#E9E5F4",
    lineStrong: "#DAD4EA",
    ink: "#1B1A1F",
    inkSoft: "#5A5864",
    inkFaint: "#65646E",
    primary: "#7659E6",
    primaryPressed: "#6548D4",
    primarySoft: "#F0ECFE",
    primaryInk: "#5B43C4",
    zakiBody: "#C8B9FB",
    zakiRim: "#AE9AF5",
    zakiFace: "#3E2A6E",
    zakiCheek: "#FFA9C6",
  },
};

export const themeOf = (value: string | null | undefined): ThemeId => (THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : DEFAULT_THEME);
