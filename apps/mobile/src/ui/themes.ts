/**
 * Colour themes the user picks (welcome screen, Settings). Each one is the same calm,
 * near-white page (owner note, 2026-11-27: "match Apple and Muse, with a slight tint"): the ground
 * and the greys lean a hair towards the theme, ink is near-black, and the theme's colour itself
 * is kept for the one filled button, the active tab, small icons and status. Family, friends and Session keep their own colours in
 * every theme so they read the same everywhere.
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
    bg: "#FBFAF8",
    surfaceAlt: "#F3F1EE",
    line: "#ECE9E5",
    lineStrong: "#DCD8D2",
    ink: "#1D1B1A",
    inkSoft: "#5E5955",
    inkFaint: "#75706B",
    primary: "#E06438",
    primaryPressed: "#C9552C",
    primarySoft: "#FFEFE6",
    primaryInk: "#A9461E",
    zakiBody: "#FFC36B",
    zakiRim: "#FFAE52",
    zakiFace: "#5A3420",
    zakiCheek: "#FF8C6B",
  },
  mint: {
    bg: "#F9FBFA",
    surfaceAlt: "#F0F3F2",
    line: "#E7EBE9",
    lineStrong: "#D6DCD9",
    ink: "#1A1C1B",
    inkSoft: "#565D5A",
    inkFaint: "#6E7572",
    primary: "#1E9E85",
    primaryPressed: "#17866F",
    primarySoft: "#E4F5F0",
    primaryInk: "#12705E",
    zakiBody: "#8EE3CB",
    zakiRim: "#5CCDB2",
    zakiFace: "#134A40",
    zakiCheek: "#FF9FA8",
  },
  cloud: {
    bg: "#FAFAFC",
    surfaceAlt: "#F2F1F6",
    line: "#EAE9EF",
    lineStrong: "#D9D7E1",
    ink: "#1B1A1F",
    inkSoft: "#5A5864",
    inkFaint: "#72707C",
    primary: "#7B61E8",
    primaryPressed: "#6A50D6",
    primarySoft: "#F0ECFE",
    primaryInk: "#5B43C4",
    zakiBody: "#C8B9FB",
    zakiRim: "#AE9AF5",
    zakiFace: "#3E2A6E",
    zakiCheek: "#FFA9C6",
  },
};

export const themeOf = (value: string | null | undefined): ThemeId => (THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : DEFAULT_THEME);
