/**
 * Colour themes the user picks (welcome screen, Settings). Each one is soft and positive on
 * a clean, Apple-like structure: white surfaces on a lightly tinted grouped background,
 * hairline separators, one accent. Family, friends and Session keep their own colours in
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
    bg: "#FBF7F3",
    surfaceAlt: "#F5EEE7",
    line: "#EFE6DD",
    lineStrong: "#E0D3C6",
    ink: "#2B2320",
    inkSoft: "#6B5F58",
    inkFaint: "#857870",
    primary: "#E06438",
    primaryPressed: "#C9552C",
    primarySoft: "#FFEADF",
    primaryInk: "#A9461E",
    zakiBody: "#FFC36B",
    zakiRim: "#FFAE52",
    zakiFace: "#5A3420",
    zakiCheek: "#FF8C6B",
  },
  mint: {
    bg: "#F4F9F7",
    surfaceAlt: "#E9F4F0",
    line: "#E0EEE9",
    lineStrong: "#CBE2DA",
    ink: "#1D2B28",
    inkSoft: "#56706A",
    inkFaint: "#6F8A84",
    primary: "#1E9E85",
    primaryPressed: "#17866F",
    primarySoft: "#DDF4EE",
    primaryInk: "#12705E",
    zakiBody: "#8EE3CB",
    zakiRim: "#5CCDB2",
    zakiFace: "#134A40",
    zakiCheek: "#FF9FA8",
  },
  cloud: {
    bg: "#F7F5FB",
    surfaceAlt: "#EFEBF8",
    line: "#E8E3F3",
    lineStrong: "#D6CEEA",
    ink: "#262236",
    inkSoft: "#625C78",
    inkFaint: "#7D7692",
    primary: "#7B61E8",
    primaryPressed: "#6A50D6",
    primarySoft: "#EEE9FE",
    primaryInk: "#5B43C4",
    zakiBody: "#C8B9FB",
    zakiRim: "#AE9AF5",
    zakiFace: "#3E2A6E",
    zakiCheek: "#FFA9C6",
  },
};

export const themeOf = (value: string | null | undefined): ThemeId => (THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : DEFAULT_THEME);
